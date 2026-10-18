# CF-01 Live Free-Plan Test Runbook (NOT EXECUTED: owner approval missing)

Status: **EXECUTED on 2026-10-08 under the owner's written authorization** (see `docs/audits/CF-01-LIVE-VERIFICATION-REPORT.md`). Deviations from this plan: the auth PoC was NOT deployed (instead a bounded token-protected CPU/D1 probe, `experiments/cf02-cpu-probe`, was); the plan could not be verified through the API and relied on the owner's attestation; cleanup is still pending separate approval. All resources are disposable and named `cf01-throwaway-*`.

## 1. Approval checklist (owner must confirm each item in writing)
1. I approve a disposable deployment to **workers.dev only** (no custom domain, no routes, no DNS change, `clinicalpsm.com` untouched).
2. The Cloudflare account is: `<account name/id given by owner>`, on the **Free** plan, and I accept that no plan upgrade or paid add-on will be activated.
3. I have listed my existing Workers, D1 databases, R2 buckets and Pages projects (or authorize a **read-only** inventory) so that names do not collide and nothing existing is modified.
4. The second website runs on: static assets / Workers / Pages Functions / D1 (state which). I accept that tests consume a small part of shared account quotas, and I will watch for effects on it.
5. Test data are synthetic only: no real user, password, clinical or billing data.
6. Cleanup of created resources happens **only** after I authorize it (resources are listed with their identifiers in the evidence report first).
7. Authentication method for the CLI: I will run `! npx wrangler login` myself (OAuth in my browser) or provide an API token with minimal scopes (Workers Scripts:Edit, D1:Edit for this account) that I create and revoke; the token is never pasted into chat or committed.

## 2. Read-only preflight (after approval)
```
npx wrangler whoami                      # confirm account and that the plan is Free
npx wrangler d1 list                     # inventory only
npx wrangler deployments list --name cf01-throwaway-static 2>/dev/null || true
```
Record names only. Abort if any `cf01-throwaway-*` already exists or the account is not Free.

## 3. Deployments (all with unique suffix `<date>-<rand>`)
A. **Static site** (`experiments/cf01-static-site`): `npx wrangler deploy --name cf01-throwaway-static-<sfx>` (assets only; observability off).
B. **Auth PoC** (`experiments/cf01-auth-poc`, deployable config only):
```
node scripts/build-and-inspect.mjs                 # must print OK
npx wrangler d1 create cf01-throwaway-<sfx>        # note the id; do not commit it
# set database_id in a LOCAL, uncommitted copy of wrangler.jsonc
npx wrangler d1 execute cf01-throwaway-<sfx> --remote --file migrations/0001_init.sql
printf '%s' "$(openssl rand -hex 32)" | npx wrangler secret put BETTER_AUTH_SECRET --name cf01-throwaway-auth-<sfx>
echo 'https://cf01-throwaway-auth-<sfx>.<subdomain>.workers.dev' | npx wrangler secret put BETTER_AUTH_URL --name cf01-throwaway-auth-<sfx>
npx wrangler deploy --name cf01-throwaway-auth-<sfx>
```
The production-shaped entry cannot send mail, so sign-up cannot complete and password hashing paths can only be exercised via sign-in of an account created through the **test** entrypoint, which must NOT be deployed. Therefore the live auth CPU test uses a second throwaway Worker built from `wrangler.test.jsonc` with **dummy** data **only if the owner explicitly approves deploying the test entrypoint** (it contains diagnostic routes: accept only on a workers.dev URL that is deleted right after, and never for the account that hosts real data). Otherwise measure hashing CPU with a minimal Worker that calls only the hashing primitive on a fixed synthetic string.
C. Optional: vinext SSR sample build from the CF-00 branch for a CPU comparison (only with separate approval).

## 4. Measurements (bounded, low volume; at most about 200 requests in total, no concurrency above 2)
| Target | Method | Record |
|---|---|---|
| Static asset delivery | 20 sequential `curl -sI` for HTML, CSS, worker JS | status, headers (CSP etc.), absence of Worker invocation metrics |
| Minimal API (`GET /api/me` unauthenticated 401 and authenticated) | 20 requests each | HTTP status, `exceededCpu` count |
| Credential primitive CPU | 10 invocations of hash and verify (standard parameters, unmodified) | dashboard "CPU Time per execution" p50/p99; whether Error 1102 appears |
| D1 | 20 reads, 10 writes via the PoC routes | rows read/written per call from D1 query metadata; dashboard D1 usage |
| Signed event route | 10 valid, 5 replay, 5 old-timestamp, 5 unmapped | outcomes vs contract EN1-EN6 |
Where to read CPU: Workers & Pages > the Worker > Metrics > "CPU Time per execution" (quantiles; sampled, may lag) and the GraphQL Analytics API (field names in Cloudflare's "Querying Workers Metrics with GraphQL" tutorial; not verified here). `exceededCpu` / Error 1102 means the 10 ms limit was exceeded.
Do not load-test or generate abusive traffic.

## 5. Cost verification
After the run: dashboard Billing shows no charges and no plan change; confirm the account is still Free; confirm the D1 and Workers usage pages show quotas, not overage; capture screenshots/identifiers (no secrets). Payment methods on file are the owner's to disclose; their presence must not change plans automatically.

## 6. Evidence to produce (append to `CF-01-INDEPENDENT-FEASIBILITY-EVIDENCE.md`)
Worker names, deployment ids, D1 database id, date/time, plan, measured CPU quantiles, any 1102/1027 events, request counts, D1 rows read/written, charges (expected 0), and the second website's status check.

## 7. Cleanup (separate authorization)
`npx wrangler delete --name <worker>`, `npx wrangler d1 delete cf01-throwaway-<sfx>`, `wrangler secret delete`, revoke any API token. Do not delete anything not listed in section 6.

## 8. Stop conditions
Any prompt to upgrade or add a payment method; any existing resource that would be modified; any error indicating quota exhaustion on the shared account; any uncertainty about which account is active.
