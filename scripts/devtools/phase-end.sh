#!/usr/bin/env bash
# Phase END protocol. Produces a reproducible evidence block (stdout) for the phase report.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
echo "== 1. approved gates (cumulative matrix)"; node scripts/devtools/gates.mjs --phase "${PHASE:-CF-01}"
echo "== 2. gitleaks (history + tracked + selftest)"
bash scripts/devtools/gitleaks.sh history; echo "history exit=$?"
bash scripts/devtools/gitleaks.sh selftest | tail -1
echo "== 3. graph refresh"; graphify update . 2>&1 | grep -E "Rebuilt"
echo "== 4. impact analysis: run detect_changes (Codebase Memory MCP) against the previous phase branch, and:"
echo "      graphify affected \"<symbol>\" for each changed exported symbol"
echo "== 5. new routes / dependencies / secrets"
git diff --stat "${BASE_REF:-HEAD~1}"..HEAD -- package.json package-lock.json | tail -3
git diff "${BASE_REF:-HEAD~1}"..HEAD --name-only | grep -E "(route|worker|wrangler|workflow)" || echo "(no route/worker/config files changed)"
echo "== 6. diff hygiene"; git diff --check && echo "git diff --check: OK"
