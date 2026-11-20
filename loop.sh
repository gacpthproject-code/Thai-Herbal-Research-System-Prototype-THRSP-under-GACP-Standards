#!/usr/bin/env bash
# loop.sh — Ralph loop driver (HARNESS.md §1).
# Each iteration: feed CLAUDE.md + the active mission PROMPT to the agent,
# then verify with scripts/check-done.sh. The loop NEVER merges or deploys —
# it stops on all-green (or MAX_ITER) and waits for the operator.
#
# Usage: ./loop.sh [max_iterations]   (default 10)
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
MAX_ITER="${1:-40}"
# Orchestrator mode (PROMPT-W2-AUTONOMOUS-FLOW.md) takes precedence when present;
# otherwise fall back to the first mission prompt as before.
MISSION="$ROOT/PROMPT-W2-AUTONOMOUS-FLOW.md"
[ -f "$MISSION" ] || MISSION="$(ls "$ROOT"/PROMPT-*.md 2>/dev/null | head -1)"
[ -z "$MISSION" ] && { echo "no PROMPT-<mission>.md at repo root"; exit 1; }

for i in $(seq 1 "$MAX_ITER"); do
    echo "=== iteration $i / $MAX_ITER — $(basename "$MISSION") ==="
    bash "$ROOT/scripts/session-check.sh"
    # Non-interactive agent turn: rules + mission. Requires claude CLI on PATH.
    claude -p "$(cat "$ROOT/CLAUDE.md" "$MISSION")" --permission-mode acceptEdits || true
    if bash "$ROOT/scripts/check-done.sh"; then
        # Queue continuation: probes green but QUEUE.md still holds open tasks
        # → keep looping so the orchestrator advances to the next task.
        if grep -qE '\| *`(PENDING|IN_FLIGHT)`' "$ROOT/QUEUE.md" 2>/dev/null; then
            echo "=== probes PASS but QUEUE has open tasks — continuing ==="
            continue
        fi
        echo "=== all probes PASS + QUEUE drained ==="
        echo "=== stopping: operator reviews, merges, and decides the next mission ==="
        exit 0
    fi
    echo "=== probes failed — looping ==="
done
echo "=== MAX_ITER reached without all-green — operator attention required ==="
exit 1
