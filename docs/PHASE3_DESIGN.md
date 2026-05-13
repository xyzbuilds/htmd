# htmd Phase 3 — routing + transport (design)

Drafted 2026-05-12 from a Telegram conversation between Xuyang and Watson
(OpenClaw/Claude Opus 4.7) following the v0.4 Mini App ship.

## Why Phase 3 exists

v0.3 added the **submit pipeline** (`htmd serve` + delivery modes).
v0.4 added the **Mini App** entry path for Telegram.

Both are great when the agent **chose** to compose an htmd page. But the
agent has to remember to make that choice, every turn. In practice it
doesn't: short replies go to Telegram as plain text and are fine, but
long replies, tables, plans, and approval requests *also* go as plain
text — and Telegram's plain text rendering is a poor surface for any of
those.

A symptom: 2026-05-12, an OpenClaw subagent emitted Telegram-flavored
HTML (`<code>…</code>`, `<b>…</b>`) directly into a chat reply. OpenClaw's
outbound formatter assumes the agent emits Markdown, runs
`markdownToTelegramHtml()` in safe mode, and *HTML-escaped* the literal
tags — so the user saw `<code>v0.4.0</code>` as visible characters. The
deeper lesson isn't "tell the agent to emit Markdown"; it's that
**format choices made per-turn by the agent will keep failing**. The
medium needs a router.

Phase 3 makes htmd that router.

## Design goals

1. **Per-turn routing without agent thought.** A deterministic
   "should this go inline or to an htmd page?" decision sits between
   the agent and the channel.
2. **Agent-agnostic.** OpenClaw is one consumer. Claude Code / Claude
   Desktop cowork is another. VS Code / Cursor / Aider / Codex CLI are
   future consumers. The bulk of routing + rendering + reply lives in
   htmd; each agent gets a thin adapter.
3. **Boring v1, smart later.** Length + structure sniff + explicit
   intent flag covers ~90% of cases. Don't ship a content classifier
   in v1; it makes the tool unpredictable.
4. **Transport as a first-class interface.** The reply path (user
   interacts on the htmd page → agent learns about it) is where
   "generic" tools usually leak their first consumer's assumptions.
   Bake the abstraction in from day 1, even if only one transport
   exists.
5. **Input normalization.** Whatever the agent emits — Markdown,
   already-rendered HTML, plain text — htmd canonicalizes to a single
   internal form. No "raw tags showed up in chat" regressions per
   adapter.

## Non-goals (for Phase 3)

- Hosted multi-tenant variant. The "approval/review hub with auth and
  audit" is a real future direction (see [Hosting](#hosting-future-not-v05))
  but explicitly out of v0.5. Local-only is the only target.
- Smart content classification. No ML, no heuristic chains beyond the
  three deterministic rules.
- Streaming partial renders. The router operates on completed agent
  messages.

## Architecture

```
┌─────────────┐    ┌──────────────────────────────────────┐    ┌────────────┐
│  Any agent  │───►│              htmd (core)             │───►│ Any channel │
│  (OpenClaw, │    │  ┌──────────┐  ┌────────┐  ┌────────┐│    │  (Telegram,│
│   Claude    │    │  │ normalize│─►│ route  │─►│ render ││    │   cowork,  │
│   Code/     │    │  │  input   │  │ decide │  │  page  ││    │   VS Code, │
│   Desktop,  │    │  └──────────┘  └────────┘  └────────┘│    │   stdio…)  │
│   …)        │    │       │            │           │     │    │            │
│             │    │       │            │           ▼     │    │            │
│             │◄───┤       │            └──────► transport│    │            │
│             │    │       │                     (reply)  │    │            │
└─────────────┘    └──────────────────────────────────────┘    └────────────┘
                              ▲                                       │
                              └───────────────────────────────────────┘
                                       user submission
```

Three core pieces:

### 1. Input normalization (`htmd normalize`)

Takes whatever the agent emits and canonicalizes to **CommonMark
Markdown with a small set of htmd extensions**. Detects format:

- Already CommonMark → pass through.
- Telegram-flavored HTML (small tag subset) → convert to Markdown via
  the existing `turndown` path.
- GitHub-flavored Markdown → preserve tables/fenced blocks.
- Plain text → wrap as-is.

Run as a CLI (`htmd normalize < input.txt > out.md`) and as a library
(`normalize(input, {hint?}) → string`). Cheap; every routing decision
starts here.

### 2. Routing (`htmd route`)

Takes normalized Markdown plus optional intent flags. Returns a JSON
decision.

**Inputs:**

```bash
htmd route \
  --input message.md \
  [--length-threshold 1500] \
  [--needs-approval] \
  [--prefer-inline] \
  [--prefer-page]
```

**Output (stdout, single JSON object):**

```json
{
  "action": "inline" | "page",
  "reason": "length>threshold" | "contains-table" | "contains-fenced" | "intent:needs-approval" | "prefer-page" | "below-thresholds",
  "input": { "format": "markdown", "chars": 2412 },
  "rendered": null
}
```

Or, when `action: "page"` and `--render` is passed:

```json
{
  "action": "page",
  "reason": "contains-table",
  "rendered": {
    "path": "/Users/xy/.htmd/renders/abc.html",
    "url":  "http://100.70.189.117:8787/r/abc",
    "id":   "abc"
  }
}
```

**Decision rules (v1, in order):**

1. `--prefer-inline` → `inline`.
2. `--needs-approval` → `page` (and render with a reply control).
3. `--prefer-page` → `page`.
4. Contains a Markdown table or a fenced code block longer than N lines
   → `page`.
5. `chars > --length-threshold` (default 1500) → `page`.
6. Otherwise → `inline`.

Deterministic, dumb on purpose, easy to debug. Future versions can add
more rules; the contract is stable.

### 3. Transport interface

The reply path is where genericity dies first, so it gets a real
contract.

A transport is a small module — a Node ESM file or an npm package
named `htmd-transport-<name>` — that exports:

```ts
export interface HtmdTransport {
  name: string;

  /** Called when htmd-route picks `action: "page"`. */
  publish(payload: {
    id: string;            // unique submission id
    renderedHtml: string;  // the full page
    meta: Record<string, string>; // submit meta tags etc.
  }): Promise<{
    url: string;           // where the human will see it
    submitEndpoint: string;// where the page POSTs back to
  }>;

  /** Called by htmd's submit endpoint when the user interacts. */
  deliver(submission: {
    id: string;
    action: string;        // "approve" | "edit" | custom
    payload: unknown;      // form data, edited markdown, etc.
  }): Promise<{ ok: boolean; detail?: string }>;
}
```

**Reference transports for v0.5:**

| Transport | Publish | Deliver |
|---|---|---|
| `stdio` | write rendered HTML to `~/.htmd/renders/<id>.html`, print URL | append `{id, action, payload}` newline-JSON to a configured FIFO/file the agent watches |
| `openclaw-telegram` | write to renders dir, send Telegram inline-keyboard with `web_app` URL | SSH-shell `openclaw agent --message ...` (today's behavior) |
| `cowork-mcp` | write to renders dir, open local URL | POST `{id, action, payload}` to Claude Code's MCP control surface so it shows up as a user turn in the cowork session |

Each transport file is ~50-100 lines. Adding a new agent = writing one
transport. The router and renderer never change.

### Adapter convention

A "harness adapter" is the glue an agent harness uses to wire htmd in.
It is *not* part of htmd. Concretely, for OpenClaw the adapter is a
Stop-hook (or `outbound-message-hook`) that:

1. Reads the assistant's outbound text.
2. Pipes it through `htmd normalize`.
3. Pipes the result through `htmd route --render --transport openclaw-telegram`.
4. If `action: "inline"`, lets OpenClaw deliver normally.
5. If `action: "page"`, suppresses the inline send and lets the
   transport publish (which sends a `web_app` button to Telegram).

For Claude Code / Desktop cowork the adapter is similar but uses
`--transport cowork-mcp`. The hook is ~20 lines per harness.

## Hosting (future, not v0.5)

The interfaces above don't preclude a hosted variant. A
`htmd-transport-hosted` would `POST` rendered HTML to a remote htmd
service (cloud-run, fly.io, self-hosted) that handles:

- Authenticated review links (per-user / per-team).
- Audit log of who approved / edited what and when.
- Persistent state for long-running review queues.
- Multi-user routing (assign a review to Alice; fall back to Bob).

This becomes a real product. v0.5 ensures the transport contract is
strong enough that the hosted variant is a drop-in addition rather
than a rewrite.

## Open questions for Phase 3

1. **Where does the routing config live?** Per-repo `htmd.config.json`,
   global `~/.htmd/config.json`, or env vars? Suggest a layered scheme
   (env > repo > global) but pick before implementation.
2. **How does the agent pass intent flags?** Today the only path is
   the harness adapter inspecting the message for hints (e.g.,
   "Approve?" → `--needs-approval`). A cleaner future path: agents
   write fenced metadata blocks (`<!-- htmd: needs-approval -->`) that
   `htmd normalize` strips and surfaces as flags. Defer until v0.6.
3. **Streaming.** Currently the router runs on completed messages.
   Streaming adapters would need partial-render UX (e.g., page that
   updates as the agent writes). Out of v0.5 scope.
4. **Failure mode for transport.publish().** If publish throws, fall
   back to inline? Or surface the error to the user via the harness?
   Recommend: fall back to inline with a one-line "(htmd page failed:
   …)" prefix.

## Inspirations / prior art for routing

- **Telegram bots that auto-paste long output to a paste service.** The
  cutover decision is similar; htmd's twist is the page is *interactive*
  not just a viewer.
- **The OpenAI/Anthropic "code interpreter" model** — agent produces
  an artifact, host renders it. Same shape, different artifact type.
- **Slack's "open in canvas"** behavior for long replies.

## What stays unchanged from v0.4

- The template system, `htmd compose`, the Mini App entry, the
  existing `serve.js` delivery modes, the `--serve` flag. Phase 3 is
  additive — `htmd route` is a new command and a thin layer above the
  existing rendering, not a rewrite.
