# CP-00 Closure Report (proposal for Red Team review)

Baseline: `main` @ `dfa475bc7b5c4b34f32827a5d89e82d9d6fbbd63` (verified equal to `origin/main`; tree identical, clean). Branch: `phase/cp-00-safety-containment`.
Note: the local folder was a GitHub download without `.git`; it was linked to `origin`, fetched, and reset (index only) to `origin/main`. `git status` was empty afterward, so the working files were byte-identical to the baseline.

## Findings

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| 1 | Step1 uploads full CSV to upload API | Confirmed | `WizardStep1Upload.tsx` `handleNext` → `FormData` → `/api/analyses/${id}/upload` |
| 2 | Upload API stores in `csv-uploads` | Confirmed | `upload/route.ts` `storage.from('csv-uploads').upload` |
| 3 | Step4 sends full `PsmResult` incl. row-level data | Confirmed | `WizardStep4Results.tsx` `body: JSON.stringify({ resultSummary: psmResult, config })`; `results/route.ts` writes `result_summary` |
| 4 | UI offers optimal; worker always nearest | Confirmed | `WizardStep3Settings.tsx` option; `worker.ts` calls `matchNearest`; `method` not in `PsmConfig`; `matchOptimal` unreferenced outside tests |
| 5 | Outcome collected but unused | Confirmed | `outcomeColumn` only displayed in Step4; not in `PsmConfig`/worker |
| 6 | Caliper description vs scale inconsistent | Confirmed | UI text "SD of (logit) PS"; `matching.ts:41` compares absolute PS difference |
| 7 | Marketing implies publication readiness | Confirmed | `landing.hero.description`, `features.download.description` (EN/TR) |
| + | Landing claimed "no data leaves your browser" | Confirmed false | contradicts #1/#2 |
| + | Pricing page rendered hosted Polar checkout links, incl. for upgrades | Confirmed | `pricing/page.tsx` |
| + | Direct PostgREST/Storage write bypass possible with user JWT | Confirmed in code (RLS `FOR ALL`); live storage policies unknown | `001_initial_schema.sql`; no migration defines `csv-uploads` policies |
| + | `audit_logs` SELECT readable by all Pro users; `analysis_cache`/audit insert policies open to `anon` | Confirmed in migrations; live state unverified | 005, 006, 008, 002 |
| + | `AuditLogger` singleton reuses first request's Supabase client | Confirmed | `src/lib/audit.ts` |
| + | Audit logs filenames/IP/UA/`error.stack`; survive account deletion | Confirmed | `audit.ts`, `request-limits.ts`, `profile.ts` |

Unresolved (deploy-dependent): bucket privacy, live RLS/storage policies, backup retention, log drains, whether production contains real patient data. See inventory doc.

## Implementation summary

New: `src/lib/safety.ts`, `supabase/migrations/010_cp00_safety_hold.sql`, `src/app/api/__tests__/safety-hold.test.ts`, `src/lib/__tests__/safety.test.ts`, `e2e/safety-hold.spec.ts`, 5 docs.
Modified: 3 API routes (wrapper only), `lib/polar.ts` (+`getCheckoutUrl`), pricing page, `/new` page, `WizardStep3Settings.tsx` (disable optimal, correct caliper text), `messages/en.json`, `messages/tr.json`, `e2e/pricing.spec.ts`, `e2e/basic.spec.ts`.
Not touched: PSM math, webhook, auth, middleware, pricing values, payment config, any existing data.

## Verification (actual results)

| Check | Command | Result |
|---|---|---|
| Baseline | tsc / lint / `npm test` on unmodified `main` | tsc exit 0; eslint exit 0; 24 files, 278 tests passed |
| Type check | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0, no output |
| Unit tests | `npm test` | **26 files, 304 tests passed**, 0 failed, 0 skipped (+2 files, +26 tests) |
| Whitespace | `git diff --check` | exit 0 |
| Build | `npm run build` with dummy `NEXT_PUBLIC_SUPABASE_*`/service key | Compiled, TypeScript OK, 26 static pages |
| Live smoke | `next start` + curl | upload/results/create → 503 with constant body; GET upload → 405; `/en`,`/tr` pricing 200, no `buy.polar.sh`, hold notice present; landing HTML has none of the removed claims |
| Mutation check | set `CLINICAL_WRITES_ENABLED=true` temporarily | 4 of the 6 route tests failed as expected; reverted |
| Playwright E2E | not run: **could not run**. Browsers not installed (`~/Library/Caches/ms-playwright` absent) and specs need live Supabase | `e2e/safety-hold.spec.ts` written, and `pricing.spec.ts`/`basic.spec.ts` updated, but unexecuted |
| Migration 010 | not applied; no database available | Static test only (no destructive statements, expected objects present). SQL syntax not executed against Postgres. |

Requested test mapping: (1) upload blocked, (2) results blocked, (3) no leak in body/console/audit — `safety-hold.test.ts` sentinel checks; (4) direct call/other methods — route export set + static scans in `safety.test.ts`; (5) billing preserved — webhook suite unchanged and passing (existing `route.test.ts`), plus test that webhook doesn't import the hold; (6) checkout blocked — `getCheckoutUrl` null, pricing source tests, curl; (7) TR/EN — key parity, hold keys, forbidden-claim scan, live pricing in both locales; (8) non-destructive — migration static test, DELETE route preserved, guards never touch DB.

## Known limitations / expected breakage

- Authenticated Playwright specs that drive upload/run/save (`psm-workflow`, `data-validation`, `daily-limit`, `api`, `error-handling`, `security`, `performance`) will fail by design under the hold; they were not run and not rewritten (needs CP-01). CI does not run E2E (`ci.yml`: lint, tsc, vitest).
- DB layer inactive until migration 010 is applied; Polar checkout links remain valid until disabled in the Polar dashboard.
- The static-scan tests are heuristic (regex), not a proof of no bypass.
- Worker/engine still has unwired `matchOptimal`, unused `outcomeColumn`; left for validation phase.
- Wizard step copy is hard-coded English (pre-existing); only TR/EN messages for new notices were added.
- Pre-existing findings above (audit singleton, audit/cache policies) are documented, not fixed.

## Proposed verdict

`PASS_WITH_FINDINGS_CANDIDATE`. Code-level containment is implemented and unit/build/smoke-verified; open items are the unapplied migration, unrun E2E, and deployment-only controls (Polar links, bucket policy).

## CP-01 readiness

Can begin only after Red Team approval. Blockers: decision on migration 010 application, Polar link disablement, legacy-data Phase A inventory, decision on exception E1.
