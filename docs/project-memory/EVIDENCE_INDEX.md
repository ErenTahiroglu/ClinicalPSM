# A2 Evidence Index — SHA-bound sources and limitations

**This index points to evidence; it does not replace archived bytes or proofs.** Date: 2026-10-24.

| Source | Exact identity | Verified conclusion |
| --- | --- | --- |
| Original A1 run | [workflow 40097510667](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40097510667), GitHub artifact `12560933385` | 50 assessed; 48 PASS, 2 FAIL; detector `NOT_QUALIFIED` |
| A1 outer ZIP | **842,695 bytes**, SHA-256 `ebf2d899a4d1bb8404415183dd35d4d7eb221b5a33b0eec1f8d7e9eb4e5c5c6a` | Independently re-downloaded and hashed |
| A1 embedded tar.gz | **862,827 bytes**, SHA-256 `326b94c50d9cbbdf72967c0df0d495761e7b736afb30906e60030c3d1d8ae554` | 160/160 checksums verified |
| Source audit #5 | [commit `4ab9509f550f15af52bad8c2199c8102f10e61b7`](https://github.com/ErenTahiroglu/ClinicalPSM/commit/4ab9509f550f15af52bad8c2199c8102f10e61b7) | Exact `detectseparation` v0.4 source/tolerance semantics; [Security 40104551351](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40104551351) and [Cumulative 40104551342](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40104551342) succeeded |
| Frozen exact proof #6 | [commit `0f27cf3c5a5c0428fdcb3495caebdcaddcae79dd`](https://github.com/ErenTahiroglu/ClinicalPSM/commit/0f27cf3c5a5c0428fdcb3495caebdcaddcae79dd) | fixture 31 mathematically complete; fixture 33 mathematically no separation/finite MLE; [Security 40113354457](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40113354457) and [Cumulative 40113354461](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40113354461) succeeded |
| #6 proof artifacts | `experiments/cp-stat-02/a2-f1/exact-proof/{EXACT_RATIONAL_PROOF_REPORT.md,EXACT_PROOF_DECISION.md,proof-results.json,proof-evidence-manifest.json,exact_proof.py,proof-tests.py}` at above commit | Precise rows, full rational margins/rank, falsification tests and hash-bounded assertions |
| #5 source artifacts | `experiments/cp-stat-02/a2-f1/source-audit/{DETECTSEPARATION_V0.4_SOURCE_AUDIT.md,SOURCE_AUDIT_DECISION.md,source-provenance.json}` at above commit | Exact source paths, hashes, LP semantics |
| A2-03A preregistration (PLAN ONLY) | [commit `44b4faaa4b3ed9054a3b05be2741fb1c0d326cbe`](https://github.com/ErenTahiroglu/ClinicalPSM/commit/44b4faaa4b3ed9054a3b05be2741fb1c0d326cbe), 6 files under `experiments/cp-stat-02/a2-f1/highs-forensics/` | Source-/hash-pinned HiGHS 1.12.0 embedded in SciPy 1.18.1, Python 3.13.17, 32-call maximum; [#7 Red Team pre-execution terms](https://github.com/ErenTahiroglu/ClinicalPSM/issues/7#issuecomment-6387366807). Security `40115904473`, Cumulative `40115904460` SUCCESS; **no solver run** |
| Memory pilot #14 | [docs commit `bc2cceec8cd3308fb60842e0d7b33e89fc976d6d`](https://github.com/ErenTahiroglu/ClinicalPSM/commit/bc2cceec8cd3308fb60842e0d7b33e89fc976d6d) | 5 docs files; own Cumulative 40114611452 SUCCESS, own Security 40114611488 CANCELLED, next descendant Security 40115904473 SUCCESS with same docs; #14 CLOSED as scoped governance only |
| A2-03B first execution attempt — INFRA BLOCKED | [commit `cc607737e8725e2d774d8bf34686e9055572301e`](https://github.com/ErenTahiroglu/ClinicalPSM/commit/cc607737e8725e2d774d8bf34686e9055572301e), [CI 40121998475](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40121998475) | Workflow created staging directory before checkout; pip report path missing; 0/32 calls, 0/15 CI controls; no numerical evidence |
| A2-03B blocker artifact | [artifact 12571224297](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40121998475/artifacts/12571224297), **1,497 bytes**, SHA-256 `2fcc8b064b23a0f50ca4fe874606a4a1ea861b87913b321fc1d4155a1696273b` | Independent SHA and **3/3 payload** `SHA256SUMS` verified; 4 ZIP entries including manifest |
| Original external source | `ikosmidis/detectseparation` `v0.4` tag commit `2bb2104338aeb49f6c01bacb7ede7cfa09033c88` | Code-level decision threshold, distinct from ROI solver controls |

## Contradictions and bounds (never silently normalize)

**A2-EVID-ERR-001 — Outer ZIP size typo:** committed #6 `EXACT_RATIONAL_PROOF_REPORT.md` says **862,966 bytes**; GitHub artifact metadata and independently retrieved ZIP say **842,695 bytes**. Actual inner tar.gz is **862,827 bytes**. SHA-256 values match verified outer/inner source. Preserve original report and add an erratum in future bounded maintenance, not an altered hash or test rerun.

**A2-EVID-BOUND-002 — Distinct serialization channels:** the A1 input CSV predictor tokens and 17-significant-digit model-matrix CSV tokens differ (31: x1 80/80, x2 79/80; 33: x1 117/128, x2 118/128). Independent proof uses original *full-precision model-matrix CSV* and checked response, not a regeneration from the rounded input. Numerical solver #7 must explicitly document both representations where relevant.

**A2-EVID-BOUND-003 — Non-independent supplemental LP:** original A1 direct probe uses lpSolveAPI/lp_solve, same underlying solver family as `detectseparation` ROI/lpsolve. There are no archived primal/dual residual fields. Do not promote that probe to independent replication.

**A2-EVID-BOUND-004 — Scientific meaning:** mathematical finiteness of the logistic MLE for fixture 33 does not establish causal population positivity, balancing, matching quality, or publishability.

**A2-EVID-BOUND-005 — A2-03A protocol versus results:** A2-03A v1 and Red Team pre-execution clarifications fix the scientific plan, solver source and numeric contracts; this is not an executed LP dataset. Results, residuals, dual certificates and classification effects remain **UNMEASURED**. The later run must hash an additive v1.1 metric-interpretation annex before any LP and keep all historical v1 outcomes and thresholds untouched.

**A2-EVID-BOUND-006 — CI failure ≠ LP failure:** The 03B run stopped at locked-wheel installation before any numeric solver call. Wheel downloads did not prove installation or wheel/runtime qualification. Its `FAIL` should never be counted as an additional scientific sample. Run receipts include Security 40121998493 SUCCESS and Cumulative 40121998513 IN_PROGRESS at checkpoint; check live status.

## Evidence preservation rule

A GitHub Actions artifact may expire or be manually deleted. Preserve hashes and immutable metadata here, but arrange a separately authorized, integrity-verified and suitably access-controlled off-device evidence copy if long-term byte-level replay is required. Do not commit evidence archives, real clinical information or secrets into Git merely to make them 'permanent'.
