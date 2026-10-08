# CF-00: Zero-Monthly-Cost Architecture Options

**Status: PROPOSED research. Not approved. No production system, DNS, Vercel, Supabase, Polar or Cloudflare resource was touched.**
Branch `research/cf-00-zero-cost-feasibility` (isolated worktree) from baseline `1bc924d5ad6d3dab474c4526ab3c01e0edf88843`. The CP-00 branch is unchanged.

Binding constraint: **USD 0 mandatory monthly infrastructure cost, excluding the domain.** No trials, credits or discounts are assumed. Merchant-of-record transaction fees are out of scope here.

Vendor numbers were read from official vendor pages on 2026-10-08 and must be re-checked before any decision (Cloudflare itself announces Workers Logs pricing changes from 2026-12-01).

## 1. Options compared

| | A. Next.js 16 + vinext + Workers Free + D1 | B. Static-first + Workers Free + D1 | C. Current Vercel + Supabase (free tiers) | D. Neon fallback (with A or B) |
|---|---|---|---|---|
| Mandatory recurring cost | $0 only if Free CPU/limits hold (**unproven**) | $0 within quotas (see budget) | **Not a lawful $0 baseline** (see below) | $0 on Neon Free, but weak recovery |
| Technical compatibility | Builds and serves the real app on workerd locally; beta; peer-dep upgrade to React 19.3; next-intl warning | Needs frontend refactor; backend contracts pass locally | Works today | Needs Hyperdrive + `pg`; Neon serverless driver discouraged by Cloudflare |
| Feature preservation | High (same pages) | Medium (rewrite data loading, auth, server actions) | Full | Same as host option |
| Privacy | Server renders pages; clinical data stays in browser if CP-01 done | Best: only static assets + tiny API | Data-bearing server exists today | Same as host |
| Security | App-layer authz needed (no RLS); same codebase risks | Smallest server surface | RLS/grants (R1/R2 work) | Postgres RLS available |
| Operational complexity | Medium-high (beta framework, adapters) | Medium (custom auth glue) | Low | +1 vendor |
| Migration difficulty | High (auth + DB + hosting) | Highest (frontend + auth + DB) | none | Medium |
| Free-tier limits that bind | **10 ms CPU/request**, 100k req/day, D1 5M reads/day | Same CPU limit but small API only; password-hash CPU needs redesign | Supabase Free: pauses after inactivity, no backups; Vercel Hobby non-commercial | Neon Free: 6 h history, 1 GB, 100 CU-h |
| Vendor dependency | Cloudflare + vinext (beta) | Cloudflare (D1/Workers) + Better Auth (OSS) + mail vendor | Vercel + Supabase | + Neon |
| Backup / rollback | D1 Time Travel 7 d (Free), export blocks DB | Same | Supabase Free: none | Neon Free: 6 h |

### Why C is not a valid zero-cost baseline for a paid product
Vercel's fair-use page states: "Hobby teams are restricted to non-commercial personal use only", and defines commercial usage to include "any method of requesting or processing payment from visitors of the site" (donations excluded). ClinicalPSM sells subscriptions via Polar. Operating it on Vercel Hobby would therefore breach those terms; a compliant Vercel plan is a paid subscription. Separately, Supabase Free has no automatic backups and pauses projects after one week of inactivity (pricing page). **C meets the budget only while the product is not commercial.** (Cloudflare's own commercial-use terms for Free plans were *not* verified in this phase; the owner must confirm them.)

## 2. Option A: vinext on Workers Free: evidence

Local evidence (workerd via `vite preview`, dummy secrets, synthetic requests; see `experiments/cf00-vinext/`):

| Criterion | Result |
|---|---|
| `vinext check` | 84% compatible; flags next-intl client-context issue (vinext#177), `__dirname` in test helpers, webpack/turbopack/reactCompiler options ignored |
| `vinext init` | Needs explicit choices; failed on npm peer conflicts (babel); required `--legacy-peer-deps`. Generated typed config (`cloudflare.config.ts`) produced a Worker that served only 404 locally; a classic `wrangler.jsonc` with `main: vinext/server/fetch-handler` worked |
| Dependency changes | React/React-DOM `19.2.4` to `^19.3.0` (vinext peer `^19.2.6`), Vite 8, `type: module`, Tailwind via `@tailwindcss/vite` (the PostCSS path failed on `@import "tailwindcss"`) |
| Production build | `vite build` OK (server output ~397 KB gzip total across modules; client 1.0 MB) |
| Locale routing | `/en`, `/tr`, `/en/pricing`, `/tr/pricing`, `/en/login`, `/tr/login` all 200 with correct `<html lang>`; `/` redirects `307 /en` |
| `proxy.ts` / protected routes | `/en/analyses`, `/en/new`, `/en/settings`, `/tr/analyses` unauthenticated: `307` to the correct locale login |
| Dynamic API routes | CP-00 holds return `503`; `GET` on write routes `405` |
| Signed webhook | invalid signature `422`; valid signature + unknown product `200 ignored`; known product with unreachable DB `500` (retryable); non-paying status `200 ignored`; unmappable customer `422`; stale timestamp `422` |
| CSP and security headers | CSP (frame-ancestors none, worker-src blob), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` present |
| React components + browser Web Worker | The emitted PSM worker chunk ran in a real Chromium-based browser against the workerd-served page: 200 synthetic rows, result in 29 ms, no CSP violation |
| Results | `experiments/cf00-vinext/smoke.mjs`: **27/27 pass**; `worker-browser.mjs`: pass |
| Wall-clock SSR time (local, 50 warm requests) | p50 about 9 to 10 ms, p95 about 11 to 14 ms for `/en`, `/en/pricing`, `/en/login`; `/en/analyses` redirect about 1.4 ms |

**CPU criterion: NOT ESTABLISHED.** Workers Free allows 10 ms CPU per request; local workerd enforces no limit, and wall time includes the (failing) fetch to the dummy Supabase host. Wall time upper-bounds CPU but is already at the 10 ms line for plain SSR pages, and authenticated pages (several data calls, larger renders) were not measured. This criterion **requires a Free-plan deployment test with owner authorization**. Cold-start CPU is likewise unmeasured. A Worker exceeding the limit is terminated per request, which would fail pages, not cost money.

Other findings: Cloudflare describes vinext as beta and the vinext README says production use "with caution"; its generated config enables Workers Observability by default (log pricing changes 2026-12-01: disable or re-check); `.dev.vars` is copied into `dist/server` at build (dummy here; never build with real secrets into artifacts that are committed or uploaded elsewhere).

## 3. Option B: static-first: evidence

### 3.1 Current app is not statically exportable
`next build` with `output: "export"` fails immediately (`/api/analyses/[id]` lacks `generateStaticParams`); the project additionally has: 6 route handlers, 2 server-action files, 17 files importing the Supabase server client, a request interceptor (`proxy.ts`), `next-intl` server APIs, 11 pages, 23 client components, about 7.6k non-test TS/TSX lines of which 1.05k are the PSM engine (framework-independent, already runs in a Web Worker). See CF-01 for the file-level map.

### 3.2 Disposable backend PoC (`experiments/cf00-static-first/`)
Workers + D1 + Better Auth 1.7.x, Worker code about 250 lines, local workerd + local D1, synthetic accounts.

Result: **52/52 contract tests pass in both password modes** (`test/run.mjs`):
registration; email-verification gate (login blocked until verified, token consumed, bad token rejected); login; wrong password; logout; session renewal; password reset (unknown email not revealed, token single-use, other sessions revoked, old password rejected); two-user isolation at the application layer (404 for foreign and absent ids alike, list scoping, no cross-delete); client cannot write entitlements (no route; sign-up body `plan:"pro"` and `emailVerified:true` ignored); signed payment webhook (bad/stale signature `422`, atomic apply, **replay acknowledged without change, older event cannot overwrite newer state, late "active" cannot re-grant after revoke**); D1 `batch()` rolls back an earlier INSERT when a later statement fails; login rate limiting (429); account deletion cascades user, session, account, items and entitlement; other users unaffected; foreign keys are enforced (`PRAGMA foreign_keys = 1`).

This closes, in the PoC, the ordering and replay gap that CP-00 R3 documented for the Postgres webhook (event timestamp compare + unique event id in one atomic batch).

### 3.3 The password-hash CPU problem (decisive finding)
| Mode | sign-up wall | sign-in wall |
|---|---|---|
| Better Auth default hashing (library scrypt) | p50 41.5 ms | p50 39.0 ms |
| `client-derived` (browser PBKDF2-600k, server stores salted HMAC) | p50 6.0 ms | p50 5.0 ms |

Wall time bounds CPU from above and these operations are CPU-bound, so default hashing is about 4x the Free 10 ms limit. Real Free behaviour is unproven (needs the deployment test). The client-derived design fits locally, with the attacker's offline cost after a DB leak still including the browser-side KDF per guess. Trade-offs: bespoke auth code, salt derived from email (changing email needs a re-derive flow), any KDF weaker on low-end phones, and it must be security-reviewed before use. The PoC marks this as a candidate, not a recommendation.

### 3.4 Email
Cloudflare Email Sending is "Available on Workers Paid" (beta), so it cannot be mandatory. Email Routing free sends only to verified destination addresses. Verification and reset emails therefore need a **third-party free sender**, e.g. Resend Free: 3,000/month and 100/day, 3 domains, 30-day retention (card requirement not stated on the page). The 100/day cap is a hard ceiling on sign-ups plus resets per day.

## 4. Supabase Auth migration (specified, nothing executed)
- Identifiers: `auth.users.id` (UUID) is referenced by `profiles.user_id`, `analyses.user_id` and Polar `customer_external_id`. Preserve the UUID as the new user id so Polar linkage survives (Better Auth allows custom id generation; to be tested).
- Password hashes: Supabase stores bcrypt in `auth.users` (not stated in the docs page fetched; verify on the target). Verifying bcrypt in pure JS costs about 58 ms per check in Node (bcryptjs, cost 10), so lazy hash migration at login is not viable under 10 ms CPU. **Fallback: forced password reset for every migrated user** (email via the free sender; 100/day cap means large user bases need staged waves).
- Sessions: all Supabase sessions are invalidated at cutover.
- Subscriptions: stay in Polar; entitlements re-seeded from `profiles` (plan, `polar_subscription_id`) before cutover; the webhook switches to D1.
- Deletion: account-deletion flow rebuilt (PoC proves cascade); Polar customer deletion remains manual.
- Legacy clinical data (Supabase Storage CSVs, `analyses.result_summary`): **not migrated**. Stays read-only in Supabase until the legacy-data plan decides retention/deletion. D1 must never receive row-level clinical data.
- Real-data export: none performed.

## 5. Security, privacy and data processing
- CP-00 safety hold is preserved (the vinext smoke confirms the 503 holds).
- D1 has no PostgreSQL RLS: every query must be user-scoped in code, with negative isolation tests (PoC has them) and no raw client-controlled SQL.
- Never trust client entitlements: only the signature-verified webhook writes them (PoC enforces).
- D1 restore: Time Travel on Free is 7 days, always on; restores are destructive in place, cancel in-flight transactions, and clone/fork is not supported. `wrangler d1 export` blocks the database while running, is documented for dev/testing, and loses `int64` precision beyond JS limits. Long retention needs an export job (R2 free 10 GB-month; whether a payment method is required was not stated).
- Credentials: Worker secrets via Wrangler/dashboard, never in `[vars]` for production; the PoC's `[vars]` values are dummy. Rotation requires redeploy.
- Session security: Better Auth cookie sessions, DB-backed rate limits, revocation on reset (tested).
- Region: D1 jurisdiction (`eu`) can only be set at creation, and the page does not say whether it is available on Free; Workers still execute worldwide and can reach a jurisdiction-constrained database; Regional Services is a separate product. No GDPR/KVKK/HIPAA compliance is claimed; processors, DPAs, transfers and retention need legal review.
- Abuse: Turnstile is free with unlimited verifications (20 widgets); the Free WAF allows 1 rate-limit rule (10 s window, IP only).

## 6. Decision
See `docs/audits/CF-00-FEASIBILITY-REPORT.md` section J. Summary: **do not choose Cloudflare because it is Cloudflare.** Option B is the only candidate whose pieces were demonstrated to function within Free quotas locally, but real-Free CPU behaviour, the mail sender's terms, commercial-use terms and a large frontend refactor remain open. Option A is closer to the current code but sits on the CPU line and on a beta framework.
