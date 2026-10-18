# Progressive CI Widening Matrix

Source of truth: `docs/devtools/gates.json`; runner: `node scripts/devtools/gates.mjs --phase <last approved phase> [--only base|cf01|cp] [--strict]`; workflows: `.github/workflows/{ci,security,gates}.yml`.

Statuses: **PASS**, **FAIL**, **BLOCKED** (prerequisite missing, e.g. browser or pinned tool; fails under `--strict`/CI), **NOT_APPLICABLE** (gate belongs to a phase that is not yet approved; listed on every run so nothing is hidden). An approved-phase gate with no implementation is a **FAIL** ("mandatory gate not implemented"): future gates become mandatory the moment their phase is approved. A passing security gate is never relaxed to obtain green.

| Group | Gate | Phase | Implementation | Status at CF-01 |
|---|---|---|---|---|
| Base | typecheck, lint, unit tests, build | BASE | `tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` | PASS (9/9 base gates, run locally) |
| Base | gitleaks history + self-test | BASE | pinned CLI; baseline lists the known real finding without hiding new ones | PASS (1 known baseline finding reported) |
| Base | `git diff --check` | BASE | `HEAD~1..HEAD` (plus working-tree check at commit time) | PASS |
| Base | dependency inventory | BASE | `dep-inventory.mjs`: lockfile in sync, registry-only sources, integrity hashes, install-script list | PASS |
| Base | CI configuration | BASE | `verify-ci.mjs`: actions pinned to commit SHAs, least privilege, no `pull_request_target`, no `curl | sh`, no LLM keys, no artifact upload next to gitleaks | PASS |
| CF-01 | static-site build | CF-01 | `run-cf-gates.sh static-build` | PASS |
| CF-01 | EN/TR routing, a11y (axe), headers, browser Web Worker on synthetic data, no upload surface | CF-01 | `run-cf-gates.sh site` (75 checks, Playwright) | PASS (local Brave); CI uses Playwright Chromium (not yet executed on GitHub) |
| CF-01 | diagnostic endpoint exposure | CF-01 | artifact inspection + 45 negative HTTP tests on the deployable entry | PASS |
| CF-01 | auth/entitlement contract | CF-01 | 53 contract tests on the test entry (local D1) | PASS |
| CF-01 | Cloudflare Free compatibility | CF-01 | `cf-free-compat.mjs`: no paid bindings/routes/vars, observability off, asset limits | PASS |
| CP-01 | no clinical-data upload paths; client/server trust boundary; local-only results; negative persistence | CP-01 | not implemented | NOT_APPLICABLE (becomes FAIL if CP-01 is approved without implementations) |
| CP-02/03 | pinned R reference tests; matching equivalence; numerical tolerances; missing-value/error states | CP-02, CP-03 | not implemented | NOT_APPLICABLE |
| CP-04 | balance diagnostics; weights/subclass; reporting consistency | CP-04 | not implemented | NOT_APPLICABLE |
| CP-05 | bundle artifacts; document opening/schema; reproducibility | CP-05 | not implemented | NOT_APPLICABLE |
| CP-06 | signed webhooks; replay; ordering; entitlement isolation; refund/reversal; secure checkout | CP-06 | contract in `CF-01-AUTH-AND-ENTITLEMENTS-CONTRACT.md`; PoC mechanics exist, provider-faithful tests do not | NOT_APPLICABLE |
| CP-08 | accessibility; responsive; user journeys; UI regression | CP-08 | static prototype has axe + 375 px checks; final product journeys do not exist | NOT_APPLICABLE |

## CI constraints
- No commercial LLM/API keys and no graph-building service in CI; Graphify and Codebase Memory are developer-machine tools only.
- Gitleaks runs as the pinned, checksum-verified CLI (no third-party action). Findings are redacted; no report artifacts; the log prints rule/file/line/commit only.
- The workflows were validated for structure by `verify-ci.mjs` and executed locally through the same scripts; **they have not run on GitHub Actions yet** (first push will be the first real run; the Cloudflare job additionally installs Playwright Chromium on the runner).
- The pre-existing `ci.yml` kept its steps; it gained a least-privilege `permissions` block and SHA-pinned actions.
