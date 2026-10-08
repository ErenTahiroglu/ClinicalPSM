#!/usr/bin/env bash
# Local developer scanning. Findings are always redacted; reports stay in git-ignored files.
#   scripts/devtools/gitleaks.sh history    scan all reachable git history
#   scripts/devtools/gitleaks.sh tracked    scan the tracked working tree only (clean checkout equivalent)
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
  tracked)
    tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
    git ls-files -z | xargs -0 -I{} cp --parents {} "$tmp" 2>/dev/null || { git ls-files -z | rsync -a --from0 --files-from=- ./ "$tmp/"; }
    "$GL" dir "$tmp" "${common[@]}" --report-path .gitleaks-report-tracked.json --report-format json ;;
  staged) "$GL" git . --staged "${common[@]}" --report-path .gitleaks-report-staged.json --report-format json ;;
  selftest) exec bash scripts/devtools/gitleaks-selftest.sh "$GL" ;;
  *) echo "usage: $0 history|tracked|staged|selftest" >&2; exit 64 ;;
esac
