# CF-00 Feasibility Report: Zero-Monthly-Cost Cloudflare Gate

Proposal for Red Team review. Research branch only. Nothing deployed; no DNS, Vercel, Supabase, Polar or Cloudflare resource touched; no real data used.

## A. Baseline and isolation
- Baseline SHA `1bc924d5ad6d3dab474c4526ab3c01e0edf88843` (verified equal to `HEAD` of `phase/cp-00-safety-containment`).
- Isolated worktree `/Users/eren/Documents/GitHub/ClinicalPSM-cf00` on branch `research/cf-00-zero-cost-feasibility`. The CP-00 worktree was not modified; `Derin Araştırma/` was not touched (it belongs to the main worktree only).

## B. Existing architecture inventory (code-verified)
Next.js 16.2.1 App Router, React 19.2.4, next-intl, `src/proxy.ts` (session refresh + locale + route protection), Supabase Auth/Postgres/Storage, Polar webhooks, PSM engine as a browser Web Worker. 11 pages, 6 route handlers, 2 server-action files, 17 files using the Supabase server client, 23 client components, about 7.6k non-test TS/TSX lines (engine 1.05k). Hosting Vercel (README/GEMINI); Cloudflare DNS is an owner statement, not repository-verifiable. A second website shares the Cloudflare account (owner statement): its Workers/Pages/D1 usage is unknown. See CF-01 for the map.

## C. vinext compatibility and evidence (Option A)
Detailed in `CF-00-ZERO-COST-ARCHITECTURE.md` section 2. Summary: builds; runs on local workerd; EN/TR routing, `proxy.ts` protection, dynamic routes, signed webhook, CSP/headers, React components and the browser Web Worker all behave; **27/27 smoke checks + browser worker check pass**. Frictions: peer-dependency conflicts (needed `--legacy-peer-deps`), React upgrade to 19.3, Tailwind PostCSS path broke (switched to `@tailwindcss/vite`), generated typed config produced a Worker that served 404 (classic `wrangler.jsonc` worked), next-intl client-context caveat (vinext#177, not triggered in the tested routes but authenticated client pages were not exercised), beta status. **Free CPU (10 ms) is unproven**: local wall time sits at about 9 to 10 ms p50 for plain SSR pages.

## D. Static-first evidence (Option B)
Existing app cannot be statically exported (`output: "export"` build fails; blockers listed in CF-01). Backend PoC (Workers + D1 + Better Auth) passes **52/52** contract tests in default and client-derived modes (details in the architecture doc section 3). No static frontend was built; the PSM worker already runs framework-independently in the browser (proven above), so the frontend risk is refactor volume, not a technical unknown.

## E. Better Auth + D1 feasibility
Functionally feasible: every requested contract (registration, login, session renewal, logout, reset, email verification, user deletion, two-user isolation, server-side entitlement, atomic replay-resistant payment events) passes locally. Caveats:
1. **Password hashing CPU**: default scrypt about 40 ms wall vs a 10 ms Free limit; client-derived KDF design drops server cost to about 5 ms but is bespoke and needs review.
2. **Email**: Cloudflare sending requires Workers Paid; a free third-party sender (Resend Free: 3,000/month, 100/day) is necessary.
3. Better Auth requires running its migration programmatically for D1 (`getMigrations`), gated by a test-only route in the PoC; production needs a protected migration process. The Better Auth CLI cannot reach D1 directly.
4. Version risk: tested with `better-auth ^1.7.7`; D1 is not on the pages I read in Better Auth's docs, but the programmatic `database: env.DB` usage was documented in the database concepts page and worked.
5. D1 is SQLite: no RLS, no `auth.users` trigger; FKs verified enforced locally.

## F. Free-tier cost and capacity budget
Quotas (Cloudflare docs, 2026-10-08): Workers Free 100,000 requests/day, 10 ms CPU/request, 128 MB, 50 subrequests, 20,000 static files, static-asset requests free and unlimited; D1 Free 5,000,000 rows read/day, 100,000 rows written/day, 5 GB total, 10 DBs, 500 MB/DB; Workers Logs 200,000 events/day with 3-day retention; Turnstile free/unlimited; WAF rate limiting 1 rule; R2 10 GB-month, 1M Class A, 10M Class B/month; Resend Free 3,000/month and 100/day. **At limits, the Free plan stops (Error 1027 / query errors until 00:00 UTC); it does not bill overage.**

Measured cost per call (local D1 metadata, PoC, Better Auth): authenticated read about 82 rows read, 14 queries, 0 written; sign-in 83 r / 7 w; sign-up 84 r / 13 w; verify-email 83 r / 4 w; create item 81 r / 2 w. The about 80 rows read per request is higher than a naive design and is unexplained (likely per-request session/rate-limit queries and scans); treat it as an observed upper-bound figure, not a production measurement.

Hypothetical scenarios (assumptions are mine, not measured traffic):

| | A. Dev + first users | B. Small commercial launch | C. Spike / abuse |
|---|---|---|---|
| Assumed load | 20 users, each 1 sign-in + 20 API calls per day | 100 DAU, each 1 sign-in + 30 API calls; 20 new sign-ups/day; 5 resets/day | 1,000,000 requests/day, hostile |
| Worker requests/day | 420 (0.4% of 100k) | about 3,100 (3.1%) | capped at 100,000, rest rejected |
| D1 rows read/day | about 34,500 (0.7% of 5M) | about 257,700 (5.2%) | all 5M used after about 61k requests if every request hits D1 |
| D1 rows written/day | about 400 (0.4%) | about 1,040 (1.0%) | write cap reachable by sign-in/sign-up floods (about 14k sign-ins) |
| Emails/day | about 20 | about 25 (25% of Resend 100/day) | capped at 100/day: legit sign-ups delayed |
| Static asset requests | free, unlimited | free, unlimited | free, unlimited |
| Mandatory cost | $0 | $0 | $0 (no overage), **availability degraded** |

Conclusions: capacity within quotas is ample for A and B under these assumptions; C cannot cost money but can take the API offline for the day. Mitigations that exist at $0: serve the frontend as static assets with `run_worker_first` only for `/api/*`, Turnstile on sign-up/login/reset, the single WAF rate-limit rule, the application limiter. None is proven here against real abuse. **These are free quotas, not proven application behaviour.**

Other lines: backups = D1 Time Travel 7 days (Free) + optional manual export to R2 (payment-method requirement unstated); logging = Workers Logs 200k events/day, 3-day retention, **pricing model changes on 2026-12-01 (disable observability or re-check)**; monitoring = Cloudflare analytics only, external uptime checks are an owner choice; build/deploy = local `wrangler deploy` at $0 (CI minutes not researched). **Shared account**: Workers requests, D1 storage and the Workers count are account-level, so the second website's usage subtracts from these numbers.

**ZERO_COST_GATE_FAILED does not apply to Option B on paper** (every mandatory item is $0 inside the envelope), but the gate depends on three unverified items: Free-plan CPU, the mail vendor's free-tier terms (card), and Cloudflare Free-plan commercial-use terms.

## G. Security and legacy-data risks
- No RLS: authorization bugs become data exposure; mitigated by scoped queries and negative tests (the PoC includes several), but this must be re-done for the real schema.
- Bespoke client-derived password scheme needs independent cryptographic review before any use.
- Webhook replay/ordering: solved in the PoC by unique event id + timestamp-guarded update in one D1 batch; unknown-user events still consume the event id (PoC limitation, the real design must reject unmapped users with a retryable status).
- Legacy clinical data stays in Supabase; retention/deletion decisions remain open (CP-00 legacy plan). D1 must never hold row-level clinical data.
- Region/processing: no certification claims; D1 jurisdiction only at creation; Workers execute globally.
- Secrets: dummy values only in this branch; `.dev.vars` is git-ignored here and copied into `dist/` at build time.

## H. Features lost or rewritten
| Option A (vinext) | Option B (static-first) |
|---|---|
| Largely kept; Supabase client usage must still be replaced by D1/Better Auth data access (all 17 server-client files, 2 server-action files, webhook, upload/delete routes, account deletion) | Everything server-rendered becomes client-rendered with API calls; next-intl static setup; server actions and `proxy.ts` replaced by Worker + client guards; dashboard pages fetch via API |
| Image optimization partial; Vercel-specific features none used | Static export drops `headers()` config (CSP must move to `_headers`); no ISR |
| Beta runtime risk | Largest rewrite, lowest runtime risk |
Under both: no Supabase RLS; no PostgREST; Storage-based CSV upload is already disabled by CP-00 (and would not be rebuilt under CP-01).

## I. Blocking prerequisites and owner actions
1. Authorize a **Free-plan deployment test** of a throwaway Worker (no custom domain) to measure real CPU limits for (a) vinext SSR pages and (b) the auth PoC in both password modes. Without it, CPU stays unproven.
2. Confirm the Cloudflare account facts: plan (Free), whether a payment method is on file, what the second website runs on (static / Workers / Pages Functions / D1), DNS proxy settings.
3. Confirm Cloudflare's commercial-use terms for Free-plan Workers/D1 for a paid product (not verified here).
4. Choose a free email sender and review its free-tier terms (card requirement was not stated on the page fetched).
5. Decide whether the 100/day mail cap and 100k requests/day hard stop are acceptable availability limits for a paid product.
6. Decide the legacy-data fate (unchanged CP-00 task).
7. Legal review of processors, regions, DPAs; no compliance is claimed.

## J. Recommendation
`ZERO_COST_FEASIBLE_WITH_REDESIGN_CANDIDATE`, with these explicit qualifiers:
- Candidate architecture: **Option B** (static-first frontend + small Worker API + D1 + Better Auth with a CPU-fitting credential scheme + free third-party email).
- Evidence level: **functional contracts demonstrated locally; Free-plan capacity and CPU behaviour are `INSUFFICIENT_EVIDENCE`** until the owner-authorized Free deployment test.
- Option A is not rejected but is weaker: it keeps more code yet sits at the CPU line on a beta framework.
- Option C (current stack) is **not** a valid zero-cost baseline for a commercial product (Vercel Hobby non-commercial rule).
- Option D (Neon) is a fallback only if D1 cannot meet a requirement: its free plan has a 6-hour history window, 1 GB/project and 100 CU-hours, needs Hyperdrive (100k queries/day Free) and the Workers CPU for the `pg` client is also unmeasured. Neon Auth documents no hash import.
- Do not migrate anything until CP-00 is closed by the Red Team and the Free deployment test passes.

## K. Git evidence and test results (this branch, run in the worktree)
| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | PASS (exit 0; `experiments/` excluded) |
| Lint | `npm run lint` | PASS (exit 0; `dist/`, `.wrangler/`, `experiments/` ignored) |
| Unit + DB tests | `npm test` | PASS: 30 files, 431 tests |
| Next production build | `npm run build` | PASS (26/26) |
| vinext production build | `npm run build:vinext` | PASS |
| Wrangler/workerd smoke (vinext) | `node experiments/cf00-vinext/smoke.mjs http://localhost:4173` | **27/27 PASS** |
| Browser Web Worker on workerd-served page | `node experiments/cf00-vinext/worker-browser.mjs` | PASS (result in 29 ms, 0 CSP violations) |
| Auth/API contract tests, default hashing | `node experiments/cf00-static-first/test/run.mjs http://localhost:8790` | **52/52 PASS** |
| Auth/API contract tests, client-derived | same, `client-derived` mode on port 8791 | **52/52 PASS** |
| D1 negative isolation / entitlement tests | included above | PASS |
| `git diff --check` | | PASS |
| Real Cloudflare Free-plan CPU/capacity | not run | **NOT RUN, requires owner authorization** |
| Playwright full app E2E | not run on this branch | NOT RUN (browser used only for the worker check) |
| Static `output: export` of the current app | `next build` with export | FAILS as expected (documented, not a regression) |

Final SHA is reported in the hand-off message.

## L. Proposed next phase
CF-01 (research, owner-authorized): a Free-plan deployment test of two throwaway Workers (vinext SSR sample + auth PoC) measuring CPU time and error rates, plus the owner confirmations in section I. Only if that passes, plan a staged migration (after CP-00 closure and CP-01 local-first), starting with identity and entitlements, with the legacy data untouched. CF-01's dependency map is `docs/architecture/CF-01-MIGRATION-DEPENDENCY-MAP.md`.
