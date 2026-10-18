# CP-INFRA-001: Database / Auth / Hosting Architecture Decision

**Status: PROPOSED (not approved).** Read-only analysis. Nothing was implemented, provisioned or migrated. No Neon, Cloudflare Workers, D1 or new Auth provider was introduced.

Vendor figures below come from official vendor pages fetched on 2026-10-08. They change; each must be re-checked before any decision. Where a page did not state something, it is listed as **not stated**, not guessed.

## 1. Current architecture inventory

### Verified from the repository
| Area | Fact | Evidence |
|---|---|---|
| App | Next.js 16.2.1 App Router, React 19.2.4, `next-intl`, request interception in `src/proxy.ts` | `package.json`, `src/proxy.ts` |
| Hosting | Vercel; production URL `www.clinicalpsm.com` (and a `*.vercel.app` alias) | `README.md`, `GEMINI.md`, `ClinicalPSM_status.md` |
| Auth | Supabase Auth via `@supabase/ssr`; cookie sessions; server actions `login/register/reset`; `auth.admin.deleteUser`, `auth.admin.listUsers/getUserById` (webhook, account deletion) | `src/features/auth`, `src/proxy.ts`, webhook route |
| Database | Supabase Postgres; tables `profiles, analyses, uploads, analysis_cache, audit_logs`; FKs to `auth.users` (`ON DELETE CASCADE`); trigger `handle_new_user` on `auth.users`; RLS + (after R1/R2) explicit grants | `supabase/migrations/001-012` |
| Data API | Application reads use `supabase-js` (PostgREST) with the user's JWT and RLS | `src/**` |
| Storage | Supabase Storage bucket `csv-uploads` (legacy; writes blocked by CP-00) | upload/delete routes, migrations 010-012 |
| Billing | Polar: hosted checkout links, webhook `/api/webhooks/polar` writes `profiles` via the service-role client | `src/lib/polar.ts`, webhook route |
| Secrets | `SUPABASE_SERVICE_ROLE_KEY`, `POLAR_*` in Vercel env | `.env.example` |
| Other | No analytics SDK; CSP allows `va.vercel-scripts.com` (unused) | `next.config.ts` |

### NOT verified (assumptions)
- That DNS for `clinicalpsm.com` is on Cloudflare (stated by the project owner, not visible in the repository). **Cloudflare DNS does not imply the app runs on Workers**; the repo documents Vercel hosting. Whether Cloudflare proxying (orange cloud) is on, and with what caching/WAF rules, is unknown.
- Supabase project region, plan tier (Free vs Pro), backup/PITR settings, number of users, rows, and Storage size.
- Vercel plan, region, and log retention.

## 2. Options

| ID | Architecture |
|---|---|
| A | Vercel + Supabase (Auth + Postgres + Storage). Current. |
| B | Vercel + Neon Postgres + a separate managed auth (e.g., Neon's managed Better Auth) |
| C | Cloudflare Workers (Next.js via adapter) + Neon through Hyperdrive + managed auth |
| D | Cloudflare Workers + Cloudflare D1 for small operational metadata |
| E | Transitional hybrid: keep Supabase for Auth (and legacy data), move/add nothing else; optionally add Cloudflare in front as DNS/CDN/WAF only |

## 3. Vendor facts used (fetched 2026-10-08; verify)

**Supabase**: Free: $0, 500 MB DB per project, 1 GB file storage, 50,000 MAU, no automatic backups, project pauses after 1 week of inactivity. Pro: from $25/month, 8 GB disk then $0.125/GB, 100 GB storage, 100,000 MAU then $0.00325/MAU, daily backups kept 7 days, PITR as a $100/month add-on per 7 days of retention. Roles page: `postgres` described as "the default Postgres role. This has admin privileges"; superuser status, `storage.objects` ownership and cross-role `ALTER DEFAULT PRIVILEGES` rights are **not stated**. Security docs: on existing projects new `public` tables get `SELECT/INSERT/UPDATE/DELETE` for `anon/authenticated/service_role` and functions get `EXECUTE`, applied by `supabase_admin`; Supabase says it is changing the default to opt-in (no date given).

**Neon**: Free: 100 CU-hours/project, 1 GB/project (20 GB total), 6-hour history window, 60k Auth MAU. Launch: $0.106/CU-hour, $0.35/GB-month, up to 7-day history window, 1M Auth MAU. Scale: $0.222/CU-hour, up to 30 days. Scale-to-zero after 5 minutes (cannot be disabled on Free). Regions: Europe = Frankfurt (`aws-eu-central-1`) and London (`aws-eu-west-2`, Managed Better Auth listed there); no Middle East region listed; Azure regions deprecated. Neon Auth = managed Better Auth (v1.4.18 at fetch), stores users/sessions in the `neon_auth` schema of your database, AWS regions only, GA/beta status **not stated**, **password-hash import from other providers not documented**.

**Cloudflare**: Hyperdrive connects to Neon as an ordinary Postgres endpoint with a dedicated role, non-pooled connection string, `pg >= 8.16.3`, `nodejs_compat`; Neon's serverless driver is not recommended. Hyperdrive: Free 100,000 queries/day (then errors), Paid unlimited, pooling/caching included, no egress charge. Workers Paid: $5/month minimum, 10M requests/month then $0.30/M; Free: 100,000 requests/day, 10 ms CPU. OpenNext adapter: supports "all minor and patch versions of Next.js 16", Node runtime required, **Node Middleware unsupported**, `proxy.ts` **not mentioned**; Worker size limit 3 MiB (Free) / 10 MiB (Paid) compressed. Cloudflare's Next.js page recommends "vinext" (marked beta) for Workers. D1: Free 500 MB/db and 5 GB/account, Paid 10 GB/db (not raisable), 30 s query limit, 7-day (Free) / 30-day (Paid) Time Travel, 50 queries per invocation on Free; D1 pricing rates **not retrievable** from the limits page.

## 4. Comparison matrix

| Criterion | A Supabase (current) | B Vercel + Neon + auth | C Workers + Neon/Hyperdrive + auth | D Workers + D1 | E Hybrid |
|---|---|---|---|---|---|
| Next.js 16 | Native on Vercel | Native on Vercel | Adapter needed; `proxy.ts` and Node-only features unverified for this repo | Same adapter risk; D1 is SQLite, not Postgres | As A |
| Auth + existing users | Existing; password hashes stay in place | New auth system; **password-hash migration unverified** (Neon docs silent). Fallback: forced password reset for all users | Same as B | Would need a separate auth service; D1 not an auth system | Keep Supabase Auth |
| Billing/entitlements | Unchanged | Rewrite webhook DB calls; keep Polar | Same | Same + SQLite semantics | Unchanged |
| Schema/FKs | `auth.users` FKs, trigger on `auth.users`, RLS | Must redefine FKs to the new user table; trigger replaced by app/auth hook | Same | Re-model Postgres JSONB/arrays/RLS to SQLite; no RLS | Unchanged |
| PostgREST/RLS | Used (reads via supabase-js) | Lost: replace with server-side data access layer; RLS can still be used via DB roles + JWT only with extra work | Same | No RLS | Unchanged |
| Storage + legacy files | Supabase Storage | Need object store (S3/R2) + copy of legacy CSVs (itself a privacy event) | Same (R2 possible) | R2 | Legacy stays |
| Trust boundary | Anon/authenticated/service keys, PostgREST exposure (cause of R1/R2 findings) | Smaller: no auto-exposed API; server-only DB access. Moves risk to app-layer authorization | Same | Same | As A |
| Secrets | Vercel env | Vercel env + DB credentials | Workers secrets/bindings + Hyperdrive | Bindings (no network credential) | As A |
| Deploy complexity | Low | Medium | High (adapter, bundle size, Node compat, Hyperdrive) | High, plus data model rewrite | Low |
| Cost at low traffic (assumptions: <1k MAU, <1 GB DB, no files) | $0 Free (unsuitable for paying users: no backups, pausing) or from $25/month Pro | Neon Launch usage-based ($0.106/CU-hour, $0.35/GB-month; total **not computed**, needs measured usage) + auth + Vercel plan (not fetched) | $5 Workers Paid minimum + Neon usage + auth; Vercel no longer needed | Workers + D1 usage (rates not retrieved) | As A |
| Backup/recovery | Daily 7 days on Pro; PITR add-on | PITR window 7 days (Launch) per vendor | Same | Time Travel 30 days (Paid) | As A |
| Ops burden | Single vendor | Two-three vendors | Three vendors + adapter | Two + custom auth | Low |
| GDPR/KVKK | Region unknown (verify) | Frankfurt/London available; no ME region | Same, plus Cloudflare processing/edge location questions | D1 location control to verify | Verify |
| Licensing / lock-in | Open-source stack, portable Postgres; Auth/Storage APIs proprietary-ish | Neon Postgres portable; Better Auth open source | More platform-specific code (Workers bindings) | Highest lock-in (D1/SQLite API) | Low |
| Rollback | n/a | Hard after cutover (dual-write needed) | Harder | Hardest | Easy |
| CP-01 fit | Fine: server keeps only identity/billing | Fine | Fine | Fine for tiny metadata but wrong for auth | Fine |

## 5. Expected migration scope (for B/C; D larger)
1. Auth: choose provider; export users; test password-hash compatibility; plan forced reset fallback; session cookie/`@supabase/ssr` replacement across `src/proxy.ts`, server actions, ~10 server pages and API routes.
2. Data: re-point FKs from `auth.users`; port 5 tables, 12 migrations, policies/grants (or replace RLS by server-side authorization), `handle_new_user` equivalent, advisory-lock RPC (disabled now).
3. Data access: replace `supabase-js` queries (≈20 call sites) with SQL/ORM; remove PostgREST dependence.
4. Storage: legacy `csv-uploads` objects (privacy-sensitive) need an export/retention decision first (see LEGACY-DATA-PLAN); do not move patient data merely to change provider.
5. Billing: webhook and `profiles` writes; keep Polar.
6. Hosting (C/D only): adapter port, bundle-size budget, `proxy.ts` behavior, CSP/headers, `nodejs_compat`, Hyperdrive config, build/CI changes.
7. Security re-test: repeat the R1/R2 authorization matrix equivalents on the new stack.

## 6. Risks and hidden costs
- A migration during an active safety hold increases change risk when the priority is containment.
- The R1/R2 findings (over-broad grants, exposed RPC, policies with `auth.uid() IS NULL`) were configuration errors; moving providers does not remove the need for a least-privilege design, and a hand-built data-access layer can reintroduce authorization bugs.
- Auth migration can strand users (hash incompatibility) and invalidates sessions.
- Dual-run period, data validation, rollback tooling, and updated DPAs/records of processing.
- Free tiers (Supabase pause/no backups; Neon 6-hour history) are not production-grade for a paid product.
- Cloudflare Workers adds adapter lag risk with fast-moving Next.js releases; vinext is described as beta.
- Deleted legacy data persists in the old provider's backups until they expire.

## 7. Data-protection considerations (not legal advice)
GDPR/KVKK require, at minimum: a data processing agreement with each processor, a list of sub-processors, storage region and transfer mechanism, retention/deletion capabilities, and breach-notification terms. KVKK has specific rules for transfers outside Turkey; **legal counsel must assess** any provider and region. No vendor listed here "provides compliance"; they provide controls and contracts the controller must evaluate. CP-01's local-first design (no clinical data on the server) is the strongest mitigation and makes the provider choice mostly about identity/billing data.

## 8. Recommendation (PROPOSED)
1. **Do not migrate now.** Stay on A through CP-00 closure and CP-01. The database will hold only identity/billing/operational metadata after CP-01, which lowers the stakes of the provider choice and the benefit of moving.
2. If Cloudflare is wanted, use it as DNS/CDN/WAF in front of Vercel (Option E), after verifying proxy settings do not break Vercel behavior or webhook signature verification (`/api/webhooks/polar`). That requires no data migration.
3. Treat **B** as the only credible migration target, and **C/D as not justified** (adapter risk for `proxy.ts`, bundle limits, SQLite rewrite, no RLS).
4. Ensure the production Supabase project is at least on a plan with backups before real customers depend on it.

### Decision gates before any actual migration
| Gate | Evidence required |
|---|---|
| G1 | CP-00 closed by the Red Team; CP-01 local-first merged (no clinical data server-side) |
| G2 | Measured inventory: users, rows per table, Storage size/object count, request volume, current Supabase plan and region |
| G3 | Written driver for change (cost, residency requirement, reliability incident, feature gap) with numbers |
| G4 | Auth spike: export a **synthetic** user set, prove login with migrated hashes or approve forced reset UX |
| G5 | Spike on Workers (C only): build this repo with the chosen adapter; `proxy.ts`, `next-intl`, server actions, bundle size under limits; latency Workers→Neon region measured |
| G6 | Authorization matrix and exposure gate re-implemented for the new stack and passing |
| G7 | Legal review of DPA, region, sub-processors; retention plan for legacy data and backups |
| G8 | Rollback plan: dual-write or read-only freeze, restore drill executed |

## 9. Decision status
**PROPOSED.** Not approved. Requires Red Team and owner decision after gates G1-G3 at minimum.
