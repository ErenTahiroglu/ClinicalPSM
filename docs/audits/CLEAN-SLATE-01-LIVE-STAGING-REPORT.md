# CLEAN-SLATE-01 report: live staging, security closure, cutover readiness

Baseline `5c9006e811f9819ee9a4269d31c6bb44f7b81b87` (`phase/clean-slate-cloudflare`). Working branch `phase/clean-slate-01-staging`. Date 2026-10-08.
Status words: PASS / FAIL / BLOCKED / NOT_RUN. **LIVE** = run against the deployed URL; **LOCAL** = run on this machine.

## 1. Red Team fixes

| Item | Change | Evidence |
|---|---|---|
| A. Privacy wording | Removed the categorical "does not process personal data on a server" and "operator does not receive your IP". Now: Cloudflare processes technical request information; operator enabled no analytics, ads or tracking; Cloudflare standard service-level statistics may still be visible to the operator; no clinical dataset upload, no site-owned accounts/database/behavioural analytics; demo data stays in the browser. No retention periods or certifications stated. EN and TR | `apps/web/src/content.json`; browser tests |
| B. Indexing | Contradictions found and removed: (1) root page was `noindex` even in an indexable build, with no canonical and absent from the sitemap; (2) `robots.txt` used `Disallow: /` together with `noindex`, which hides the directive from crawlers. Now: noindex builds send meta noindex **and** `X-Robots-Tag: noindex, nofollow` on every response, `robots.txt` allows crawling so the directive is seen, no canonical, no sitemap. Indexable builds (`INDEXABLE=1`, production only) drop all noindex signals, add canonical on all 11 pages including root, a sitemap with 11 URLs and a `Sitemap:` line; 404 stays noindex. Default stays noindex | `test/production-build.mjs` 18/18 (LOCAL); live noindex on html, asset, 404 (LIVE) |
| C. Redirect | Runbook rewritten from official Single Redirects docs: wildcard `http*://clinicalpsm.com/*` → `https://www.clinicalpsm.com/${2}` with **Preserve query string enabled**, start at 302, promote to 301 after tests. The previous text built the target from the path only and would have dropped the query. Verifier `verify-cutover.sh --post` now checks path+query, http and https apex, off-host probes, hop chain | `CLOUDFLARE-DOMAIN-CUTOVER.md` §3–4. **The rule itself is untested (NOT_RUN): it cannot be exercised without changing the zone** |
| D. DNS | Rechecked public DNS (below) and wrote an exact change sheet D1–D4 | runbook §0–1 |

DNS observed 2026-10-08, public resolvers: apex A `216.198.79.65`, `64.29.17.65` (earlier `.1` variants, Vercel anycast rotation); `www` CNAME `09e0f8ac8620059b.vercel-dns-017.com`; no AAAA/MX/TXT/CAA; `_dmarc`, `mail`, `api`, `staging`, `app` empty; NS Cloudflare. Same as the CLEAN-SLATE-00 runbook, so the runbook's Vercel pointers are still current and still dangling. The authoritative nameservers did not answer from this network, and the token cannot read the zone's records, so the dashboard table was **not** seen. No DNS change was made.

## 2. Live staging (authorized scope: temporary workers.dev, synthetic data, no bindings)

| Item | Value |
|---|---|
| Resource | Worker `cs01-staging-web-1008b` (new, unique; assets-only; generated local config `wrangler.staging.local.jsonc`, git-ignored) |
| URL | `https://cs01-staging-web-1008b.erentahiroglu.workers.dev` |
| Version id | `66086443-ff30-4ba0-8bc1-036468257e90` |
| Build | preview (noindex, operator/contact placeholders, no HSTS); no identity invented |
| Inventory before | Workers: `erentahiroglu`, `gelir-gider-api`, `cf01-throwaway-static-1008a`, `cf01-throwaway-probe-1008a`; Custom Domain `erentahiroglu.com` → `erentahiroglu`. None touched |
| Settings after (API) | `bindings: []`, `logpush: false`, no tail consumers, workers.dev enabled |
| Upload | 17 files + `_headers`, 0.31 KiB script payload ("No bindings found") |

Not deployed: any diagnostic entry, the custom domain, any route. No secret used.

## 3. Live results

| Suite | Result |
|---|---|
| Real browser (Brave via Playwright), `test/site.mjs` against the live URL | **LIVE PASS 87/87**: EN/TR × 5 pages load 200 with correct `lang`; landmarks; unvalidated banner; **axe 0 violations on all 10 pages**; 375 px viewport without horizontal scroll; keyboard skip link; nav and language switch keep the page; real engine runs in a Web Worker and the synthetic result table renders in EN and TR with unvalidated/synthetic labels; CSP without `unsafe-*`; no console/CSP errors; no third-party request; no upload/form/input/external link; 3 pricing buttons disabled per language and no checkout link; no cookies, no localStorage/sessionStorage |
| HTTP acceptance, `test/live.mjs` | **LIVE PASS 37/37**: all 17 built files byte-identical to local build; 11 pages + robots + worker asset 200; `/en`→307 `/en/` one hop, no loop; unknown path 404 bilingual; 29 sensitive/diagnostic/auth/upload/payment paths (`.env`, `.git`, `wrangler.jsonc`, `/api/*`, `/login`, `security.txt`, `sitemap.xml` …) all 404; POST/PUT/DELETE → 405; 7 open-redirect probes: none leaves the origin (`//evil.example/` → 307 `/evil.example/` on the same host); CSP/nosniff/DENY/no-referrer/permissions-policy/COOP and no `Set-Cookie` on html, asset and 404; `X-Robots-Tag: noindex, nofollow` everywhere; no HSTS; `robots.txt` allows crawl; meta noindex and no canonical on `/`, `/en/`, `/tr/`; no secret-shaped string, legacy backend host or checkout reference in any served file |
| Live findings | (1) `http://` on `workers.dev` answers 200 with no HTTPS redirect. This is workers.dev behaviour; it is acceptable for noindex staging with no sensitive data, but the custom domain must enforce HTTPS (runbook S9, test T3). (2) `previews_enabled: true` on the Worker (preview URLs exist for non-production versions); harmless for static synthetic content, noted. (3) `cf-ray`/`server: cloudflare` reveal the CDN, expected |
| Mobile | viewport emulation at 375 px only; no physical-device test (NOT_RUN) |

## 4. Local verification (LOCAL)

| Check | Result |
|---|---|
| `tsc`, `lint`, unit tests, root build | PASS (gate matrix) |
| Gate matrix BASE 10, CF-01 5, CS-00 5 | all PASS |
| `apps/web` browser tests (local server) | 87/87 PASS |
| Production-build tests | 18/18 PASS |
| `cf-free-compat.mjs --strict-web` | PASS |
| Gitleaks history, current tree, selftest | PASS |
| Gitleaks **negative control**: synthetic key block staged under `.vscode/settings.json` | `gitleaks.sh current` exited **1**; after removal exited 0. Nothing committed; the synthetic string was assembled at run time |
| `git diff --check` | PASS |
| Graphify | 1085 nodes, 2188 edges, 80 communities |
| Codebase Memory | 2576 nodes, 5145 edges; binary-provenance WARN unchanged, binary not replaced |
| GitHub CI on the pushed branch | see §8 (filled after push) |

## 5. Cloudflare Free evidence

- Static assets only: `bindings: []`, no Worker script logic; ordinary page loads need no Worker CPU (docs: static asset requests are free and unlimited).
- Limits: 18 files vs 20,000; largest 5 KiB vs 25 MiB; `_headers` 2 rule blocks vs 100.
- Custom Domains (docs, 2026-09-29): preferred direct Custom Domain on `www`; apex handled by a proxied placeholder A `192.0.2.0` plus a Single Redirect; fallback is a Route on a proxied `www` record. Neither activated.
- Account evidence: Custom Domain `erentahiroglu.com` exists on a Free zone with an issued certificate, so the feature is available to this account on Free. The docs say Custom Domains also create an Advanced Certificate without a separate ACM subscription; **whether that shows a charge for `clinicalpsm.com` is unconfirmed** and is checkpoint S4.
- **Not checkable with the active token:** account plan tier (subscriptions: Authentication error), zone DNS records, SSL mode, Always Use HTTPS, rulesets, existing Redirect Rules. Owner confirms in the dashboard.

## 6. GitHub incident-remediation status

| Branch | Content | State |
|---|---|---|
| `ci/sec-00-main-ci-node24` (2c1b405) | `ci.yml`: Node 24, one line; fixes the `npm ci` lockfile mismatch | ready |
| `security/sec-00-untrack-vscode-main` (fe7f5e7) | `git rm` of `.vscode/settings.json`, `.gitignore` entries | ready; depends on nothing |
| `security/sec-00-untrack-vscode-cp00` (7067f7f) | same on the CP-00 line (45 files incl. migrations 010–012 for the retired stack) | optional; do not merge unless the Supabase line is kept |

Facts: the file is **not** in this branch's deployable tree (`git ls-files .vscode` empty, path ignored). The old credential is still in Git history (baseline holds one redacted finding); it was reset and belonged to a different, deleted project. History is not rewritten. The password was not printed or reused here.

Proposed sequence (each as a PR, CI green, Red Team approval first): **PR0** CI Node 24 → **PR1** untrack `.vscode` on `main` → re-run `gitleaks.sh current` on merged `main` → this phase chain (CS-00, CS-01) as a reviewed PR. PR2 only if needed. Owner settings action, not done by Claude Code: enable GitHub **secret scanning and push protection** (verified still disabled).

## 7. Remaining blockers and risks

1. Owner removes stale DNS (D1/D2) and approves each cutover step. Not done.
2. Owner identity: `OPERATOR_NAME`, `CONTACT_EMAIL` undecided; production build refuses without them.
3. Redirect rule, Custom Domain on `clinicalpsm.com`, certificate cost and HTTPS enforcement are **untested live** until cutover (NOT_RUN).
4. GitHub secret scanning/push protection disabled (owner).
5. Staging Worker `cs01-staging-web-1008b` is left running (public, noindex, static, free). Deleting it, and the older `cf01-throwaway-*` resources, needs the owner's cleanup authorization; not done.
6. Engine remains scientifically UNVALIDATED; legal text is not counsel-reviewed.
7. Codebase Memory provenance WARN remains open.

## 8. Cutover readiness and proposed verdict

Readiness: **ready for owner-operated cutover after** D1/D2, identity, Red Team decision. The runbook has checkpoints S1–S11 and tests T1–T6.

Proposed verdict: **PASS_WITH_FINDINGS_CANDIDATE**. Staging passes completely; open items are all owner/dashboard actions or live checks that cannot be done without changing the zone.
