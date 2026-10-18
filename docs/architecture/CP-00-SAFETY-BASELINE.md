# CP-00 Safety Baseline

Baseline: `main` @ `dfa475bc7b5c4b34f32827a5d89e82d9d6fbbd63`. Branch: `phase/cp-00-safety-containment`.
Status: proposal for Red Team review. Not merged, not deployed.

## 1. Design

Smallest coherent mechanism: two **hard-coded boolean constants** in `src/lib/safety.ts`.

| Constant | Value | Controls |
|---|---|---|
| `CLINICAL_WRITES_ENABLED` | `false` | New uploads, new row-level result persistence, new analysis creation |
| `NEW_PURCHASES_ENABLED` | `false` | Rendering of hosted checkout links / subscribe CTAs |

Why constants and not env vars / DB flags / feature-flag service:

- **Fail-closed by construction.** Missing configuration cannot re-enable anything; there is no configuration.
- **No permissive fallback.** Re-enabling is a diff to `src/lib/safety.ts`, which goes through PR review and CI. A test (`safety.test.ts`) asserts the file contains no `process.env` read.
- **No runtime toggle to attack.** No admin endpoint, no DB row a compromised account could flip.

Trade-off: re-enabling needs a deploy. That is intentional for a safety hold.

### Enforcement layers

1. **Route layer (code-confirmed).** `withClinicalWriteHold(handler)` wraps the `POST` export of:
   - `src/app/api/analyses/[id]/upload/route.ts` (outermost; runs before `withFileUploadLimit`, which would otherwise call `req.formData()` and audit-log filenames on oversize)
   - `src/app/api/analyses/[id]/results/route.ts`
   - `src/app/api/analyses/route.ts` (outermost; before CSRF, session, quota RPC)

   The wrapper returns a static `503` (`CLINICAL_DATA_WRITES_SUSPENDED`) **before** reading the body, session, DB, Storage, rate limiter, or audit log. The body is a constant string: it never echoes filenames, columns, cells, or IDs.
2. **Database layer (migrations `010_cp00_safety_hold.sql` and `011_cp00_r1_authorization_lockdown.sql`, NOT yet applied).** 010 is retained unchanged; 011 is additive, fails hard instead of warning, and removes client write grants entirely (see R1 report). The 010 description follows.
    The browser holds the Supabase anon key and a user JWT, and RLS (`FOR ALL` on `analyses`/`uploads`) lets users write rows directly via PostgREST, bypassing Next.js. Migration 010 adds `BEFORE INSERT/UPDATE` triggers that reject a non-null `result_summary` on `analyses`, any new/changed `uploads` path/columns, any write to `analysis_cache`, and `RESTRICTIVE` policies on `storage.objects` for the `csv-uploads` bucket. It is additive: no existing row/object is read, changed, or removed; SELECT and DELETE (user data deletion) remain possible. Rollback SQL is in the migration header.
3. **UI layer.** `/[locale]/new` renders a hold notice (EN/TR) before any quota query; the wizard is unreachable. `/[locale]/pricing` shows a notice and disabled "Temporarily unavailable" buttons for paid plans; no Polar URL is rendered (`getCheckoutUrl()` returns `null`).

### Preserved

Auth (login/register/reset), `proxy.ts` session handling, dashboard read access to existing analyses (including detail, print, balance-table export), analysis deletion, account deletion, Polar webhook (`/api/webhooks/polar`, untouched), `profiles` plan/limits, existing subscriptions. No subscription is cancelled or refunded.

### Intentionally restricted

New analyses, new uploads, new result saves, new paid checkouts (including upgrades Plus→Pro, because the checkout link is the purchase path).

## 2. Containment of misleading capabilities (B)

| Issue | Action |
|---|---|
| Optimal matching selectable but worker always calls `matchNearest` | Option disabled in `WizardStep3Settings`; submit rejects non-`nearest`. Worker unchanged (no math changes). `matching-optimal.ts` remains unwired. |
| Caliper text said "0.2 × SD of logit PS" / "SD of propensity score" but engine compares absolute PS difference (`matching.ts:41`, probability scale) | Help text and placeholder corrected to "maximum absolute propensity-score difference (0–1)". Numerical behavior unchanged. |
| "publication-ready", "ready for your paper" | Removed (EN/TR). Replaced with "not yet independently validated". |
| "no data leaves your browser until you run the analysis" (false: upload route stores the CSV) | Removed (EN/TR). |
| "1 free analysis daily" CTA while analyses paused | CTA now "Create Free Account"; subtext states analyses are paused. |
| Outcome variable collected, not analyzed | Unchanged here (not an unavailable-feature claim once wizard is held); tracked for CP-01. |
| MatchIt equivalence / regulatory compliance | Not claimed anywhere in code or copy (grep-verified; asserted by test). |

## 3. Re-enabling procedure (future, requires Red Team decision)

1. Local-first architecture (CP-01) implemented and reviewed so the server no longer receives CSV or row-level results.
2. PR flipping the constant(s) with justification; CI green.
3. New migration dropping the 010 triggers/policies (rollback SQL in 010), reviewed separately.
4. Written approval recorded in the closure report for that phase.

## 4. Deployment dependencies (not enforceable from code)

- Migration 010 must be applied for the DB layer to exist. Until then a direct PostgREST/Storage write with a user JWT is still possible. **This is the main residual risk of this PR.**
- Polar hosted checkout links (`buy.polar.sh/...`) were publicly distributed and are still valid. Disabling them requires a Polar dashboard action by an account owner. Until then, a purchase via an old link would still be applied by the (unchanged) webhook.
- Vercel: previously deployed builds and preview deployments of older commits keep the old behavior until superseded or disabled.

## 5. R1 addendum

Row-level protection is now enforced by **privileges first, RLS second** (migration 011): clients (`anon`, `authenticated`) hold no write privilege on any public table and no EXECUTE on any public function; only `service_role` writes. `audit_logs` is written through a stateless service-role client (`src/lib/audit.ts`). The 010 triggers remain as defense in depth and also block `service_role` writes of row-level results.
