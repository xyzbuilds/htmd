# code-diff

Side-by-side or unified diff viewer with per-hunk accept/reject buttons.
Decisions are aggregated into a prompt sent back to the agent.

Schema: `{ files: [{ path, language, before, after }], allow_accept_reject }`.
