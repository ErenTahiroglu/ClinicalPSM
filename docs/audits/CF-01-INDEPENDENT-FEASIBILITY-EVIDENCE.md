# CF-01: Independent Feasibility Evidence

Research branch `research/cf-01-free-tier-verification` (from `8e41c3bbc4a9c9107d8a6faec700195dc305ea73`). The CP-00 branch (`1bc924d…`) is untouched. Nothing was deployed; no remote Cloudflare, Vercel, Supabase or Polar resource was read or changed. Final SHA is in the hand-off message.

## 1. Owner-confirmed state and what it changes
Owner statements (not independently verifiable from the repo): zero registered users, no live payment system, no active paying subscriptions, current deployment on Vercel, domain managed in Cloudflare, a second website in the same Cloudflare account.

Implications: no user, password-hash or subscription migration needs to be built; the CF-00 "forced password reset waves" and entitlement re-seeding sections are void **unless** the metadata inventory in `docs/operations/CP-00-SUPABASE-RETIREMENT-OPTIONS.md` finds rows. "Zero users" is a claim about registered accounts, not proof that no protected data exist (earlier CP-00 phases confirmed that unauthenticated and pre-hold writes were possible); the inventory has **not been run** (no authorization to touch production).

## 2. CF-00 Red Team findings: disposition
| ID | Finding | Disposition | Evidence |
|---|---|---|---|
| P0-A | Test mode exposes arbitrary SQL | **Resolved by construction.** Core (`src/app.ts`) has no diagnostics. Diagnostics live only in `src/worker.test.ts`, referenced only by `wrangler.test.jsonc`. The deployable `wrangler.jsonc` has no `[vars]`, no test entry, no secrets. `scripts/build-and-inspect.mjs` builds the deployable config (`wrangler deploy --dry-run`) and fails on any diagnostic marker. Negative control: the same script run on the test config reports 7+ blockers. 45 negative HTTP tests on the production-shaped entry (all `/__test/*`, `/sql`, `/migrate`, `/debug`, `/admin`, `/outbox`, spoofed headers) | `experiments/cf01-auth-poc/` |
| P0-B | Bespoke client-derived password protocol | **Removed.** No `password` option is passed to Better Auth; the build inspector fails if `client-derived` or `cd1$` appears. The CF-00 PoC is marked `DO-NOT-DEPLOY.md`. | decision doc |
| P1-A | Free CPU unverified | **Still unverified.** Live test BLOCKED (no owner approval). Local CPU-vs-wall evidence below says standard password hashing is about 4.7x the Free limit. | section 5 |
| P1-B | About 82 D1 rows read per authenticated request | **Explained and fixed.** See section 4: 80 of 83 rows were Better Auth's per-instance schema diff, not legitimate reads. After `advanced.database.validateSchema: false` an authenticated request reads **3 rows** (3 indexed SEARCH queries). | `test/d1-trace.mjs` |
| P1-C | Webhook PoC not provider-faithful | **Documented, not claimed.** The PoC event is explicitly a stand-in; contract with real Polar/Paddle semantics in `CF-01-AUTH-AND-ENTITLEMENTS-CONTRACT.md`. Also fixed: an unmapped user no longer consumes the event id (409, retryable). Payment code is inert without `WEBHOOK_SECRET`. | contract doc, test |
| P1-D | Static-first frontend not implemented | **Prototype built and tested** (section 3). Not a redesign. | `experiments/cf01-static-site/` |

## 3. Static-first frontend prototype (`experiments/cf01-static-site/`)
Plain generated HTML/CSS/JS, no framework, no CDN, no cookies, no analytics, no forms, no inputs, no file upload. EN/TR pages: home (product explanation), synthetic demo, pricing (all three purchase buttons `disabled` + `aria-disabled`), limitations (feature-availability table mapping each unavailable feature to its phase: CP-01, CP-02/03, CP-04/05, CP-06). The demo bundles the repository's current PSM worker **unmodified** (esbuild iife, about 2.3 KB gzip; the whole `public/` is 68 KB) and runs it on a deterministic synthetic cohort; every result view carries the banner "UNVALIDATED ENGINE · SYNTHETIC DATA ONLY". CSP has no `unsafe-*` (`default-src 'none'`, `script-src 'self'`, `worker-src 'self'`, `frame-ancestors 'none'`), plus `X-Frame-Options`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP/CORP. `robots: noindex`.

Browser test (`test/site.mjs`, Brave/Chromium via Playwright, local `wrangler dev` static assets): **75/75 pass**: both locales x four pages load with correct `lang`, one `h1`, landmarks, unvalidated banner; **axe-core 0 violations on all 8 pages**; 375 px viewport without horizontal scroll; skip link is first Tab stop and moves focus to `main`; navigation, language switch (keeps page), back button; CSP-clean console on all pages; no third-party requests; security headers on HTML, assets and 404; no file input/form/input/external link anywhere; pricing buttons disabled and no checkout links; the demo renders its table in both languages and keeps the unvalidated/synthetic labels; no cookies or web storage.
Not done: final visual design (CP-08), real data paths (CP-01), correctness of the engine outputs (CP-02/03; numbers are shown only to prove the engine executes).

## 4. The 82-row question
Instrumented D1 (statement trace + `EXPLAIN QUERY PLAN`), test entrypoint, local D1 metadata:
- Before: 14 statements, 83 rows read for `GET /api/me`. 26 rows from `select name,type from sqlite_master …` (plan: `SCAN sqlite_master`), about 54 from 9 `PRAGMA table_info`-style statements (one per table), and **3** from the real queries (`session` by token, `user` by id, `entitlement` by user id; each `SEARCH … USING INDEX`).
- Cause: Better Auth's Kysely adapter diffs the live schema (`findSchemaProblems`) whenever an auth instance is created; a Workers handler creates one per request. Real reads, so D1 would bill them (these are not instrumentation artifacts; the proxy only observes `meta.rows_read`).
- Fix: `advanced: { database: { validateSchema: false } }` (present in the installed 1.7.x source). It disables only the runtime schema comparison; the schema comes from `migrations/0001_init.sql` and the contract suite. It does not touch session verification, cookies, rate limits or authorization.
- After: `/api/me` 3 statements, **3 rows**; sign-up 5 r / 13 w / 7 queries; verify-email 4 r / 4 w; sign-in 4 r / 7 w / 5 queries; create item 2 r / 3 w. Contract suite remains **53/53**.

## 5. CPU: what was and was not measured
Definitions (Cloudflare docs, 2026-10-08): CPU time excludes waiting on fetch/KV/database I/O; wall "duration" includes it; Free allows 10 ms CPU per HTTP request; exceeding returns Error 1102 (`exceededCpu`). The docs page does not say whether native crypto counts; treat it as counting.

Local Node `process.cpuUsage()` (CPU, not wall; Node on this laptop, **not workerd**, so only an order-of-magnitude indicator):
| Operation | CPU per op |
|---|---|
| Better Auth default `hashPassword` / `verifyPassword` (scrypt) | about 47 ms |
| PBKDF2-SHA256, 600,000 iterations (OWASP minimum class) | about 48.5 ms |
| PBKDF2-SHA256, 100,000 iterations (reference only; below recommendation) | about 8.2 ms |
| HMAC-SHA256 (session/webhook class) | about 0.0 ms |
| ECDSA P-256 sign+verify of one signature (passkey/JWT class) | about 0.1 ms (includes keygen/sign, so an upper bound) |

Conclusion (local indicator, live test required): any password KDF at a defensible work factor costs roughly 4.7x the Free 10 ms CPU limit; reducing the work factor to fit is **not accepted** (no independent security justification). Signature-class operations are negligible. In workerd, wall time for default sign-up/sign-in was about 40 ms (CF-00), consistent with CPU-bound hashing.
vinext SSR: unchanged from CF-00: wall about 9 to 10 ms p50 on plain pages, unproven against the 10 ms CPU limit.

## 6. Free-plan constraints (official docs, 2026-10-08)
Workers Free: 100,000 requests/day; 10 ms CPU/request; 128 MB; 50 subrequests/request; 20,000 static files, 25 MiB each; static-asset requests are free and unlimited; matching `run_worker_first` requests do invoke the Worker and return 429 when quota is exhausted; Error 1027 when the daily limit is exceeded. D1 Free: 5,000,000 rows read/day, 100,000 rows written/day, 5 GB total, 500 MB/db; 50 queries per Worker invocation (Free); at limits queries error until 00:00 UTC and storage must be freed before writes; Time Travel 7 days (Free); `d1 export` blocks the DB while running. Workers Logs: 200,000 events/day, 3-day retention; pricing model changes 2026-12-01 (this PoC sets observability off). Turnstile: free, unlimited verifications, 20 widgets. Free WAF rate limiting: 1 rule, 10 s window, IP only. Email Sending: Workers Paid only; Email Routing sends only to verified destinations; third-party sender needed (Resend Free: 3,000/month, 100/day, 3 domains). R2 Free: 10 GB-month, 1M Class A, 10M Class B per month (payment-method requirement not stated). **No overage billing on Free: quotas hard-stop.**

Shared account: Workers request count, the 100-Workers cap and D1 storage are account-level, so the second website consumes them if it uses Workers, Pages Functions or D1 (static-only sites do not). Its usage is unknown and not assumed to be zero. Owner input required (runbook).

## 7. Commercial-use terms (what was read)
- Cloudflare Self-Serve Subscription Agreement: no clause found that prohibits commercial use of Free plans. Relevant: 2.2.1(a) no reselling of access; 2.2.1(b) no undue burden; 2.2.1(c) no circumventing usage limits; **2.6 Free Services: no liability for harm from Free Services and Cloudflare may end a Free Service "in our sole discretion"**; Section 8 allows suspension or termination without notice. Service-Specific Terms (Developer Platform): restrict storage/requests where processing "would put an undue burden on the Cloudflare network"; 30 days of access to content after trial/subscription expiry. CDN terms restrict serving video or a disproportionate share of large files without a paid service (irrelevant to a 68 KB site).
- Remaining uncertainty: the "Free plans" page the Developer Platform terms link to was not retrievable here; Cloudflare may change Free terms or discontinue Free services at will. A production business on Free tiers has **no availability or support commitment**. Not legal advice.
- Contrast (CF-00): Vercel Hobby is restricted to non-commercial personal use, and the definition includes processing payments.

## 8. Live Cloudflare test: BLOCKED
The conditions in the task (explicit owner approval of a disposable Free-plan deployment, account/plan confirmation, inventory of existing Worker/D1 names, confirmation the second site is unaffected, no paid-plan activation, no real data) have **not** been given. No `wrangler login`, `whoami`, `d1 create`, `deploy` or inventory command was run. Live CPU, real error rates and real cost verification are therefore **owner-approval-blocked**. Preparation is complete in `docs/operations/CF-01-LIVE-TEST-RUNBOOK.md`.

## 9. Verification results (research worktree)
| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | PASS |
| Lint | `npm run lint` | PASS |
| Unit + DB suites | `npm test` | PASS: 30 files / 431 tests |
| Next production build | `npm run build` | PASS |
| `git diff --check` | | PASS |
| Auth/entitlement contract (TEST entry) | `node test/contract.mjs http://localhost:8790` | **53/53 PASS** (registration, verification gate, login, renewal, logout, reset, isolation, client cannot write entitlements, signature/replay/ordering/unmapped-user, batch atomicity, rate limit, deletion cascade) |
| Diagnostic exposure (PRODUCTION-shaped entry) | `node test/exposure.mjs http://localhost:8792` | **45/45 PASS** |
| Build-artifact inspection | `node scripts/build-and-inspect.mjs` | PASS (3 files, 333 KiB gzip total bundle incl. source map and README); negative control on the test config: FAILS as intended |
| D1 row trace + query plans | `node test/d1-trace.mjs` | 3 rows/authenticated request |
| Static site browser tests | `node test/site.mjs http://localhost:8793` | **75/75 PASS** |
| Not run / blocked | live Workers CPU, real error rates, cost; OAuth/passkey flows against real providers; real Polar/Paddle events; vinext authenticated pages; Supabase inventory | BLOCKED or NOT RUN |

Worker bundle size note: the deployable auth PoC bundle is about 1.8 MiB uncompressed / 333 KiB gzip as measured by `wrangler --dry-run` ("Total Upload"); the limits page lists 64 MiB uncompressed for Workers (the OpenNext page cites 3 MiB/10 MiB compressed). Neither limit is approached; the discrepancy between the two Cloudflare pages is unresolved.
