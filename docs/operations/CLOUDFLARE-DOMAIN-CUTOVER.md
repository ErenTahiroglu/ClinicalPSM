# clinicalpsm.com: Cloudflare cutover plan (prepared, NOT executed)

Nothing here has been run. Every step that changes DNS, deploys, or touches the Cloudflare zone needs the owner's separate written approval. Claude Code has only read-only access to this zone (DNS records, SSL settings and rulesets are not readable with the current token).

## 0. State observed (public, read-only, 2026-10-08)

| Item | Observation |
|---|---|
| Zone | `clinicalpsm.com` active on Cloudflare Free; NS `jermaine` / `shaz` |
| Apex | A `64.29.17.1`, `216.198.79.1` (Vercel); DNS-only |
| `www` | CNAME `09e0f8ac8620059b.vercel-dns-017.com` (Vercel); DNS-only |
| HTTP | both hosts return `404 DEPLOYMENT_NOT_FOUND` (Vercel project deleted) |
| Other records | no AAAA, MX, TXT, CAA at the apex (as seen by public resolvers) |

**Risk:** the records point at infrastructure the owner no longer controls. Until they are removed, the site is down and a future Vercel account claiming the same domain name could serve content on it. Removing them is the first cutover action and is safe to do even before the new site is live.

## 1. Preconditions (owner)

1. Decide `OPERATOR_NAME` and `CONTACT_EMAIL` (publicly displayed; use a role address, not a personal one if preferred).
2. Review `apps/web` privacy text and limitations with whoever is responsible for legal review.
3. Confirm the Red Team verdict on CLEAN-SLATE-00.
4. Approve the workers.dev deployment (step 1) in writing.

## 2. Steps

| # | Action | Who | Reversible | Verify |
|---|---|---|---|---|
| 1 | Deploy `clinicalpsm-web` to **workers.dev only**: `cd apps/web && CONTACT_EMAIL=… OPERATOR_NAME=… CANONICAL_HOST=www.clinicalpsm.com npm run build:prod && npx wrangler deploy` | owner | yes (delete Worker) | open `https://clinicalpsm-web.erentahiroglu.workers.dev/en/` and `/tr/`; run browser tests against it |
| 2 | In the DNS tab delete the Vercel-pointing apex A records and the `www` CNAME. Record their values first (screenshot) | owner | yes (re-add) | `verify-cutover.sh --pre` shows no Vercel pointers |
| 3 | Workers & Pages → `clinicalpsm-web` → Settings → Domains & Routes → add Custom Domain `www.clinicalpsm.com` | owner | yes | certificate becomes active; `https://www.clinicalpsm.com/en/` returns 200 |
| 3b | If the dashboard refuses Custom Domains on Free: add a proxied (orange-cloud) placeholder record for `www` and attach a **Route** `www.clinicalpsm.com/*` instead. Do not buy any add-on | owner | yes | same as 3 |
| 4 | Apex: add a proxied placeholder record for `@` (needed so Cloudflare answers), then a **Single Redirect** (Rules → Redirect Rules): when hostname equals `clinicalpsm.com`, dynamic target `concat("https://www.clinicalpsm.com", http.request.uri.path)` with query preserved, status **301** | owner | yes | `verify-cutover.sh --post` |
| 5 | SSL/TLS mode: **Full (strict)** is irrelevant for assets-only; ensure **Always Use HTTPS** is on | owner | yes | `http://` returns 301/308 |
| 6 | Wait at least 7 days with the site live. Only then rebuild with `HSTS_MAX_AGE=300`, redeploy, observe, and raise gradually. **No `includeSubDomains`, no `preload`** | owner | HSTS is sticky; raise slowly | header check |
| 7 | Optional: rebuild with `INDEXABLE=1` after Red Team approval of copy and legal text | owner | yes | canonical + sitemap present |
| 8 | Optional: DNS records for email (MX/SPF/DKIM/DMARC) only if a mailbox is introduced. None today | owner | n/a | n/a |

Use `docs/operations/cutover/wrangler.cutover.jsonc.example` for step 3 if deploying the domain from the CLI instead of the dashboard. It is a template and is read by nothing.

## 3. Rollback

Vercel no longer exists, so "roll back to the old site" is not possible. Rollback means: remove the custom domain and redirect, and either leave the hostnames unresolved or attach a one-page maintenance build of `apps/web`. The workers.dev URL remains available throughout.

## 4. Verification

```
bash scripts/devtools/verify-cutover.sh --pre    # before steps 2-4
bash scripts/devtools/verify-cutover.sh --post   # after: DNS, apex 301 with path+query, 6 pages 200, 404, headers, CSP, no cookie, TLS
bash scripts/devtools/verify-containment.sh      # legacy Vercel/Supabase stay gone
```

Manual: open `/en/` and `/tr/` in a private window; language switch keeps the page; demo runs and is labelled synthetic; DevTools Network shows only same-origin requests; no cookies or storage.

## 5. Zero-cost checks at cutover

- Dashboard shows **Workers Free** and no paid add-on prompts accepted.
- No Workers Paid, no Advanced Certificate Manager, no Argo, no Load Balancing, no Rate Limiting add-on.
- Custom Domain accepted on Free (step 3) or Route fallback used (step 3b). Record which.
- Observability stays off.
- Domain renewal cost is excluded from the zero-cost claim.
