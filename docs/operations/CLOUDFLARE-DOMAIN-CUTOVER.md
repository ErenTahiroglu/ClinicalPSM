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
| D4 | clinicalpsm.com | A | `@` | `192.0.2.0`, **Proxied** | **Add** (after step S2) | placeholder so Cloudflare can answer the apex and apply the redirect; per the Custom Domains doc |
| W1 | (automatic) | | `www` | created by Cloudflare when the Custom Domain is added | **do not add manually** | |
| — | | MX/TXT/CAA/other | | | **leave** | none are known; do not add email records unless a mailbox is introduced |

D1 and D2 may be done early (they are safe on their own: the site is already down and removal ends the takeover risk). D4 and W1 happen at cutover.

## 2. Preconditions (owner)

1. Staging verified (`CLEAN-SLATE-01-LIVE-STAGING-REPORT.md`) and Red Team decision received.
2. Public `OPERATOR_NAME` and `CONTACT_EMAIL` chosen. The production build refuses without them; no identity is invented.
3. Owner has decided separately whether the site may be indexed. Default: **not indexable**.
4. Privacy and limitation text reviewed by whoever is responsible for legal review.

## 3. Steps with operator checkpoints

Mark each checkpoint in the PR or a private note; stop if any check fails.

| # | Action | Check before continuing |
|---|---|---|
| S1 | Build production artifact: `cd apps/web && CONTACT_EMAIL=… OPERATOR_NAME=… CANONICAL_HOST=www.clinicalpsm.com npm run build:prod` (no `INDEXABLE`, no `HSTS_MAX_AGE`) | exit 0; `public/_headers` contains `X-Robots-Tag: noindex, nofollow`; footer shows the chosen identity |
| S2 | Delete D1, D2 (and D3 if present) | `bash scripts/devtools/verify-cutover.sh --pre` shows no Vercel pointer |
| S3 | Deploy the Worker: `npx wrangler deploy` (config name `clinicalpsm-web`, `workers.dev` only; **no route in the file**) | `https://clinicalpsm-web.erentahiroglu.workers.dev/en/` → 200; `node test/live.mjs <url>` passes |
| S4 | Dashboard: Workers & Pages → `clinicalpsm-web` → Settings → Domains & Routes → Add → **Custom Domain** → `www.clinicalpsm.com` | dashboard shows the domain active and the certificate issued; **no payment prompt**. Record what the dashboard says about the certificate |
| S5 | `curl -sI https://www.clinicalpsm.com/en/` | 200, headers present, `cf-ray` present |
| S6 | Add D4 (`@` A `192.0.2.0` proxied) | record shows orange cloud |
| S7 | Rules → Redirect Rules → Create rule → **Wildcard pattern**. Request URL `http*://clinicalpsm.com/*`; Target URL `https://www.clinicalpsm.com/${2}`; **Status code 302 (temporary, first)**; **Preserve query string: enabled**. Deploy | see tests T1–T6 below |
| S8 | When T1–T6 pass, edit the rule: status **301** | rerun T1–T6 expecting 301 |
| S9 | Ensure SSL/TLS → Edge Certificates → **Always Use HTTPS** is on | T3 passes |
| S10 | Wait ≥ 7 days. Only then consider HSTS: rebuild with `HSTS_MAX_AGE=300`, redeploy, observe, raise gradually. **Never `includeSubDomains` or `preload`** until every subdomain is under control | header check |
| S11 | Indexing: only on explicit owner decision, rebuild with `INDEXABLE=1`. The build then removes the noindex meta, the `X-Robots-Tag` header, adds canonical and sitemap on all pages including root | `node test/production-build.mjs`; live `node test/live.mjs <url> --indexable` |

**Why wildcard `http*://…/*`:** the docs' example (`https://example.com/*`) redirects HTTPS only and leaves `http://example.com/…` unchanged. Using `http*` covers both schemes in one rule (Free allows 10 Single Redirects per zone; this uses 1). `${2}` is the path captured by the second `*`, so the original path is kept. Query strings are kept only because **Preserve query string** is enabled; do not use a target built from the path alone.

**Why 302 first:** a 301 is cached by browsers and search engines. Verify behaviour with a temporary redirect, then promote it.

## 4. Tests after S7/S8 (read-only; `verify-cutover.sh --post` automates them)

| ID | Request | Expect |
|---|---|---|
| T1 | `https://clinicalpsm.com/en/pricing/?a=1&b=two` | 302/301, `Location: https://www.clinicalpsm.com/en/pricing/?a=1&b=two` (path and query unchanged) |
| T2 | `http://clinicalpsm.com/en/?x=1` | redirect to `https://www.clinicalpsm.com/en/?x=1` (one hop or a short chain, always ending on https www) |
| T3 | `http://www.clinicalpsm.com/en/` | redirect to `https://www.clinicalpsm.com/en/` |
| T4 | `https://clinicalpsm.com//evil.example/` and `https://clinicalpsm.com/?next=https://evil.example` | `Location` host is still `www.clinicalpsm.com`; never `evil.example` |
| T5 | follow redirects from every URL above, max 5 hops | terminates on a 200; no loop |
| T6 | `https://www.clinicalpsm.com/en/`, `/tr/`, `/en/demo/`, `/tr/privacy/`, unknown path | 200 / 200 / 200 / 200 / 404; CSP, nosniff, DENY, no-referrer, no `Set-Cookie`, no `unsafe-` |

## 5. Custom Domains on Free: what is and is not known

- Documented: Custom Domains need an active zone and a Worker; Cloudflare creates the DNS record and certificate. A hostname with an existing record cannot be used (hence D1/D2).
- Documented: creating one also generates an "Advanced Certificate" for the hostname; the page states no separate Advanced Certificate Manager subscription is required. The docs do not say the plan tier this works on.
- **Observed on this account (read-only API):** a Custom Domain `erentahiroglu.com → erentahiroglu` exists on a Free zone, with an issued certificate. So Custom Domains on a Free zone work for this account. This is evidence for the account, not for `clinicalpsm.com`; confirm at S4.
- Account plan tier itself is not readable with the token (subscriptions: Authentication error). The owner confirms "Workers Free" in the dashboard.
- **Route fallback** (use only if S4 is refused): add a proxied A `www` → `192.0.2.0`, then attach a Route `www.clinicalpsm.com/*` to `clinicalpsm-web` (`workers_routes` is permitted by the token but is never used here). The assets-only Worker serves it identically. Do not enable any paid add-on to make either path work.

## 6. Rollback

Vercel no longer exists. Rollback = remove the Custom Domain and the redirect rule (or switch the rule off), leaving the hostnames unresolved or serving a maintenance build. The `workers.dev` URL stays up throughout. Nothing in this runbook depends on removed data.

## 7. Zero-cost checks at cutover

Dashboard shows **Workers Free**; no Workers Paid, ACM, Argo, Load Balancing, Rate Limiting or Spectrum add-on is enabled or offered-and-accepted; observability off; domain renewal excluded by definition. If any step requires a payment, stop.
