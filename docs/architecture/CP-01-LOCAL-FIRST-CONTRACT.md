# CP-01 Local-First Architecture Contract (specification only)

Not implemented in CP-00. CP-01 starts only after an explicit Red Team decision.

## 1. Target flow

```
CSV file → browser memory → statistical Web Worker → local export (download)
```

The server is never in the path of the dataset or of row-level outputs.

## 2. Data classification

| Class | Examples | Server may receive? |
|---|---|---|
| R: row-level clinical | CSV bytes, parsed rows, per-row propensity scores, matched-pair indices, matched dataset | **No** |
| S: schema-revealing | Column names, covariate/outcome names, category labels, filenames | **No** (default) |
| A: aggregate result | Balance table, SMD values, counts | **No** by default (see exception E1) |
| O: operational | user id, plan, entitlement counters, timestamps, app version, coarse status (started/completed/error code) | Yes |

## 3. Normative requirements (testable)

| ID | Requirement | Verification |
|---|---|---|
| L1 | No network request carries R or S data during upload→analyze→export. | Playwright test intercepting all requests with a synthetic CSV; assert no request body/URL contains any synthetic cell value or column name. |
| L2 | `/api/analyses/[id]/upload` and Storage `csv-uploads` write paths are removed (not just held); bucket policy denies INSERT. | Static test: no `.storage` write in `src/`; DB test: insert denied. |
| L3 | `analyses.result_summary` and `analysis_cache` no longer receive R data; column dropped or constrained to `NULL`. | Migration test + static grep. |
| L4 | The worker is the only code that holds parsed rows; no persistence (no IndexedDB/localStorage/service worker cache) by default. | Static grep; browser storage inspection in E2E. |
| L5 | CSP `connect-src` excludes any host not required for identity/payments; unused `va.vercel-scripts.com` removed unless justified. | Header test. |
| L6 | Errors surfaced to the server contain only an error **code**, never message text derived from data. | Unit test with synthetic payload sentinels. |
| L7 | Audit log stores no filenames, column names, or row counts finer than a bucketed range; no `error.stack`; fix singleton client defect. | Unit test on audit payloads. |
| L8 | Entitlement/quota accounting uses a content-free server call (e.g., `POST /api/usage/consume` with only an opaque run id), performed before computation and idempotent. | Contract test of request schema (allowlist of fields). |
| L9 | Export is generated in-browser and contains a reproducibility manifest (engine version, parameters, seed, library hashes) without server involvement. | Unit + E2E. |
| L10 | Statistical engine must pass independent validation against reference outputs (e.g., R MatchIt on synthetic data) before the UI may say "validated" or "publication-ready". Until then copy states "not independently validated". | Golden-file tests; copy lint test. |
| L11 | Method honesty: UI exposes only methods the worker executes; the selected method is part of `PsmConfig` and the worker rejects unknown methods rather than substituting. | Unit test on worker input. |
| L12 | Outcome variable, if collected, is consumed by an implemented estimator or not collected. | Wizard test. |
| L13 | CP-00 constants removed or flipped only in a PR referencing the Red Team decision; DB triggers from 010 dropped by a reviewed migration. | PR checklist. |
| L14 | Account deletion also purges server-side residue (audit rows tied to the user, legacy tables) per documented retention. | Integration test on branch DB. |

## 4. Server exceptions (must be justified and recorded)

- **E1: optional saved aggregate summary.** If a user wants dashboard history, the *client* may upload only an allowlisted aggregate (counts, mean |SMD|) with no column names. Default off; requires explicit user action and a schema allowlist test. Justification: dashboard continuity. Needs Red Team approval.
- **E2: legacy read-only access** to pre-CP-00 analyses until the legacy plan (CP-00-LEGACY-DATA-PLAN) completes.
- **E3: billing** data held by Polar and `profiles` billing ids.

No other exception is permitted without an amendment to this document.

## 5. Out of scope for CP-01 spec

WebR/MatchIt integration, publication bundles, payment-provider change, pricing. These need their own phases.

## 6. Entry criteria for CP-01

- Red Team accepts the CP-00 closure report.
- Legacy-data Phase A inventory available (even if deletion deferred).
- Decision on E1.
