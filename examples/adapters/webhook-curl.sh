#!/usr/bin/env bash
# examples/adapters/webhook-curl.sh
#
# Reference shell adapter for wiring htmd Phase 3 routing into any agent
# harness that can shell out and POST JSON. Mirrors the structure of the
# Node adapters in this directory, but written in bash so it drops into
# Stop-hook setups that don't run Node.
#
# Pipeline (per outbound assistant turn):
#
#   stdin (raw assistant text)
#     → htmd normalize --json
#     → htmd route --render --transport webhook
#     → if action=inline: print the markdown back, let the harness send it
#     → if action=page:   suppress inline send and emit a control line that
#                         the harness recognizes. The `webhook` transport
#                         already POSTed the publish envelope to
#                         $HTMD_WEBHOOK_URL and forwarded the response;
#                         the user opens the URL from there.
#
# Env knobs:
#   HTMD_BIN                — path to the htmd CLI (default: htmd)
#   HTMD_TRANSPORT          — override the transport name (default: webhook)
#   HTMD_WEBHOOK_URL        — receiver URL (required)
#   HTMD_WEBHOOK_HEADERS    — JSON object of extra request headers, e.g.
#                             '{"Authorization":"Bearer …"}'
#   HTMD_WEBHOOK_TIMEOUT_MS — request timeout, default 10000
#   HTMD_WEBHOOK_RETRIES    — retries on 5xx / network error, default 0
#
# Failure handling: if the webhook POST fails (4xx, 5xx after retries,
# or timeout), `htmd route` returns action=inline with
# reason=transport-failure and an `inlinePrefix` like
# `(htmd page failed: webhook-4xx 401 …)`. The adapter then delivers the
# inline body with that prefix so the user always sees something.
#
# jq is required to parse the decision JSON.

set -euo pipefail

HTMD_BIN="${HTMD_BIN:-htmd}"
TRANSPORT="${HTMD_TRANSPORT:-webhook}"

if [[ -z "${HTMD_WEBHOOK_URL:-}" ]]; then
  # No URL configured — punt: pass stdin through unchanged so the
  # harness still delivers something.
  cat
  exit 0
fi

raw="$(cat)"
if [[ -z "${raw// /}" ]]; then
  printf '%s' "$raw"
  exit 0
fi

# 1. Normalize.
norm_json="$("$HTMD_BIN" normalize --json <<<"$raw")"
markdown="$(jq -r '.markdown' <<<"$norm_json")"

# 2. Route + render.
route_args=(route --render --transport "$TRANSPORT" --slug reply)
# Cheap intent sniff — same heuristic the cursor adapter uses.
if grep -Eiq 'approve\??|ship it\??|ok to (push|deploy|merge)' <<<"$markdown"; then
  route_args+=(--needs-approval)
fi

decision="$("$HTMD_BIN" "${route_args[@]}" <<<"$markdown")"
action="$(jq -r '.action' <<<"$decision")"

if [[ "$action" == "inline" ]]; then
  prefix="$(jq -r '.inlinePrefix // empty' <<<"$decision")"
  body="$(jq -r '.inlineBody // empty' <<<"$decision")"
  [[ -z "$body" ]] && body="$markdown"
  if [[ -n "$prefix" ]]; then
    printf '%s\n\n%s' "$prefix" "$body"
  else
    printf '%s' "$body"
  fi
  exit 0
fi

# action == page. The webhook transport has already POSTed the publish
# envelope to HTMD_WEBHOOK_URL and returned { id, url, submitEndpoint }.
# Emit a control line keyed on the transport name so harnesses that
# share the regex with the cowork / cursor adapters can dispatch.
id="$(jq -r '.rendered.id' <<<"$decision")"
url="$(jq -r '.rendered.url' <<<"$decision")"
submit="$(jq -r '.rendered.submitEndpoint' <<<"$decision")"

printf '[[htmd:page transport=webhook id=%s url=%s submit=%s]]\n' "$id" "$url" "$submit"
