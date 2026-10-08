#!/usr/bin/env bash
# Installs the version-pinned, checksum-verified Gitleaks CLI into .tools/ (git-ignored). No pipe-to-shell, no package manager.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/devtools/versions.env"
os="$(uname -s | tr '[:upper:]' '[:lower:]')"; arch="$(uname -m)"
case "$arch" in x86_64|amd64) arch=x64;; arm64|aarch64) arch=arm64;; esac
key="${os}_${arch}"; var="GITLEAKS_SHA256_${key}"; want="${!var:-}"
[ -n "$want" ] || { echo "BLOCKED: no pinned checksum for $key" >&2; exit 2; }
dest="$ROOT/.tools/gitleaks-$GITLEAKS_VERSION"
if [ -x "$dest/gitleaks" ] && [ "$("$dest/gitleaks" version)" = "$GITLEAKS_VERSION" ]; then echo "gitleaks $GITLEAKS_VERSION already installed: $dest/gitleaks"; exit 0; fi
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
url="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_${key}.tar.gz"
curl -fsSL --retry 3 -o "$tmp/gl.tgz" "$url"
got="$(shasum -a 256 "$tmp/gl.tgz" | cut -d' ' -f1)"
[ "$got" = "$want" ] || { echo "CHECKSUM MISMATCH for $url" >&2; exit 3; }
mkdir -p "$dest"; tar -xzf "$tmp/gl.tgz" -C "$dest" gitleaks
echo "installed gitleaks $("$dest/gitleaks" version) (sha256 verified) at $dest/gitleaks"
