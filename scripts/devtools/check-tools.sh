#!/usr/bin/env bash
# Verifies installed tool versions against scripts/devtools/versions.env. Prints PASS / FAIL / BLOCKED per tool. No network.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/devtools/versions.env"
rc=0
line(){ printf '%-14s %-8s %s\n' "$1" "$2" "$3"; [ "$2" = FAIL ] && rc=1; true; }

# Gitleaks (project-local or user tools dir)
GL=""; for c in "${GITLEAKS_BIN:-}" "$ROOT/.tools/gitleaks-$GITLEAKS_VERSION/gitleaks" "$HOME/.local/share/clinicalpsm-tools/gitleaks-$GITLEAKS_VERSION/gitleaks"; do [ -n "$c" ] && [ -x "$c" ] && { GL="$c"; break; }; done
if [ -z "$GL" ]; then line gitleaks BLOCKED "not installed (scripts/devtools/install-gitleaks.sh)"; \
elif [ "$("$GL" version 2>/dev/null)" = "$GITLEAKS_VERSION" ]; then line gitleaks PASS "$GITLEAKS_VERSION"; else line gitleaks FAIL "version $("$GL" version 2>&1) != $GITLEAKS_VERSION"; fi

# Graphify (uv tool, PyPI package graphifyy)
if command -v graphify >/dev/null 2>&1; then
  v="$(graphify --version 2>&1 | awk '/graphifyy/ {gsub("v","",$2); print $2}' | head -1)"
  [ -z "$v" ] && v="$(graphify --version 2>&1 | head -1 | awk '{print $2}')"
  [ "$v" = "$GRAPHIFY_VERSION" ] && line graphify PASS "$v" || line graphify FAIL "installed $v != approved $GRAPHIFY_VERSION"
else line graphify BLOCKED "not installed (uv tool install 'graphifyy[sql]==$GRAPHIFY_VERSION')"; fi

# Codebase Memory MCP: version AND binary provenance
CB="$(command -v codebase-memory-mcp || true)"
if [ -z "$CB" ]; then line codebase-memory BLOCKED "not installed"; else
  v="$("$CB" --version 2>&1 | awk '{print $2}' | head -1)"
  sha="$(shasum -a 256 "$CB" | cut -d' ' -f1)"
  if [ "$v" != "$CBM_VERSION" ]; then line codebase-memory FAIL "version $v != $CBM_VERSION"
  elif [ "$sha" = "$CBM_RELEASE_BINARY_SHA256_darwin_arm64" ]; then line codebase-memory PASS "$v (binary matches verified release)"
  else line codebase-memory WARN "version $v but binary sha256 != verified release asset (provenance unverified; see TOOLCHAIN-MANIFEST.md)"; fi
fi

# Superpowers (Claude Code plugin)
P="$HOME/.claude/plugins/installed_plugins.json"
if [ -f "$P" ]; then
  out="$(python3 - "$P" "$SUPERPOWERS_VERSION" "$SUPERPOWERS_COMMIT" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); pl=d.get('plugins',d)
for k,vs in pl.items():
    if k.startswith('superpowers@'):
        for v in vs:
            ok=(v.get('version')==sys.argv[2] and v.get('gitCommitSha')==sys.argv[3])
            print(('PASS' if ok else 'FAIL'), k, v.get('version'), (v.get('gitCommitSha') or '')[:8]); sys.exit(0)
print('BLOCKED not installed')
PY
)"
  line superpowers "${out%% *}" "${out#* }"
else line superpowers BLOCKED "no Claude Code plugin registry"; fi
exit $rc
