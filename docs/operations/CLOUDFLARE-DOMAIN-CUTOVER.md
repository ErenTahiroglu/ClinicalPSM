# clinicalpsm.com: Cloudflare cutover runbook (prepared, NOT executed)

Nothing here has been run. Every step that changes DNS, deploys to the domain, or edits zone rules needs the owner's separate written approval. Claude Code's token can read the zone object but **not** its DNS records, SSL settings or rulesets (verified: Authentication error), so the owner performs every zone step in the dashboard.

Sources: Cloudflare docs, Workers *Custom Domains* (updated 2026-09-29), Rules *Create a redirect rule in the dashboard* and *Redirect from root to WWW* (updated 2026-05-05). Read 2026-10-08.

## 0. Observed state (public DNS and HTTP, 2026-10-08)

| Host | Public resolvers | HTTP |
|---|---|---|
| `clinicalpsm.com` | A `216.198.79.65`, `64.29.17.65` (earlier today `.1` variants; Vercel anycast, order rotates) | `http://` → 308 to `https://clinicalpsm.com/`; https → 404 `DEPLOYMENT_NOT_FOUND` |
| `www.clinicalpsm.com` | CNAME `09e0f8ac8620059b.vercel-dns-017.com` → A `64.29.17.1`, `216.198.79.1` | 404 `DEPLOYMENT_NOT_FOUND` |
| NS | `shaz` / `jermaine` `.ns.cloudflare.com` | |
| AAAA, MX, TXT, CAA at apex; `_dmarc`, `mail`, `api`, `staging`, `app` | none seen | |

The authoritative nameservers could not be queried directly from this network (port 53 timeout), so the list is what public resolvers return, not the dashboard's record table. Records the zone holds that resolvers do not return (for example disabled or unrelated ones) are unknown.

**Stale/dangling:** all apex A records and the `www` CNAME point to a Vercel project that no longer exists.

## 1. DNS change sheet (owner approves each row; nothing was changed)

Before starting: screenshot the full DNS table of `clinicalpsm.com` and confirm each "Delete" row matches exactly. Anything not on this sheet stays untouched. Do not touch `erentahiroglu.com` or any other zone.

| # | Zone | Type | Name | Content | Action | Why |
|---|---|---|---|---|---|---|
| D1 | clinicalpsm.com | A | `@` | `64.29.17.1`, `64.29.17.65`, `216.198.79.1`, `216.198.79.65` (whichever exist) | **Delete** | stale Vercel, takeover risk |
| D2 | clinicalpsm.com | CNAME | `www` | `09e0f8ac8620059b.vercel-dns-017.com` | **Delete** | stale Vercel; a Custom Domain cannot be created over an existing record |
| D3 | clinicalpsm.com | any other `vercel`-related record (`_vercel` TXT, etc.) | | | **Delete only if present and clearly Vercel-owned** | stale |
| D4 | clinicalpsm.com | A | `@` | `192.0.2.0`, **Proxied** | **Add** (at C8) | placeholder so Cloudflare can answer the apex and apply the redirect; per the Custom Domains doc |
| W1 | (automatic) | | `www` | created by Cloudflare when the Custom Domain is added | **do not add manually** | |
| — | | MX/TXT/CAA/other | | | **leave** | none are known; do not add email records unless a mailbox is introduced |

D1 and D2 may be done early (C3) (they are safe on their own: the site is already down and removal ends the takeover risk). D4 (C8) and W1 (C7) happen at cutover.

## 2. Authorization map

| Class | What | Status |
|---|---|---|
| **Already approved (bounded, used)** | Isolated, temporary Cloudflare Free `workers.dev` deployments with synthetic data and no bindings; read-only inventory. Used for `cs01-staging-web-1008b` | done; **does not extend to anything below** |
| **Needs explicit owner approval, per action** | any change to `clinicalpsm.com` DNS; deleting or adding records; creating the production Worker `clinicalpsm-web`; Custom Domain or Route; Redirect Rule; Always Use HTTPS or any zone setting; HSTS; `INDEXABLE=1`; deleting staging or `cf01-throwaway-*` resources | **NOT GRANTED** |
| **Never** | other zones (`erentahiroglu.com`), existing Workers `erentahiroglu` and `gelir-gider-api`, unrelated DNS records, any paid add-on, D1/R2/KV/secrets for this site | prohibited |

## 3. Operator checkpoints C1–C12

Each checkpoint needs the owner's "go" in writing before it starts (rows marked **approval**). Stop on the first failed check; nothing later depends on skipping one.

| # | Checkpoint | Approval | Do | Pass criteria (evidence to keep) |
|---|---|---|---|---|
| C1 | Confirm Cloudflare **Free** plan | none (read) | Dashboard → account billing/plan: Workers = Free; zone `clinicalpsm.com` plan = Free. Screenshot | both Free; no payment method prompt. (The API token cannot read the plan tier) |
| C2 | Review **actual DNS records** | none (read) | Dashboard → `clinicalpsm.com` → DNS → Records. Screenshot the full table. Compare with §1 | every record is on the §1 sheet, or is listed as "leave". Anything unexpected: stop and ask |
| C3 | Remove dangling **Vercel A/CNAME** | **approval** | Delete D1, D2 (and D3 only if clearly Vercel-owned). Nothing else | `bash scripts/devtools/verify-cutover.sh --pre` reports no Vercel pointer; unrelated records unchanged versus the C2 screenshot |
| C4 | **Release-build identity** | **approval** (the values are the owner's) | Owner supplies public `OPERATOR_NAME`, `CONTACT_EMAIL`; `CANONICAL_HOST=www.clinicalpsm.com`. `cd apps/web && CONTACT_EMAIL=… OPERATOR_NAME=… CANONICAL_HOST=www.clinicalpsm.com npm run build:prod`. No `INDEXABLE`, no `HSTS_MAX_AGE` | exit 0; `_headers` has `X-Robots-Tag: noindex, nofollow`; footer and privacy page show the owner's values; `security.txt` present. Refusal without values is expected behaviour |
| C5 | Deploy static Worker to **its own workers.dev** | **approval** | `npx wrangler deploy` with `apps/web/wrangler.jsonc` (name `clinicalpsm-web`; no routes) | prints only `clinicalpsm-web.erentahiroglu.workers.dev`; no binding |
| C6 | **Live pre-domain verification** | none (read) | `node test/site.mjs https://clinicalpsm-web.erentahiroglu.workers.dev` and `node test/live.mjs <same URL>` | 87/87 and 37/37 (as on staging); stop if different |
| C7 | **Custom Domain** for `www` | **approval** | Worker → Settings → Domains & Routes → Add → Custom Domain → `www.clinicalpsm.com` (fallback in §5 only if refused) | domain Active; certificate Active; no payment prompt (record what the dashboard says about the certificate) |
| C8 | **TLS and HTTPS enforcement** | **approval** (zone setting) | SSL/TLS → Edge Certificates → Always Use HTTPS **on**. Add D4 (`@` A `192.0.2.0`, Proxied) | `curl -I https://www.clinicalpsm.com/en/` 200 with `cf-ray`; `http://www…` ends on `https://www…` (verified in C10) |
| C9 | **Apex redirect** with path and query | **approval** | Rules → Redirect Rules → wildcard `http*://clinicalpsm.com/*` → `https://www.clinicalpsm.com/${2}`, **Preserve query string on**, status **302** first. After C10 passes, change to **301** and rerun C10 with `REQUIRE_PERMANENT=1` | see C10 |
| C10 | **Real-domain verification** | none (read) | `bash scripts/devtools/verify-cutover.sh --post` (add `REQUIRE_PERMANENT=1` after promotion to 301). Then a manual browser pass: EN and TR home, language switch, demo runs, privacy page, DevTools Network shows same-origin only, no cookies/storage | script exits 0 (DNS, all redirect-chain cases for http/https × apex/www, headers, noindex, TLS); browser pass clean |
| C11 | **Zero paid add-ons** | none (read) | Dashboard: no Workers Paid, ACM, Argo, Load Balancing, Rate Limiting, Spectrum, Images or R2 enabled; no new invoice line | all absent. If any payment is requested at any step: stop |
| C12 | **Release evidence and rollback plan** | none | Save: C1/C2 screenshots, the exact commit SHA built, build env names (not values of secrets; none exist), `verify-cutover.sh --post` output, Worker version id | evidence stored by the owner (not in Git if it shows account ids). Rollback below |

Later, each needs separate approval and is **not part of the first release**: HSTS (wait ≥ 7 days, `HSTS_MAX_AGE=300`, raise slowly, never `includeSubDomains`/`preload`), indexing (`INDEXABLE=1`, then `EXPECT_INDEXABLE=1` when verifying), email DNS (only if a mailbox is introduced).

**Why wildcard `http*://…/*`:** the docs' example (`https://example.com/*`) redirects HTTPS only and leaves `http://` unchanged. `http*` covers both schemes in one rule (Free: 10 Single Redirects per zone; this uses 1). `${2}` is the path captured by the second `*`. The query string is kept only because **Preserve query string** is enabled.

**Why 302 first:** a 301 is cached by browsers and search engines.

**Redirect chains:** Always Use HTTPS may add a hop (`http://apex` → `https://apex` → `https://www`). The verifier accepts up to 4 redirects and checks the *outcome*: final scheme https, final host `www.clinicalpsm.com`, path and query unchanged, final status 200, no loop, no host outside the apex/www pair, every redirect status in 301/302/307/308 (301/308 only with `REQUIRE_PERMANENT=1`). A plain-HTTP answer without upgrade is a **FAIL**. Off-domain probes (`//evil.example/`, `?next=https://evil.example`, `/%2f%2fevil.example`, `/\evil.example`) are run against apex and www on both schemes.

**Local proof of the evaluator before cutover:** `node scripts/devtools/cutover-redirects.test.mjs` (24 synthetic chains, including the failure modes above). Run live against staging with `CUTOVER_APEX=<staging host> CUTOVER_WWW=<staging host> node scripts/devtools/cutover-redirects.mjs`, it correctly FAILs the three plain-HTTP cases, because `workers.dev` answers 200 on `http://`.

## 4. Minimal DNS checklist (print and tick)

Zone `clinicalpsm.com` only.

| ☐ | Record | Do |
|---|---|---|
| ☐ | A `@` = `64.29.17.1`, `64.29.17.65`, `216.198.79.1`, `216.198.79.65` (Vercel) | delete (C3) |
| ☐ | CNAME `www` = `09e0f8ac8620059b.vercel-dns-017.com` | delete (C3) |
| ☐ | any TXT/CNAME clearly named `vercel` | delete only if present (C3) |
| ☐ | A `@` = `192.0.2.0`, Proxied | add (C8) |
| ☐ | `www` | do **not** add by hand; Cloudflare creates it (C7) |
| ☐ | everything else, MX/TXT/CAA, `erentahiroglu.com` | leave untouched |

## 5. Custom Domains on Free: what is and is not known

- Documented: Custom Domains need an active zone and a Worker; Cloudflare creates the DNS record and certificate. A hostname with an existing record cannot be used (hence D1/D2).
- Documented: creating one also generates an "Advanced Certificate" for the hostname; the page states no separate Advanced Certificate Manager subscription is required. The docs do not say the plan tier this works on.
- **Observed on this account (read-only API):** a Custom Domain `erentahiroglu.com → erentahiroglu` exists on a Free zone, with an issued certificate. So Custom Domains on a Free zone work for this account. This is evidence for the account, not for `clinicalpsm.com`; confirm at C7.
- Account plan tier itself is not readable with the token (subscriptions: Authentication error). The owner confirms "Workers Free" in the dashboard.
- **Route fallback** (use only if C7 is refused): add a proxied A `www` → `192.0.2.0`, then attach a Route `www.clinicalpsm.com/*` to `clinicalpsm-web` (`workers_routes` is permitted by the token but is never used here). The assets-only Worker serves it identically. Do not enable any paid add-on to make either path work.

## 6. Rollback

Vercel no longer exists, so there is no "old site" to return to. Rollback means making the new site disappear safely, in this order (each is reversible and needs the owner):

1. Redirect problem only: switch the Redirect Rule off or back to 302 (C9). Content on `www` is unaffected.
2. Content problem: redeploy the previous Worker version (`npx wrangler rollback`, or Dashboard → Worker → Deployments → select previous version). The version id is saved in C12.
3. Domain problem: remove the Custom Domain `www.clinicalpsm.com` (C7) and delete the placeholder A `@` (C8). The hostnames then stop resolving to the site; **do not recreate the Vercel records**.
4. The `workers.dev` URL stays up throughout, so the site can be shown while the domain is fixed.

Nothing in this runbook depends on removed data. A bad 301 may stay cached in browsers; this is why C9 starts at 302.

## 7. Zero-cost checks at cutover

Dashboard shows **Workers Free**; no Workers Paid, ACM, Argo, Load Balancing, Rate Limiting or Spectrum add-on is enabled or offered-and-accepted; observability off; domain renewal excluded by definition. If any step requires a payment, stop.
