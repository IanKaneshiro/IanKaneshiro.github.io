#!/usr/bin/env bash
# Claude Code hooks for the gate (GATE-013).
#
#   gate.sh start   SessionStart: remember HEAD, so the Stop hook can tell whether this
#                   session changed code.
#   gate.sh stop    Stop: if the session changed anything, run the gate. On failure exit 2,
#                   which keeps Claude working. After 3 failed attempts in a row it lets
#                   Claude stop and hands over to Ian with the failures listed.
#
# GATE_CMD overrides the gate command (the scenario tests use it).
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
input=$(cat)
session=$(printf '%s' "$input" | bun -e 'const d = await Bun.stdin.text(); try { process.stdout.write(String(JSON.parse(d || "{}").session_id ?? "")) } catch {}')
GIT_DIR=$(git rev-parse --absolute-git-dir 2>/dev/null) || exit 0
BASE="$GIT_DIR/gate-base-${session:-unknown}"
TRIES="$GIT_DIR/gate-tries-${session:-unknown}"
MAX_TRIES=3
GATE_CMD=${GATE_CMD:-bun run gate}

case "${1:-}" in
  start)
    git rev-parse HEAD >"$BASE" 2>/dev/null || true
    rm -f "$TRIES"
    exit 0
    ;;
  stop)
    changed=""
    [[ -n "$(git status --porcelain)" ]] && changed=1
    [[ -f "$BASE" && "$(cat "$BASE")" != "$(git rev-parse HEAD 2>/dev/null)" ]] && changed=1
    [[ -z "$changed" ]] && exit 0

    output=$(bash -c "$GATE_CMD" 2>&1)
    if [[ $? -eq 0 ]]; then
      rm -f "$TRIES"
      exit 0
    fi

    tries=$(($(cat "$TRIES" 2>/dev/null || echo 0) + 1))
    echo "$tries" >"$TRIES"
    if ((tries > MAX_TRIES)); then
      rm -f "$TRIES"
      failures=$(echo "$output" | grep -E '^(✗|  )' | head -40)
      printf '%s' "Gate still failing after $MAX_TRIES attempts, so Claude stopped and is handing over to Ian.
$failures" | bun -e 'process.stdout.write(JSON.stringify({ systemMessage: await Bun.stdin.text() }) + "\n")'
      exit 0
    fi
    {
      echo "[gate] This session changed code and the gate fails (attempt $tries of $MAX_TRIES). Fix it before finishing."
      echo "Don't loosen a gate, skip a test or edit specs to get there (AGENTS.md)."
      echo
      echo "$output" | tail -80
    } >&2
    exit 2
    ;;
esac
