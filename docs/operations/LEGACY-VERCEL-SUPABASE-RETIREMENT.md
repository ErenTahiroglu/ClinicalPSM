# Legacy Vercel and Supabase retirement

## Status (as of 2026-10-08)

The owner stated that both the **Vercel project** and the **Supabase project `ClinicalPSM`** were **deleted**, with **no backup**. Public evidence is consistent: `*.clinicalpsm.com` returns Vercel `DEPLOYMENT_NOT_FOUND`; `vmfypftkayycndvgpfrj.supabase.co` does not resolve; the Supabase connector lists only another project (`Sentinax`). DNS non-resolution alone does not prove deletion, so the owner should confirm in each dashboard.

This changes the earlier plan: SEC-00 required a minimal encrypted backup **before** deletion. That did not happen. The data loss is accepted by the owner's own statement: the last known inventory was 2 auth users (both owner-controlled), 1 profile, 0 analyses/uploads, 6 audit rows (all CSRF-failure events on 2026-04-19 from one source, no clinical keys), 0 storage objects. No customer data existed. What is permanently lost is the raw audit rows; the aggregate findings are preserved in `SEC-00-R2-OPERATIONAL-REPORT.md`.

Deletion occurred before the written approval the SEC-00 protocol required. This is recorded here as a process deviation, not a technical finding.

## Cleanup list (owner, in priority order)

| # | Item | Why | Where |
|---|---|---|---|
| 1 | Delete the Vercel-pointing DNS records (apex A ×2, `www` CNAME) | dangling DNS; subdomain/domain takeover risk | Cloudflare DNS; step 2 of the cutover runbook |
| 2 | Confirm Vercel project and any preview deployments are gone; remove the Vercel GitHub integration/app from the repo | stale integration keeps repo access | Vercel dashboard; GitHub → Settings → Integrations |
| 3 | Confirm the Supabase ClinicalPSM project is deleted (not just paused) | NXDOMAIN is not proof | Supabase dashboard |
| 4 | **Credential hygiene**: the credential that leaked in 2026 belonged to a *different* Supabase project (`ixzuenvi…`, reported deleted) and was reset by the owner. Confirm the same password is not reused anywhere, including **Sentinax** | password-reuse risk | owner |
| 5 | Polar: archive/disable Plus and Pro products and checkout links; delete the webhook endpoint pointing at the old domain | stale checkout links could still sell nothing, but should not exist | Polar dashboard |
| 6 | Remove leftover secrets/env values from local `.env*` files, password managers and CI secrets that refer to the deleted projects | leftover live-looking values | local machines, GitHub → Settings → Secrets |
| 7 | Enable GitHub secret scanning and push protection | currently disabled (verified) | GitHub → Settings → Code security |
| 8 | Throwaway Cloudflare resources `cf01-throwaway-static-1008a`, `cf01-throwaway-probe-1008a`, D1 `cf01-throwaway-d1-1008a` | cost-free but clutter; contain only synthetic data | **needs separate cleanup authorization**; not touched |

## Repository

The legacy Next.js/Supabase code stays in the tree for now (history, engine reuse). It is not deployed anywhere. Removing it is a later phase; this phase only isolates `apps/**` from root lint and type-check.

## Verification

`bash scripts/devtools/verify-containment.sh` (updated: treats `DEPLOYMENT_NOT_FOUND` and an unresolvable Supabase host as "gone"; still FAILs while GitHub secret scanning is disabled; Polar stays UNKNOWN until the owner confirms).
