# CP-00 R3: Billing Reliability Closure & Database Architecture Decision

Proposal for Red Team review. Nothing merged, deployed, migrated or sent to Polar/Supabase. CP-00 is **not closed**.

## A. Baseline
Starting SHA `54cd946c50930aadf99dabb55fd41ebff98c1e96` = `origin/phase/cp-00-safety-containment` (verified). Branch `phase/cp-00-safety-containment`. Only untracked files at start and end: four files in `Derin Araştırma/` (never staged or touched). Final SHA is reported in the hand-off message.

## B. Task A: Polar webhook reliability (`src/app/api/webhooks/polar/route.ts`)

### Findings (confirmed in code before the change)
| # | Finding | Severity |
|---|---|---|
| W1 | `update().eq()` result ignored: DB errors returned HTTP 200 and the event was never retried | P0 (lost paid entitlement or lost downgrade) |
| W2 | Zero-row updates (missing profile) acknowledged as success | P1 |
| W3 | Unresolvable customer (no externalId/email, or no email match) acknowledged with 200 and only a console warning | P1 |
| W4 | `listUsers()` error ignored; only the first page (default size) searched; exact-case email match | P1 |
| W5 | Missing `POLAR_PLUS/PRO_PRODUCT_ID` made every purchase look like an "unknown product" and be dropped with 200 | P1 |
| W6 | Any `subscription.created/updated/...` event granted a paid plan regardless of `status` (`incomplete`, `unpaid`, ...) | P1 (entitlement before payment) |
| W7 | A `subscription.revoked` for an old subscription downgraded a user who had since moved to a newer one | P2 |
| W8 | Non-UUID `externalId` would cause a Postgres cast error on every retry | P2 |

### Corrections
- Every update now uses `.update(...).eq('user_id', ...).select('user_id')`; a DB error throws a retryable `500` (`PROFILE_UPDATE_FAILED`), never 200.
- Zero rows: the Auth user is looked up. User **absent** (deleted account) => `200 {outcome:"ignored"}`, nothing granted and no audit. User **present** => `500 PROFILE_NOT_FOUND` (retry). Lookup failure => `500`.
- Unresolvable mapping => `422 UNRESOLVABLE_CUSTOMER` (not acknowledged; visible as failed delivery in Polar). Email lookup is case-insensitive, paginated (bounded to 25 pages x 200 users), and a lookup error is a retryable `500`. Non-UUID `externalId` is not used.
- Product ids unconfigured => `500 Webhook not configured` (before signature processing, like the secret check). Unknown product with ids configured => `200 ignored`, no change, never upgraded.
- Plan grants require `status` in `{active, trialing, past_due}`; anything else (including unknown/missing) is `ignored` with no change. Existing customers are not downgraded by this (non-granting events change nothing; only `revoked` downgrades).
- Revoke reads the profile first and ignores a revoke whose subscription id differs from the one recorded on the profile (W7). If the profile has no recorded id, the revoke proceeds (unchanged behavior).
- Audit failure after a committed entitlement is caught and does not change the HTTP status (retrying cannot improve it and the update is idempotent).
- Signature verification is unchanged and still first; invalid signature => 422 and no DB access (tested). The signature library enforces a 5-minute timestamp tolerance (`standardwebhooks`, read in `node_modules`).
- Error bodies are fixed strings/codes; test asserts they never echo email, user id or subscription id.

### Behavior changes to be aware of (deliberate)
Unresolvable customer: `200` => `422`. Missing product-id env: `200`(dropped) => `500`. Non-granting status: previously granted, now ignored. Stale revoke: previously downgraded, now ignored.

### Replay / ordering: what is NOT closed
- **Delayed old "active/updated" event after a later `revoked`**: its payload (status active) would re-grant the plan. Closing this needs persisted event ordering (e.g., store the latest processed event timestamp or version per subscription), which is a schema change. Not done in CP-00; documented risk.
- **No `webhook-id` de-duplication table.** Duplicate deliveries are safe only because writes are idempotent (identical values); the audit row may duplicate.
- Read-then-update on revoke is not atomic (narrow race with a concurrent new-subscription event).
- Email fallback trusts the email on the Polar customer (not required verified). With `externalId` set by our checkout link this path is a fallback only; email lookup beyond 5,000 users returns `422`.
- Polar's actual retry schedule and failure semantics were not verified in this phase (no dashboard access).

### Tests
`src/app/api/webhooks/polar/__tests__/route.test.ts` rewritten: 33 tests (was 12), all using synthetic events and mocked Supabase. Includes update failure (both directions), read failure, zero rows with user present/absent/lookup failing, unknown product, six non-granting statuses, invalid/unresolvable mapping, non-UUID id, email pagination, lookup error, failed audit, duplicate delivery, stale revoke, config missing, signature failure with no DB access, no-echo of identifiers. A mutation (ignoring the DB error) made a test fail, then was reverted.

## C. Task B: audit numeric bounds (`src/lib/audit.ts`)
`1 << 40` evaluates to `256` in JavaScript (shift count mod 32), so every size above 256 bytes (e.g., a 5 MB oversize request) was silently dropped from audit metadata. Replaced with named constants `AUDIT_MAX_BYTES = 2**40`, `AUDIT_MAX_FILE_BYTES = 2**30`, `AUDIT_MAX_ROWS = 10_000_000`; validator uses `Number.isSafeInteger`. Tests: pitfall documented (`1 << 40 === 256`), realistic 5 MB values recorded, 0 and exact bounds accepted, bound+1 / negative / float / NaN / Infinity / string / unsafe integer / null / object rejected, and the allowlist remains closed (sentinel keys dropped). No new metadata fields were added.

## D. Task D: operational readiness
- **Authorized non-production Supabase environment: none available** to this agent (no Docker, no Supabase CLI, no branch/credentials provided). Real-Supabase gate: **BLOCKED**. I did not use the production-linked Supabase tooling.
- Vendor docs reviewed (2026-10-08): Supabase states `public` objects get default grants applied by `supabase_admin`, and its recipe uses `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public ...`. It does not state whether `postgres` is a superuser/member of `supabase_admin` or who owns `storage.objects`.
- **New executable finding:** the Supabase-documented recipe (`IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM public`) does **not** remove PUBLIC EXECUTE in real PostgreSQL; the global form in 012 does (PGlite test added). 012's design is therefore consistent with PostgreSQL semantics but diverges from the docs recipe.
- **Compatibility risk for 012 (unverified):** if production has `supabase_admin` default ACLs in `public` granting to `anon/authenticated` and `postgres` cannot set role to `supabase_admin`, 012 aborts (by design). I did **not** change 012 on a guess. `CP-00-SUPABASE-VERIFICATION.md` now has the operator checklist (§0.1), a read-only inventory (§0.2) and a decision table naming the choice that needs a Red Team decision.

## E. Task C: infrastructure ADR
`docs/architecture/CP-INFRA-001-DATABASE-DECISION.md`, status **PROPOSED**. Summary: repo verifies Vercel + Supabase; Cloudflare DNS is an unverified assumption and does not imply Workers. Recommendation: do not migrate now; Option E at most (Cloudflare as DNS/CDN/WAF in front, after checking webhook and Vercel interactions); B is the only plausible target later; C/D not justified (adapter documentation does not mention `proxy.ts`, Worker size limits, SQLite rewrite, no RLS). Eight decision gates (G1-G8) precede any migration. Prices quoted only from vendor pages with their date; totals not computed. No legal compliance claims.

## F. Verification (independently executed in this phase)
| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0) |
| `npm test` | **PASS: 30 files, 431 tests, 0 failed, 0 skipped** (R2: 404) |
| `npm run build` (dummy env) | PASS (26/26 static pages) |
| `git diff --check` | PASS |
| PGlite authorization/closure/exposure suites | PASS (inside `npm test`; +1 new test for the docs-recipe finding) |
| Webhook synthetic tests | PASS (33) |
| Playwright unauthenticated (`safety-hold.spec.ts`, `pricing.spec.ts`) | PASS 16/16, using installed Brave (Chromium) against `next start` with dummy env |
| Playwright authenticated / E2E needing Supabase | NOT RUN / BLOCKED |
| Real Supabase integration | BLOCKED (no authorized non-production environment) |
| Carried over, not re-run here: none | |

## G. Mandatory production operator actions (unchanged, none done)
Disable Polar checkout links; do not cancel subscribers; backup; apply 010-012 on a branch and run the verification doc §0.2 inventory first; then production DB, then app; verify live grants/bucket; review `profiles` for escalated entitlements; check old Vercel deployments; decide customer communication. See the rollout runbook. Additionally for R3: after deploying the webhook change, watch Polar delivery logs for `422 UNRESOLVABLE_CUSTOMER` and `500` responses for the first days, because deliveries that were previously acknowledged-and-lost will now surface.

## H. Remaining blocking findings
1. Real-Supabase gate unmet (012 compatibility with managed roles unknown).
2. Authenticated E2E unmet.
3. Webhook ordering/replay risk (§B) unresolved by design in this phase.
4. All production-only actions pending; legacy data and historical audit rows untouched.

## I. Proposed Red Team verdict
`PASS_WITH_FINDINGS_CANDIDATE`. Billing-reliability and audit-bound defects are fixed and tested; the architecture ADR is delivered as PROPOSED; two mandatory environment gates remain unavailable.

## J. CP-01 readiness
Not met and not started. Prerequisites: real-Supabase gate PASS, migrations applied and verified, Polar links disabled, Red Team acceptance, owner decisions on legacy data and exception E1.
