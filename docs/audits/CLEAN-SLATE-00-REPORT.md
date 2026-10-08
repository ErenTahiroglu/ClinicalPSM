# CLEAN-SLATE-00 report: Cloudflare replatform and legacy retirement preparation

Baseline `3172a7d` (`security/sec-00-r2-operational-containment`). Branch `phase/clean-slate-cloudflare`. Date 2026-10-08.
Local results and live results are labelled separately. Nothing was deployed, no DNS changed, nothing deleted.

## Discoveries that change the plan

1. **Vercel project and Supabase `ClinicalPSM` project are already deleted** (owner statement; public evidence agrees). No backup exists. SEC-00 required backup and written approval first; both were skipped. Customer data did not exist, so the practical loss is the six raw audit rows. See `LEGACY-VERCEL-SUPABASE-RETIREMENT.md`.
2. **Dangling DNS.** `clinicalpsm.com` (A ×2) and `www` (CNAME) still point at Vercel. Both answer `404 DEPLOYMENT_NOT_FOUND`. Takeover risk until removed. This is the first thing to fix and is safe to fix before the new site exists.
3. Production Supabase had open sign-ups and an open Data API before deletion (SEC-00 R2). Preserved as history, moot now.
4. The Cloudflare token available to Claude Code cannot read DNS records, SSL settings or rulesets of the zone. Cutover state was inferred from public DNS only.

## Deliverables

| File | Purpose |
|---|---|
| `docs/architecture/CLEAN-SLATE-00-CLOUDFLARE.md` | architecture, zero-cost validation, risks |
| `docs/operations/CLOUDFLARE-DOMAIN-CUTOVER.md` | prepared cutover, not executed |
| `docs/operations/LEGACY-VERCEL-SUPABASE-RETIREMENT.md` | post-deletion cleanup |
| `docs/operations/cutover/wrangler.cutover.jsonc.example` | template, read by nothing |
| `apps/web/**` | production-shaped static app (EN/TR, 5 pages each) |
| `scripts/devtools/verify-cutover.sh` | read-only DNS/HTTP/TLS verifier |

## Verification (LOCAL unless marked LIVE)

| Check | Result |
|---|---|
| `tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` (root) | PASS (via gate matrix) |
| Base gates (10) | 10 PASS |
| CF-01 gates (5; experiments unchanged) | 5 PASS |
| CS-00 gates (5) | 5 PASS |
| `apps/web` browser tests | 87/87 (EN+TR × 5 pages: load, lang attr, landmarks, banner, axe 0 violations, 375 px, CSP/headers, no third-party, no storage, no upload/forms, pricing buttons disabled, demo runs the real engine in a Web Worker) |
| `--production` fail-closed tests | 16/16 (8 refusal cases, noindex default, sitemap/canonical only if `INDEXABLE=1`, HSTS only if set and never preload/includeSubDomains, security.txt) |
| `cf-free-compat.mjs --strict-web` | OK: assets-only config, no bindings/vars/routes, observability off, 18 files, largest 5 KiB |
| `wrangler deploy --dry-run` | OK, "No bindings found" (no remote call) |
| Gitleaks history / current tree / selftest | PASS (baseline holds one redacted historical finding; current tree has no baseline) |
| Graphify | 1064 nodes, 2158 edges |
| Codebase Memory (project `…ClinicalPSM-cf00`) | 2534 nodes, 5052 edges; installed binary still differs from verified release (WARN, unchanged, not replaced) |
| LIVE `verify-containment.sh` | Vercel PASS (gone), Supabase PASS (host does not resolve), Polar UNKNOWN, **GitHub secret scanning FAIL (disabled)** |
| LIVE `verify-cutover.sh --pre` | INFO: DNS still Vercel, www 404; legacy Supabase host unreachable |

Not run: any deployment, workers.dev included. Browser tests ran against `wrangler dev --local` only. No live Cloudflare behaviour of `clinicalpsm-web` is claimed.

## GitHub integration plan (not executed)

Three remediation branches are pushed, no PR open. Merge order, each as a PR with CI green, no force-push, no history rewrite:

1. **PR0** `ci/sec-00-main-ci-node24` (2c1b405): fixes red main CI (`npm ci` fails on npm 10 / Node 20 with a stale lock; Node 24 uses npm 11).
2. **PR1** `security/sec-00-untrack-vscode-main` (fe7f5e7): untracks `.vscode/settings.json` from main. The file still exists in history; the credential it carried was reset and belonged to a different, deleted project.
3. **PR2 (optional)** `security/sec-00-untrack-vscode-cp00` (7067f7f) for the CP-00 line, only if that line is kept.
4. Later: this branch (`phase/clean-slate-cloudflare`), after Red Team verdict. It is based on the SEC-00 R2 chain, so it carries the incident, retirement and tooling commits; the reviewer should decide whether to land those as one PR or split.
5. After each merge: re-run `gitleaks.sh current` on the merged tree (must be zero) and enable secret scanning and push protection (currently disabled; owner action).

## Owner actions needed (priority)

1. Remove Vercel-pointing DNS records (cutover step 2). Needs your approval; read-only access here.
2. Enable GitHub secret scanning and push protection.
3. Confirm in dashboards that Vercel and Supabase are deleted, and disable Polar links and webhook.
4. Confirm the leaked password is not reused anywhere (including Sentinax).
5. Decide `OPERATOR_NAME`, `CONTACT_EMAIL`, and whether to approve a workers.dev deployment, then the cutover.
6. Separate decision on cleaning `cf01-throwaway-*` resources.

## Known gaps

- Custom Domain availability on the Free plan is not confirmed by documentation. Fallback documented.
- Zone settings (SSL mode, Always Use HTTPS, existing rulesets) unread.
- Engine not statistically validated; demo is synthetic and labelled so.
- Legal text is a disclosure draft, not reviewed by counsel. Operator identity is a placeholder until set; production builds refuse without it.
- `git diff --check` gate compares HEAD~1..HEAD; it runs on the committed state only.

## Proposed Red Team verdict

**ACCEPT WITH CONDITIONS** for merging the static app and docs to a non-production branch. Conditions: (a) owner removes dangling DNS and enables secret scanning; (b) no cutover until workers.dev deployment is separately approved and reviewed live; (c) Custom Domain on Free confirmed or Route fallback used at cutover. Not a claim of clinical or statistical validity, and not a cost guarantee beyond the v0 static site.
