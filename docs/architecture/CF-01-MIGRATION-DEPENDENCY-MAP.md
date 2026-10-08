# CF-01: Migration Dependency Map (research; nothing migrated)

Counts are from the repository at `1bc924d`. "A" = Next.js 16 + vinext + Workers + D1; "B" = static-first frontend + Worker API + D1.

## 1. Code surface

| Area | Files / counts | Depends on | Option A | Option B |
|---|---|---|---|---|
| PSM engine (`src/lib/psm/*`, 1.05k LOC) | engine + worker + 14 test files | none (pure TS, Web Worker) | unchanged | unchanged (proven in-browser on workerd-served page) |
| Export helpers (`src/lib/export/*`) | csv, balance table, PNG | DOM/Blob | unchanged | unchanged |
| Pages | 11 (`[locale]` auth, dashboard, pricing, landing) | next-intl server APIs, Supabase server client | kept; data layer swapped | rewritten as client pages calling the API; `generateStaticParams` for locales |
| Layouts / providers | 4 | next-intl, fonts | kept (next-intl caveat vinext#177) | static providers |
| Route handlers | 6: `analyses`, `analyses/[id]`, `upload`, `results`, `webhooks/polar`, `auth/callback` | Supabase, Polar SDK, CP-00 safety module | kept; `auth/callback` replaced by Better Auth routes; upload/results stay disabled by CP-00 | become Worker routes; upload/results not rebuilt (CP-01 local-first) |
| Server actions | 2 files (`features/auth`, `features/profile`) | Supabase Auth, admin API | rewritten to Better Auth calls | replaced by client calls to `/api/auth/*` |
| Supabase server client users | 17 files | `@supabase/ssr` cookies | replace with D1 data access + Better Auth session lookup | not applicable (no server rendering) |
| `src/proxy.ts` | 1 | Supabase `getUser`, next-intl | supported by vinext (tested); swap session check | replaced by client route guards + API 401 |
| Audit logging (`src/lib/audit.ts`) | 1 | service-role insert to `audit_logs` | D1 table + allowlist kept | same |
| Webhook (`webhooks/polar`) | 1 + 33 tests | Supabase admin, Polar SDK `validateEvent` | port DB calls to D1; use the PoC's atomic event table | same |
| Safety hold (`src/lib/safety.ts`) | 1 | none | keep | keep |
| CSRF (`src/lib/csrf*.ts`) | 2 | cookies | evaluate against Better Auth origin checks | rely on Better Auth origin checks + SameSite |
| Rate limiting (`rate-limit.ts`) | 1 | in-memory | Workers isolates are not shared: replace with D1 or WAF rule | same |
| CSP and headers (`next.config.ts`) | 1 | Next headers | worked under vinext (tested) | move to `_headers` (static export ignores Next `headers`) |
| Components | 23 client components | React | kept | kept |
| Tests | 30 files / 431 tests | Vitest, PGlite | Postgres RLS/grant tests become obsolete or are rewritten for D1 | same |

## 2. Data dependencies

| Object | Today | Migration note |
|---|---|---|
| `auth.users` (UUID, email, bcrypt hash) | Supabase Auth | New user table; keep UUIDs; hashes not portable under 10 ms CPU, so forced reset |
| `profiles` (plan, limits, Polar ids) | Postgres | Becomes `entitlement` (PoC shape); re-seed from export of plan fields only |
| `analyses`, `uploads` | Postgres | Only non-clinical metadata if any; row-level results never |
| `analysis_cache` | Postgres, unused | Do not migrate |
| `audit_logs` | Postgres | Do not migrate historical rows (contain legacy filenames/UA/IP) pending the audit scrub decision |
| Storage `csv-uploads` | Supabase Storage | Do not migrate; legacy-data plan decides |
| Polar customers/subscriptions | Polar | Unchanged; `customer_external_id` = user UUID must be preserved |

## 3. Integration dependencies
Polar webhook URL (`/api/webhooks/polar`) and secret; DNS and TLS for `www.clinicalpsm.com` (currently Vercel); Supabase redirect URLs and email templates (replaced by the mail vendor); environment variables (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `POLAR_*`); Vercel project and preview deployments; the second website sharing the Cloudflare account.

## 4. Sequencing constraints
1. CP-00 closed; CP-01 local-first merged (no clinical data on any server).
2. Free-plan CPU test passes (owner-authorized).
3. Identity first (Better Auth + D1), with forced password reset waves bounded by the mail cap.
4. Entitlements and webhook cutover with a freeze window and dual-run comparison.
5. Frontend/hosting cutover last; Vercel and Supabase kept read-only for rollback until legacy data decisions are done.
6. Rollback = repoint DNS and Polar webhook back; entitlements must be reconciled from Polar (source of truth for paid state).

## 5. Risks specific to the migration
Hash portability (forced resets), 100 emails/day cap, shared account quotas, vinext beta churn, D1 10 GB per database ceiling and 7-day Free restore window, loss of Postgres RLS and the work done in CP-00 R1/R2/R3 migrations (re-implement authorization tests in the new stack), and the commercial-use terms of every free tier used.
