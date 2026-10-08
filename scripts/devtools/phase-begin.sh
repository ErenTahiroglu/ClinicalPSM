#!/usr/bin/env bash
# Phase START protocol. usage: scripts/devtools/phase-begin.sh <expected-HEAD-sha> [expected-branch]
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
want="${1:?expected HEAD sha}"; wantbr="${2:-}"
echo "== 1-2. HEAD / branch / worktree"; head="$(git rev-parse HEAD)"; br="$(git branch --show-current)"
echo "worktree: $ROOT"; echo "branch:   $br"; echo "HEAD:     $head"; echo "parent:   $(git rev-parse HEAD~1 2>/dev/null)"
[ "$head" = "$want" ] || { echo "FAIL: HEAD != expected $want (stop and report the discrepancy)"; exit 1; }
[ -z "$wantbr" ] || [ "$br" = "$wantbr" ] || { echo "FAIL: branch != $wantbr"; exit 1; }
echo "-- status (research/owner-owned untracked paths are listed, not a failure):"; git status --porcelain=v1 | sed 's/^/   /'
echo "== 3. tool versions vs manifest"; bash scripts/devtools/check-tools.sh || echo "(tool version problem: affected verification loses coverage; do not report PASS for it)"
echo "== 4. Graphify code-only refresh"
if command -v graphify >/dev/null; then env -u GEMINI_API_KEY -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u MOONSHOT_API_KEY graphify update . 2>&1 | grep -E "Rebuilt|error" ; else echo "BLOCKED: graphify missing"; fi
echo "== 5. Codebase Memory index: refresh with the MCP tool index_repository (mode fast, persistence false) from the agent session;"
echo "      then verify with check_index_coverage on changed files (CLI refresh is BLOCKED while another CBM process is active)."
echo "== 6. coverage/freshness: graphify-out/graph.json nodes: $(python3 -c "import json;print(len(json.load(open('graphify-out/graph.json'))['nodes']))" 2>/dev/null || echo n/a)"
echo "== 7. baseline gates"; node scripts/devtools/gates.mjs --phase "${PHASE:-CF-01}" --only base
echo "== 8. pre-existing findings: see .gitleaks-baseline.json (known findings are listed, never hidden)"
