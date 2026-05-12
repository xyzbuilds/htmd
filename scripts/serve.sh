#!/usr/bin/env bash
# scripts/serve.sh — convenience wrapper to start / stop / restart htmd serve.
#
# Loads ~/.htmd/.htmd.env if present so secrets stay out of the repo.
# Daemonises via nohup (no PM2 dep). Logs to ~/.htmd/serve.log; PID at
# ~/.htmd/serve.pid.
#
# Usage:
#   scripts/serve.sh start
#   scripts/serve.sh stop
#   scripts/serve.sh restart
#   scripts/serve.sh status
#   scripts/serve.sh tail        # tail the log
#   scripts/serve.sh foreground  # run in foreground (no daemonise)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${HTMD_ENV_FILE:-$HOME/.htmd/.htmd.env}"
HTMD_DIR="${HTMD_DIR:-$HOME/.htmd}"
PID_FILE="$HTMD_DIR/serve.pid"
LOG_FILE="$HTMD_DIR/serve.log"

mkdir -p "$HTMD_DIR" "$HTMD_DIR/renders"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

PORT="${HTMD_PORT:-8787}"
BIND="${HTMD_BIND:-0.0.0.0}"
MODE="${HTMD_SUBMIT_MODE:-dryrun}"
HTMD_BIN="${HTMD_BIN:-$REPO_DIR/bin/htmd.js}"

# Prefer the homebrew Node on macOS so launchd / a clean PATH still finds v20+.
if [[ -x /opt/homebrew/bin/node ]]; then
  NODE="${NODE:-/opt/homebrew/bin/node}"
else
  NODE="${NODE:-$(command -v node || true)}"
fi

if [[ -z "$NODE" ]]; then
  echo "scripts/serve.sh: no node binary found; install Node 20+ or set NODE=/path/to/node" >&2
  exit 1
fi

is_running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid=$(cat "$PID_FILE" 2>/dev/null || true)
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

cmd="${1:-start}"

case "$cmd" in
  start)
    if is_running; then
      echo "htmd serve already running (pid $(cat "$PID_FILE"))"
      exit 0
    fi
    extra_args=()
    if [[ -n "${HTMD_SUBMIT_TOKEN:-}" ]]; then
      extra_args+=(--token "$HTMD_SUBMIT_TOKEN")
    fi
    nohup "$NODE" "$HTMD_BIN" serve \
      --port "$PORT" \
      --bind "$BIND" \
      --mode "$MODE" \
      --dir "$HTMD_DIR/renders" \
      --log "$LOG_FILE" \
      ${extra_args[@]+"${extra_args[@]}"} \
      >>"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
    sleep 0.3
    if is_running; then
      echo "htmd serve started (pid $(cat "$PID_FILE")) — log: $LOG_FILE"
    else
      echo "htmd serve failed to start; tail $LOG_FILE for details" >&2
      exit 1
    fi
    ;;
  stop)
    if ! is_running; then
      echo "htmd serve not running"
      rm -f "$PID_FILE"
      exit 0
    fi
    pid=$(cat "$PID_FILE")
    kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.3
    done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "stopped"
    ;;
  restart)
    "$0" stop || true
    "$0" start
    ;;
  status)
    if is_running; then
      echo "running (pid $(cat "$PID_FILE"))"
      exit 0
    else
      echo "not running"
      exit 1
    fi
    ;;
  tail)
    tail -F "$LOG_FILE"
    ;;
  foreground|fg)
    exec "$NODE" "$HTMD_BIN" serve \
      --port "$PORT" \
      --bind "$BIND" \
      --mode "$MODE" \
      --dir "$HTMD_DIR/renders" \
      --log "$LOG_FILE"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|tail|foreground}" >&2
    exit 2
    ;;
esac
