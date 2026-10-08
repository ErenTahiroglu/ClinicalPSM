# CF-01 Live Verification Report (authorized Cloudflare Free test)

Date: 2026-10-08. Branch `research/cf-02-toolchain-live-verification`. All remote work ran with the owner's locally authenticated Wrangler OAuth session (no key or password was requested or typed in chat). Synthetic data only. Raw measurement summary: `docs/audits/data/cf01-live-measurements.json` (no tokens).

## 1. Account identity, plan and shared-quota safety
| Item | Result |
|---|---|
| Account | single account visible to the CLI: id `b2af…ec09`, workers.dev subdomain `erentahiroglu` (identity unambiguous) |
| Plan | **Owner attested "Workers Free"** from the dashboard. The API could not confirm it (subscriptions endpoint: `Authentication error` for this OAuth scope). **Anomaly:** see section 4: CPU limits of 10 ms were not enforced against measured 31-173 ms requests, and the owner's existing Worker `gelir-gider-api` shows p50 16 ms / p99 228 ms CPU with zero errors. Either the Free limit is not enforced as documented at this traffic level, or the account carries a paid entitlement. The plan is therefore **owner-attested, not independently verified** |
| Paid features / upgrade prompts | none encountered; no payment method or upgrade requested by the CLI |
| Pre-existing resources (read-only inventory before any deploy) | Workers: `erentahiroglu` (created 2026-04-17, modified 2026-09-02), `gelir-gider-api` (created 2026-10-02, modified 2026-10-04); D1: none; Pages projects: none; KV: none |
| Second website / shared quotas | At least two Workers already use the account: `erentahiroglu` (324 requests, CPU p50 0.5 ms in the last 7 days) and `gelir-gider-api` (578 requests, CPU p50 16.3 ms / p99 228 ms, 963 subrequests). Worker-count (2 of 100) and request quotas (about 900 of 700,000 per week-equivalent) are far from limits. Which of them is "the second website" was not asked; if it is `erentahiroglu`, it uses Workers and therefore shares the 100,000 requests/day quota |
| Existing resources overwritten? | No. Post-test inventory: both pre-existing Workers show unchanged `modified_on` timestamps |

## 2. Resources created (all throwaway; none deleted; cleanup needs separate approval)
| Resource | Identifier | Purpose |
|---|---|---|
| Worker `cf01-throwaway-static-1008a` | https://cf01-throwaway-static-1008a.erentahiroglu.workers.dev, version `42fa1588-3751-4235-802c-2253ce7b8a74` | Test A, static assets only (no script, no bindings) |
| Worker `cf01-throwaway-probe-1008a` | https://cf01-throwaway-probe-1008a.erentahiroglu.workers.dev, versions `2566211c-…` then `2ed531e8-fff3-49a3-a967-ad8ef9cdd9df` | Test B/C CPU and D1 probe (token-protected, fixed operations, D1 binding `DB`) |
| D1 `cf01-throwaway-d1-1008a` | uuid `2464cd26-33ed-4375-a1f1-47c7924c34c4` | Test C, one table `probe_items` (3 seed rows + 5 probe writes) |
| Worker secret `PROBE_TOKEN` | stored in Cloudflare; local copy in `/tmp/cp00/probe.token` (mode 600, outside the repo) | gate for the probe |
No DNS, route, custom domain, Vercel, Supabase or Polar setting was changed. The old CF-00 Worker and the diagnostic CF-01 test entry were not deployed.

## 3. Test A: static prototype on workers.dev
`node test/site.mjs https://cf01-throwaway-static-1008a.erentahiroglu.workers.dev` (Brave via Playwright): **75/75 passed** against the live URL: EN/TR pages, axe-core 0 violations on 8 pages, 375 px layout, skip link/keyboard, navigation and language switching, CSP-clean console, no third-party requests, headers on HTML/assets/404, no file input/form/input/external link, disabled purchase buttons without checkout links, working synthetic demo in a Web Worker with unvalidated/synthetic labels in both languages, no cookies or web storage. Live response headers confirmed (`curl -I /en/`): `content-security-policy` (no `unsafe-*`, `frame-ancestors 'none'`), `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `permissions-policy`, COOP/CORP, served by Cloudflare (IST colo). Static asset requests do not run Worker code.

## 4. Test B: CPU probe results (Cloudflare analytics, per-minute buckets, sampled)
Operations are fixed and synthetic (`synthetic-value-not-a-credential`). Statuses are all `success` unless stated; **no `exceededCpu` (Error 1102) event occurred in any run**.
| Operation | n | CPU p50 / p99 (ms) | Note |
|---|---|---|---|
| `/ping` | 10 | 0.9 / 1.1 | baseline |
| PBKDF2-SHA256 25,000 it. (WebCrypto) | 5 | 8.1 / 11.5 | |
| PBKDF2-SHA256 50,000 it. | 5 | 10.5-11.9 / 12.3 | |
| PBKDF2-SHA256 100,000 it. | 5 + 5 | 31.5 / 38.5 (second run) | success |
| PBKDF2-SHA256 200,000 and 600,000 it. | 5 + 5 each | n/a | **Platform rejects them**: `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported`. The same code succeeds on local workerd, so production WebCrypto caps PBKDF2 at 100,000: the OWASP-class 600,000 setting cannot be used through WebCrypto on Workers |
| Better Auth `hashPassword` (scrypt, library default, unmodified) | 5 | **138.6 / 156.6** | success |
| Better Auth hash + verify | 5 | 152-162 / 173.3 | success |
| Burst: 20 x hash at 120 ms spacing | 20 | 77.8 / 105.9 | success, 0 errors (a small bounded burst, not a load test) |
| D1 indexed read | 10 | 0.8 / 2.3 | `rows_read` 1 |
| D1 insert | 5 | 1.4 / 2.1 | `rows_read` 1, `rows_written` 2 (AUTOINCREMENT also updates `sqlite_sequence`) |
| D1 `count(*)` of 8 rows | 3 | 1.0 / 2.1 | `rows_read` 8 (full scan of a tiny table) |

Interpretation, kept separate from proof:
- Measured: a standard, unmodified password KDF costs about 140 ms of Cloudflare CPU, about 14x the documented Free limit of 10 ms; local Node estimates (about 47 ms) understated production cost about 3x.
- Measured: on this account those requests **completed without error**. Documentation says Free caps CPU at 10 ms and returns Error 1102 beyond it. The documentation page also says high quantiles can exceed the limit "without generating invocation errors" because of CPU-time rollover, but 5 consecutive 139 ms requests and a 20-request burst at about 78-106 ms is not explained by rollover on a plain reading. Not explained: possible causes are lenient enforcement at very low traffic, a different effective plan, or a platform change. **I do not conclude that password hashing is safe on Free**: the behavior may change without notice and contradicts the contract, and the plan could not be verified independently.
- Not measured: sustained traffic, the effect of the daily 100,000-request cap, any billing line items.
- Never reduced: no KDF parameter was lowered; the 100,000-iteration platform cap is a limit of the platform, not a choice.

## 5. Test C: D1
A disposable database was created and used (list/describe confirm it is the only D1 database on the account). Fixed indexed operations only, no caller SQL. CPU 0.8-1.4 ms and 1-2 rows per operation (above). No other database exists to be modified. No Supabase credentials were configured anywhere. Quota impact: tens of rows read/written of 5,000,000 / 100,000 daily.

## 6. Cost and quota confirmation
- Not independently verifiable from the CLI (the token has no billing scope). **Owner must confirm** in the dashboard (Billing > Subscriptions / Invoices) that no charge or subscription appeared and that the plan is still Free. No command in this session upgraded a plan, added a payment method, or enabled a paid add-on; no paid binding was used (D1 and Workers Free-eligible features, observability disabled).
- Usage generated: a few hundred static requests (browser suite) and about 150 probe requests, against a 100,000/day Worker request quota.

## 7. Commercial-use terms (from CF-01 evidence, unchanged)
No commercial-use prohibition found in the Self-Serve Subscription Agreement; Free Services may be ended at Cloudflare's sole discretion with no liability (2.6); no availability commitment. Not legal advice.

## 8. Outcome
| Criterion | Result |
|---|---|
| Static site on Free workers.dev with security headers and tests | **PASS (live)** |
| Minimal API/D1 operations within a small CPU budget | **PASS (live)**: D1 operations about 1 ms CPU |
| Standard password hashing within the documented 10 ms Free CPU | **FAIL by documentation, unexplained PASS in practice**: about 140 ms CPU accepted without errors. Not relied upon |
| OWASP-grade PBKDF2 via WebCrypto | **FAIL**: platform caps at 100,000 iterations |
| Plan = Free verified independently | **NOT VERIFIED** (owner attestation only; anomaly noted) |
| Zero charges verified | **OWNER CONFIRMATION REQUIRED** |

## 9. Requests to the owner
1. Check Billing for charges and confirm the plan; reconcile with the CPU anomaly (an existing Worker at p50 16 ms with no errors suggests the account may not be on a strict 10 ms Free limit).
2. Authorize cleanup of the three throwaway resources (listed in section 2) or ask me to keep them for further tests. Cleanup commands: `wrangler delete --name cf01-throwaway-static-1008a`, `wrangler delete --name cf01-throwaway-probe-1008a`, `wrangler d1 delete cf01-throwaway-d1-1008a`.
3. Rotate the committed database credential (see DEVTOOLS-00 report).
