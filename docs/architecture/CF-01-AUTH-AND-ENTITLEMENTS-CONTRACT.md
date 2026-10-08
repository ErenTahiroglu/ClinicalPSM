# CF-01: Authentication and Entitlements Contract (future; nothing here is live)

Payments are **not active**. No Polar, Paddle or Lemon Squeezy integration is enabled in any prototype. This is a testable contract for CP-06/CP-07, with provider semantics taken from vendor documentation (2026-10-08) and the places where they are still unknown.

## 1. Principles
1. Entitlements are written only by verified provider events handled server-side; never from client input.
2. Every state change is atomic (one D1 `batch()` transaction) and idempotent.
3. No bespoke password or credential protocol. Standard, maintained mechanisms only.
4. Application-layer authorization on every query (no RLS in D1); foreign and absent resources are indistinguishable (404).
5. Diagnostics/test routes are absent from deployable artifacts (build inspection is a release gate).

## 2. Authentication contract (any option that ships)
| ID | Requirement | Test |
|---|---|---|
| AU1 | Registration/sign-in creates a session cookie (HttpOnly, Secure, SameSite) valid for a bounded time | contract suite (done for option A) |
| AU2 | Session renewal extends expiry only after `updateAge`; revocation on logout and on credential reset | done (A) |
| AU3 | Email verification gate where email is used; single-use tokens; unknown-email responses are indistinguishable | done (A) |
| AU4 | Brute-force limits per IP and per account; 429 on excess; limiter storage failure fails closed | partial (A: IP limiter 429) |
| AU5 | Account deletion removes user, sessions, credentials and dependent rows (FK cascade); other users unaffected | done (A) |
| AU6 | Two-user isolation: read, list, delete across users impossible; same response for absent and foreign ids | done (A) |
| AU7 | OAuth variant: state and PKCE enforced, redirect URI allowlist, ID-token signature/audience/expiry verified, account linking only on verified email | NOT TESTED (needs provider or local mock OIDC) |
| AU8 | Passkey variant: RP ID/origin checks, counter/clone detection, recovery path defined | NOT TESTED |
| AU9 | Password variant only if live Free CPU evidence shows a standard KDF fits; no reduced work factor | BLOCKED (live test) |

## 3. Entitlement and webhook contract
### 3.1 Provider facts (documentation)
| Topic | Polar (docs.polar.sh) | Paddle Billing (developer.paddle.com) |
|---|---|---|
| Signature | `webhook-signature`; secrets created on/after 2026-09-08 follow Standard Webhooks (`whsec_…` passed as is); older secrets use a Polar HMAC (base64 of the full secret first); SDKs from 1.0.0-alpha.19 try both | `Paddle-Signature: ts=…;h1=…`, HMAC-SHA256 over `ts:rawBody`; multiple `h1` possible during rotation; SDK default tolerance 5 s |
| Retries | up to 10 with exponential backoff; any non-2xx (incl. 3xx) is a failure; 10 s timeout (2 s recommended); endpoint auto-disabled after 10 consecutive failures | live: 60 retries over 3 days; 200 within 5 s required; then `failed`, replay available via API |
| Ordering | no guarantee documented; documented sequences per scenario (e.g. cancel-at-period-end: `updated`+`canceled` now, `updated`+`revoked` later) | "We can't guarantee the order"; store and compare `occurred_at` before changing state |
| Duplicates / idempotency id | not documented (event id not mentioned on the page) | not addressed on the page; SDK example checks event ID |
| Events relevant | `subscription.created/active/updated/canceled/uncanceled/revoked/past_due/cycled/paused/resumed/migrated`, `order.refunded`, `refund.created/updated` | `subscription.created`, `subscription.updated` (catch-all), `transaction.completed` (confirm payment) |

### 3.2 Contract
| ID | Requirement |
|---|---|
| EN1 | Verify signature over the **raw** body with constant-time comparison and a bounded timestamp window before any parsing or DB access |
| EN2 | Derive a unique event key from the provider id when it exists; if the provider supplies none, derive a key from a hash of the raw body plus provider event type and timestamp, and document it |
| EN3 | Process in one D1 batch: insert event key (PK) + conditional update. A duplicate key aborts the whole batch and is acknowledged 2xx without effect (demonstrated in the PoC) |
| EN4 | Ordering: apply only if the event's provider timestamp is newer than the stored `last_event_at` for that subscription/user (PoC enforces; replaces the CP-00 R3 documented gap). A late "active" after "revoked" must not re-grant (PoC test) |
| EN5 | Grant only for states proven to be paid (`active`, `trialing`; decide `past_due` policy explicitly). `incomplete`, `unpaid`, `canceled`-ended grant nothing |
| EN6 | Unmapped or deleted user: do not consume the event key; return a retryable non-2xx while the account may still appear; after a bounded window, record to a dead-letter table and alert (PoC returns 409 and does not consume) |
| EN7 | Refunds/reversals/chargebacks: revoke or downgrade according to a written policy; the event type set must be mapped (Polar `order.refunded`, `refund.*`; Paddle adjustment/transaction events). **Not implemented or tested** |
| EN8 | Transient DB failure: 5xx so the provider retries; never 2xx for a failed write (CP-00 R3 behaviour) |
| EN9 | Response within the provider timeout; heavy work after acknowledgement only via a durable queue (not available on Free without further research) |
| EN10 | Secrets rotation: accept two secrets during rotation; never log payloads or signatures |
| EN11 | Client-facing API exposes read-only entitlement; there is no route that writes it (PoC: POST/PUT/PATCH attempts are 404/405 and have no effect) |

### 3.3 PoC fidelity statement
The PoC event (`{type, created_at, data:{user_id, plan, subscription_id}}`, header HMAC over `id.ts.body`) is a **simplified stand-in**. It proves D1 mechanics (atomic batch, PK idempotency, timestamp ordering, unmapped user handling, tamper tests) but not Polar/Paddle payload shapes, signature variants, or refund handling. Adapting it requires provider-specific tests with provider-published fixtures or sandbox events, authorized by the owner.

## 4. Release gates before any entitlement code is deployed
1. Provider chosen and approved (CP-06); sandbox only until legal setup is complete.
2. Contract tests EN1-EN11 pass using provider sandbox fixtures.
3. Build inspection shows no diagnostic routes; negative HTTP tests pass.
4. Live Free-plan CPU measurement for the webhook and any auth path.
5. Red Team review.
