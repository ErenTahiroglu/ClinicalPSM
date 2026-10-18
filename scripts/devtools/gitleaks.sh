#!/usr/bin/env bash
# Local developer scanning. Findings are always redacted; reports stay in git-ignored files.
#   scripts/devtools/gitleaks.sh history    scan all reachable git history
#   scripts/devtools/gitleaks.sh current    scan the tracked working tree with NO baseline (must be zero findings)
#   scripts/devtools/gitleaks.sh known      list accepted historical baseline findings (never hidden)
#   scripts/devtools/gitleaks.sh staged     scan staged changes (pre-commit use)
#   scripts/devtools/gitleaks.sh selftest   prove the scanner detects synthetic secrets and passes benign files
# Exit 0 = no NEW findings (baseline findings are reported loudly but do not hide new ones).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
# shellcheck disable=SC1091
source scripts/devtools/versions.env
resolve() {
  for c in "${GITLEAKS_BIN:-}" "$ROOT/.tools/gitleaks-$GITLEAKS_VERSION/gitleaks" "$HOME/.local/share/clinicalpsm-tools/gitleaks-$GITLEAKS_VERSION/gitleaks"; do
    [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return; }
  done
  echo "BLOCKED: gitleaks $GITLEAKS_VERSION not installed (run scripts/devtools/install-gitleaks.sh)" >&2; return 2
}
GL="$(resolve)"
[ "$("$GL" version)" = "$GITLEAKS_VERSION" ] || { echo "BLOCKED: gitleaks version mismatch (want $GITLEAKS_VERSION)" >&2; exit 2; }
common=(--redact=100 --no-banner --log-level warn --config .gitleaks.toml)
mode="${1:-history}"
case "$mode" in
  history) "$GL" git . "${common[@]}" --baseline-path .gitleaks-baseline.json --report-path .gitleaks-report-history.json --report-format json ;;
  tracked|current)
    # CURRENT TRACKED TREE, NO BASELINE: a known historical finding must never excuse a secret that is still in a current file.
    # Scans exactly the tracked files as they are in the working tree (ignored build output and untracked files are out of scope).
    tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
    git ls-files -z --cached --exclude-standard | tar --null -T - -cf - 2>/dev/null | tar -xf - -C "$tmp"
    "$GL" dir "$tmp" "${common[@]}" --report-path .gitleaks-report-tracked.json --report-format json ;;
  known)
    python3 - <<'PY'
import json,subprocess
b=json.load(open('.gitleaks-baseline.json'))
tracked=set(subprocess.run(['git','ls-files'],capture_output=True,text=True).stdout.split('\n'))
print(f"KNOWN HISTORICAL FINDINGS (accepted baseline, NOT remediation): {len(b)}")
for f in b:
    print(f"  rule={f['RuleID']} file={f['File']} line={f['StartLine']} commit={f['Commit'][:8]} date={f['Date'][:10]} still-tracked={'YES' if f['File'] in tracked else 'no'}")
PY
    ;;
  staged) "$GL" git . --staged "${common[@]}" --report-path .gitleaks-report-staged.json --report-format json ;;
  selftest) exec bash scripts/devtools/gitleaks-selftest.sh "$GL" ;;
  *) echo "usage: $0 history|current|known|staged|selftest" >&2; exit 64 ;;
esac
