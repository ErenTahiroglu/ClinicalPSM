# CLEAN-SLATE-00: Cloudflare architecture

Status: proposed for Red Team review. Baseline `3172a7d`. Branch `phase/clean-slate-cloudflare`.

## 1. Decision

ClinicalPSM v0 runs entirely on **Cloudflare Workers Static Assets (Free plan)**, assets-only, with all computation in the visitor's browser. The Next.js + Supabase + Vercel stack is not extended. Supabase migrations 010 to 012 are not pursued.

| Concern | v0 | Why |
|---|---|---|
| Hosting | Workers Static Assets, assets-only Worker `clinicalpsm-web` | Static asset requests are free and unlimited; no Worker script, no CPU budget involved |
| Accounts / DB / email / payment | none | Nothing demonstrates a need; each is a data-protection and cost surface |
| Clinical upload | none | No server-side processing of patient-level data |
| Engine | existing `src/lib/psm/worker.ts` bundled unmodified into `assets/psm-worker.js`, used only by the synthetic demo | Reuses the unit-tested engine; no new statistics claimed |
| Languages | EN and TR, generated from `apps/web/src/content.json` | Parity by construction; tests cover both |
| Pricing | informational page, purchase buttons disabled | No payment API |

## 2. Layout

```
apps/web/
  src/ content.json style.css demo.js lang.js
  build.mjs                 generates public/ (HTML, assets, _headers, robots, 404, optional sitemap/security.txt)
  wrangler.jsonc            assets-only; no routes, vars, bindings, main
  test/site.mjs             87 browser checks (Playwright, axe, CSP, headers, demo, no-upload)
  test/production-build.mjs 16 fail-closed checks for --production
  public/                   generated, git-ignored
```

Pages (each EN and TR): home, synthetic demo, pricing and availability, scientific limitations, privacy. Root `/` is a no-JS language chooser; unknown paths return a bilingual 404.

## 3. Release configuration (build-time, no secrets)

`node build.mjs` produces a **preview** build: `noindex`, placeholders for operator and contact, no HSTS.
`node build.mjs --production` **refuses to build** (exit 1) unless these are valid:

| Variable | Effect |
|---|---|
| `CONTACT_EMAIL` | footer, privacy page, `/.well-known/security.txt` |
| `OPERATOR_NAME` | footer, privacy page (must not contain brackets) |
| `CANONICAL_HOST` | canonical links, sitemap, security.txt canonical |
| `INDEXABLE=1` (optional) | removes `noindex`; adds canonical, sitemap, `Allow` robots. Default is noindex even in production |
| `HSTS_MAX_AGE` (optional) | adds `Strict-Transport-Security: max-age=N` only. Never `includeSubDomains` or `preload` |

None of these are secrets. The owner supplies them at build time; they are not stored in the repository.

## 4. Security properties (verified locally, see report)

- CSP `default-src 'none'`; scripts, styles, workers `'self'` only; no `unsafe-*`; `frame-ancestors 'none'`; `form-action 'none'`.
- No cookies, no web storage, no forms, no inputs, no file controls, no third-party requests.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, restrictive `Permissions-Policy`, COOP/CORP same-origin.
- Demo data is generated in the browser; output is labelled synthetic and unvalidated.

## 5. Zero-cost validation

| Item | Evidence | Status |
|---|---|---|
| Static asset requests free and unlimited; limits 20,000 files and 25 MiB each | Cloudflare docs; `cf-free-compat.mjs` asserts 18 files, largest 5 KiB | verified (docs + local) |
| No Worker script means no Workers Free request or CPU quota is consumed | docs for assets-only Workers | documented |
| `_headers` ≤ 100 rules, `_redirects` not needed | `cf-free-compat.mjs --strict-web` | verified locally |
| Universal SSL free | docs | documented |
| Single Redirects: 10 rules per zone on Free; 1 needed | docs | documented |
| Custom Domains on the Free plan | docs do not say; **verify at cutover**; fallback is a Route on a proxied DNS record | **open** |
| Observability off (log pricing change) | `wrangler.jsonc`, gate-enforced | verified locally |
| Domain registration/renewal | excluded by the owner's definition | n/a |

"USD 0 recurring" is a statement about the **v0 static site** on the current Free plan. It is **not** a guarantee for any future commercial product (accounts, upload, payment need Workers CPU, D1, email, and legal work; CF-02 measured these but they are not built).

## 6. Risks and limits

1. Cloudflare may change Free-plan terms; the gate detects config drift, not pricing drift.
2. Custom Domain availability on Free is unconfirmed (see above).
3. The engine is not validated against R or any reference (CP-02/03). The demo is therefore synthetic only and says so.
4. Preview builds are public on `workers.dev` once deployed; they are `noindex` but not private.
5. Legal text is a plain-language disclosure, not legal advice; operator identity must be set before launch.

## 7. Out of scope

Authentication, billing, upload, D1, email, analytics, final UI/UX (CP-08), statistical validation (CP-02 to CP-04).
