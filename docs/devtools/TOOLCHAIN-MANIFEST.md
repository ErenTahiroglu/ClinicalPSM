# DEVTOOLS-00 Toolchain Manifest

Machine-readable pins: `scripts/devtools/versions.env`. Verification script: `scripts/devtools/check-tools.sh` (PASS / FAIL / WARN / BLOCKED, no network). Binaries are upgraded **only** through a reviewed maintenance change that edits this file and `versions.env` together; phase transitions refresh indexes, not tools.

Verified on 2026-10-08 against GitHub/PyPI. Privacy summary for all four: none needs production secrets; none is invoked with clinical data; CI uses none of the three agent tools.

| Tool | Official source | Approved version | Licence | Installed how | Verification evidence | Status |
|---|---|---|---|---|---|---|
| Graphify | github.com/Graphify-Labs/graphify (Apache-2.0); PyPI `graphifyy` | **0.9.71** (latest upstream is 0.9.80; not upgraded) | Apache-2.0 | `uv tool` (isolated venv, extra `sql`), entry points `graphify`, `graphify-mcp` in `~/.local/bin` | PyPI metadata project URL points to the repo; wheel sha256 `1400ac3a…4f5f` equals the PyPI digest; every file of the installed `graphify/` package is byte-identical to the wheel (`diff -r` empty); dependency list reviewed (tree-sitter grammars, networkx, numpy, rapidfuzz; LLM SDKs only via optional extras, none installed) | PASS |
| Codebase Memory MCP | github.com/DeusData/codebase-memory-mcp | **0.11.0** (latest release) | MIT | Pre-existing user-level install at `~/.local/bin/codebase-memory-mcp`, MCP server registered in `~/.claude.json`, hooks registered in `~/.claude/settings.json` (both pre-existing, left untouched) | Release asset `…darwin-arm64.tar.gz` sha256 `4dee7f38…2d18` equals `checksums.txt`; `gh attestation verify` against the repo succeeded (exit 0). **The installed binary is NOT byte-identical to the release binary** (size 300,977,552 vs 302,755,632; sha256 `86026ffc…1ef8` vs `a67b7cce…5d48`; both ad-hoc signed, stripped-signature hashes also differ). Its `--version` says 0.11.0. Origin of the installed build is unverified | **WARN: provenance unverified.** The verified release binary is staged at `~/.local/share/clinicalpsm-tools/cbm-0.11.0/` but cannot run while any CBM process is active (CBM refuses a second build, deliberately not bypassed). Owner action: close all Claude/CBM sessions, then replace `~/.local/bin/codebase-memory-mcp` with the staged verified binary (or re-run the official installer after review) |
| Superpowers | github.com/obra/superpowers | **6.4.1** (latest upstream is 6.4.2; not upgraded) | MIT | Official Claude Code plugin `superpowers@claude-plugins-official`, scope user, enabled in `~/.claude/settings.json` | Plugin registry commit `5bf4e780…dd71` equals the commit the upstream annotated tag `v6.4.1` points to | PASS |
| Gitleaks | github.com/gitleaks/gitleaks | **8.30.1** (latest release) | MIT | Pinned release tarball downloaded by `scripts/devtools/install-gitleaks.sh`, sha256 checked against `versions.env` (also against upstream `checksums.txt`); installed to `.tools/` (git-ignored) or `~/.local/share/clinicalpsm-tools/` | Checksum verified for darwin_arm64, darwin_x64, linux_x64. Upstream publishes no provenance attestation for this release (`gh attestation verify` -> 404), so integrity rests on the release checksum file | PASS |

## Side effects reviewed
- **Graphify**: `graphify extract/update` write only `graphify-out/` (git-ignored). `graphify install` / `hook install` (global skill, git hooks) were NOT run; the skill was already installed globally (`~/.claude/skills/graphify`). Git hooks were deliberately not installed: hooks live in the shared `.git/hooks` and would also fire in the CP-00 worktree. `--code-only` performs local AST extraction with no LLM or API key (run with API-key variables unset to prove it).
- **Codebase Memory MCP**: global hooks run `codebase-memory-mcp hook-augment` on `PreToolUse` (Grep|Glob|Bash), `PostToolUse` (Read) and `SessionStart` (startup, resume). `config list`: `auto_index=false`, `auto_watch=true`, `ui_enabled=true` (HTTP UI on 127.0.0.1:9749, local). Indexes live in `~/.cache/codebase-memory-mcp/` (outside the repo). The embedded URL strings point only to its own GitHub repository (update path). Indexing used mode `fast` (no semantic models) and `persistence=false`, so no `.codebase-memory/graph.db.zst` is written into the repo. No project-scoped `.mcp.json` was added: it would duplicate the user-level server registration.
- **Superpowers**: methodology skills only (brainstorming, planning, TDD, debugging, review, verification). No network use by the plugin itself was audited beyond the standard Claude Code plugin loader.
- **Gitleaks**: local CLI. Reports are redacted (`--redact=100`) and git-ignored; CI uploads none.

## Scopes and exclusions
`.graphifyignore` and `.cbmignore` exclude: `node_modules`, build output, `.wrangler`, `dist`, `docs/` and all `*.md` (Graphify), `Derin*/` (owner research), PDFs/office files/CSV/images, `.env*`, `.dev.vars*`, keys, lockfiles, test fixtures, `messages/`. The owner-owned `Derin Araştırma/` directory is not inside this worktree and is excluded by pattern anyway.

## Index statistics (this branch, 2026-10-08)
See `docs/audits/DEVTOOLS-00-INTEGRATION-REPORT.md`.

## Maintenance procedure
1. Open a maintenance branch; read upstream release notes; re-run provenance checks (checksum / attestation / wheel digest / tag commit).
2. Update `versions.env` and this manifest; run `scripts/devtools/check-tools.sh` and the full gate matrix.
3. Red Team review. No automatic updates.
