# SEC-00 R1: Production Exposure Status and Interim Containment (no production change was made)

## 1. What is actually live (read-only observation, 2026-10-08)
| Layer | Observation | Source |
|---|---|---|
| Vercel production | The only `production` deployment is `main` @ `dfa475b` (the pre-CP-00 application), state READY, domain `www.clinicalpsm.com` publicly reachable. Its pricing page renders the **Subscribe** buttons (no hold notice) | Vercel connector (metadata), `curl` GET of the public page |
| CP-00 application holds (503 on upload/results/create, hidden checkout) | **Not in production.** They exist only on branch previews | same |
| Vercel previews | All branch deployments (CP-00 R0..R3, CF, SEC-00) are `READY` but behind Vercel Authentication (302 to SSO), including the old production deployment's unique URL | `curl` |
| Supabase `ClinicalPSM` (`vmfypftkayycndvgpfrj`) | Migrations 001-009 only; 010/011/012 **not applied**. Advisor: SECURITY DEFINER functions `cleanup_expired_cache`, `handle_new_user`, `rls_auto_enable` executable by `anon` and `authenticated`; Auth leaked-password protection off; no Edge Functions; extensions `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements` | Supabase connector (metadata) |
| Polar | Checkout links still valid (provider-side; not changed); the public page shows checkout only to logged-in users | repo + page |
| GitHub | Public repo; secret scanning and push protection **disabled** (rechecked); no pull requests open | `gh api` |
| Codebase Memory MCP | Installed binary still differs from the verified release (WARN); three CBM processes are active, so replacement is still not safe | `check-tools.sh`, `pgrep` |
| Cloudflare | Three throwaway resources preserved (not touched) | previous report |

Consequence: with the current production deployment, any visitor can register, and an authenticated user can use the old upload and result routes and (through PostgREST/RPC) the undeployed-hardening gaps, against a database that the owner reports as nearly empty. The owner's inventory (0 analyses/uploads/objects) means little is currently at stake, but the surface is open and the unexplained user and audit rows are not yet adjudicated.

## 2. Interim containment options (ranked by safety and reversibility; none executed)
| # | Action (owner, in the dashboards) | Effect | Risk / cost | Reversible |
|---|---|---|---|---|
| 1 | Vercel > Project clinicalpsm > Settings > Deployment Protection > enable **Vercel Authentication for Production** (all deployments) | Public visitors, scrapers and sign-ups can no longer reach the production site or API (also blocks the Polar webhook, which is irrelevant with no subscriptions). Hobby plan includes Vercel Authentication for production per Vercel docs | The site becomes invisible to the public; free | Yes, one toggle |
| 2 | Supabase > Authentication > Sign In / Providers: turn **off "Allow new users to sign up"** | Closes self-registration at the database edge even if the site is reached by another route | Existing 2 users unaffected | Yes |
| 3 | Disable the two Polar checkout links/products (provider dashboard) | Removes the purchase path | None (no subscribers per owner) | Yes (archive, unarchive) |
| 4 | After a Tier 1 backup and the adjudication: apply migrations 011 and 012 on a Supabase **branch** first, verify (runbook), then production | Closes the anon/authenticated execute exposure and write grants | Production DB change; needs approval; schema drift (`rls_auto_enable`) must be understood first | Partly (rollback re-opens exposure) |
| 5 | Merge the CP-00 hold to `main` (PR from the CP-00 branch) | Production serves 503s on write routes and hides checkout | Code deploy; Red Team approval; main CI is red since 2026-04-17 | Yes (rollback deployment) |
| 6 | Retire: pause Supabase, remove Vercel project, move DNS to a Cloudflare static page | Ends the exposure | Only after adjudication = Path A and approvals | Pause yes; delete no |

**Recommended interim sequence (smallest, reversible, no code or data change):** 1, then 2, then 3. These three take effect immediately, need no deployment, and leave all evidence in place. Options 4-6 follow the adjudication and Red Team decisions.

## 3. Safe merge / retirement sequence
1. Owner: interim containment steps 1-3 above.
2. Owner: run `SEC-00-R1-INVENTORY-ADJUDICATION.md` and return the counts/yes-no list; Red Team classifies Path A or B.
3. Owner: enable GitHub secret scanning + push protection (settings only, free).
4. Fix `main` CI separately (runner Node 24 / lockfile) so that PR checks are meaningful; do not bundle with the security PRs.
5. Open the draft PRs (`SEC-00-PR-DRAFTS.md`): first `security/sec-00-untrack-vscode-main` into `main`; second the CP-00 branch PR (after its own Red Team approval) which already carries the untrack change via `security/sec-00-untrack-vscode-cp00` if merged first. Merge only on Red Team approval; merging `main` redeploys production.
6. Path A only: Tier 1 backup (and Tier 2 only if section 7 of the adjudication calls for it) -> Polar links disabled -> Supabase pause (observe) -> final approval -> delete project, remove Vercel project, move DNS. Path B: stop at containment, counsel, no deletion.
7. History rewrite: optional and separate; the exposed credential belongs to a deleted project.
Cloudflare throwaway resources stay until cleanup is approved separately. No CP-01 work and no Cloudflare migration are started.
