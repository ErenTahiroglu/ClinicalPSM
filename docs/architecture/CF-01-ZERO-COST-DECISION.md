# CF-01: Zero-Cost Architecture Decision

**Status: PROPOSED. Not approved.** Evidence: `docs/audits/CF-01-INDEPENDENT-FEASIBILITY-EVIDENCE.md`.

## 1. Decision summary
1. Initial public launch is **accountless and static**: Cloudflare Workers Static Assets, browser-local processing, no server code, no D1, no accounts, no email, no payments. Mandatory cost: **$0** (static-asset requests are free and unlimited; no CPU budget is involved).
2. **Do not build password authentication on Workers Free.** A defensible password KDF costs about 47 ms CPU (local Node indicator) versus the 10 ms Free limit, and weakening the work factor is rejected. If accounts become necessary before a paid plan, prefer **delegated OAuth sign-in with established providers** (no server-side password hashing, no email service for login) and verify it live first.
3. Accounts, entitlements and payments are deferred to the commercial phases (CP-06/CP-07), when the real constraints (merchant of record, volume, revenue) are known and the "zero mandatory cost" assumption can be re-evaluated against real revenue.
4. Vercel/Supabase are not migrated: they are retired or contained (see `CP-00-SUPABASE-RETIREMENT-OPTIONS.md`). Hosting the static preview on Cloudflare removes the need for Vercel entirely.

## 2. Authentication options (no bespoke cryptography)
| Option | Security | Ops complexity | Recovery | Email service | Workers CPU (Free 10 ms) | Zero-cost fit |
|---|---|---|---|---|---|---|
| A. Better Auth email + password (default scrypt, unmodified) | Maintained library, standard KDF | Medium: sessions in D1, rate limits, verification and reset flows | Email reset | **Required** (Workers Email Sending needs Paid; third-party free tier, e.g. 100/day) | **About 47 ms CPU/hash locally: exceeds** (live test needed) | **Not viable on Free** unless live evidence shows otherwise |
| B. Passwordless: passkeys (WebAuthn) | Strong; phishing-resistant | Higher: credential storage, RP configuration, device-loss recovery | Needs a second factor/email or recovery codes; poor without email | Usually yes for recovery | Signature verification about 0.1 ms: fits | Possible; recovery design is the hard part |
| B'. Passwordless: email magic link / OTP | Depends on mail security | Medium | Inbox = recovery | **Required** | Negligible CPU | Fits CPU, but mail cap (100/day) is the limit |
| C. Managed OAuth/OIDC (Google, GitHub, etc.) | Provider-grade authentication; no passwords stored | Low-medium: client registration, token exchange | Provider account recovery | **Not required for login** | Token exchange is a subrequest (I/O, not CPU); ID-token signature check is small | Best fit; provider terms, consent-screen verification and region/DPAs need review |
| D. No authentication until the paid product | None to attack | None | n/a | No | None | **Fits exactly**; no accounts means nothing to protect or recover |

Recommendation: **D now, C later** (re-check B for passkeys once recovery is designed). A is blocked unless a live Free-plan test proves headroom; if no secure password option fits, the correct outcome is "accountless initial launch", which is what this decision proposes.

Not exercised in CF-01 (documented as testable contracts instead, see the auth contract): real OAuth providers, passkeys, magic links. Only option A has an executable suite (53/53 on the default hashing).

## 3. Feature availability map (until the validation phases)
| Capability | Initial launch | Unlocked by |
|---|---|---|
| Static information, limitations, pricing display | Yes | now |
| Synthetic demo of the current engine, labelled unvalidated | Yes | now |
| Process the user's own CSV in the browser | No | CP-01 (local-first) |
| Statistically validated matching, optimal matching, MatchIt equivalence | No | CP-02 (reference contract), CP-03 (engine) |
| Diagnostics and publication reports | No | CP-04, CP-05 |
| Accounts, saved analyses | No | after CP-06 decision; OAuth first |
| Purchases, subscriptions, entitlements | No | CP-06 (approved merchant of record + legal), CP-07 |
| Product-centered UI/UX | Placeholder only | CP-08 |

## 4. Budget (all mandatory items $0 in this configuration)
Accountless static launch uses no Worker invocations and no D1: static asset requests are free and unlimited, Workers request/CPU/D1 quotas are untouched, so the second website is unaffected by this site's traffic. Abuse risk is bandwidth/asset serving only; no billing exists on Free (hard stops, not overage). If a Worker or D1 is added later, use the updated numbers: an authenticated read now costs 3 D1 rows (was 83), sign-in 4 reads/7 writes, sign-up 5 reads/13 writes. Hypothetical small-launch day (100 DAU, 30 calls each, 20 sign-ups, assumptions mine): about 9.6k rows read (0.2% of 5M), about 1,040 rows written (1.0% of 100k), about 3,100 requests (3.1% of 100k). Under a flood, the 100,000 requests/day cap binds first (3 rows/request makes D1 reads no longer the first limit); writes cap near 14k sign-ins or 7.6k sign-ups a day; mail caps at 100/day. Free quotas are not proven application behaviour. Live verification is blocked on owner approval.

## 5. Risks that remain
- Free plans carry no availability commitment and can be changed or ended at Cloudflare's sole discretion (Agreement 2.6/8).
- Account-shared quotas with the second website.
- The static prototype is not a final product page and has no legal text beyond limitations; legal review is owed before real launch.
- The statistical engine in the demo is unvalidated and must stay labelled.
- Logging pricing change from 2026-12-01 (observability disabled in the configs).

## 6. Phase gates (unchanged, not merged)
CP-00 containment/retirement; CF-01 this feasibility gate; CP-01 local-first architecture; CP-02 reference contract; CP-03 validated engine; CP-04 diagnostics; CP-05 publication bundle; CP-06 merchant of record; CP-07 commercial validation; CP-08 UI/UX. No phase is authorized by this document.

## 7. Verdict
`CONDITIONAL_PASS_CANDIDATE`. Conditions: (1) owner-approved live Free-plan deployment of the static site to confirm delivery, headers and zero charges; (2) any future Worker/D1 component re-tested live for CPU; (3) account design deferred to CP-06 with OAuth first; (4) legal review of terms and data processing; (5) Red Team acceptance.

## 8. Addendum after the authorized live test (2026-10-08)
See `docs/audits/CF-01-LIVE-VERIFICATION-REPORT.md`. The static prototype passed all 75 browser checks live on workers.dev; D1 operations cost about 1 ms CPU. Standard password hashing cost about 140 ms CPU and was nevertheless accepted with no Error 1102, contradicting the documented 10 ms Free limit (cause unexplained; plan owner-attested only). Because enforcement cannot be relied upon, the decision stands: **accountless static launch now, delegated OAuth later, no password service on Free.** Additional hard facts: production WebCrypto rejects PBKDF2 above 100,000 iterations, so OWASP-class PBKDF2 (600,000) is unavailable there; libraries must use scrypt (about 140 ms CPU) instead.
