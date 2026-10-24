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
| Original external source | `ikosmidis/detectseparation` `v0.4` tag commit `2bb2104338aeb49f6c01bacb7ede7cfa09033c88` | Code-level decision threshold, distinct from ROI solver controls |

## Contradictions and bounds (never silently normalize)

**A2-EVID-ERR-001 — Outer ZIP size typo:** committed #6 `EXACT_RATIONAL_PROOF_REPORT.md` says **862,966 bytes**; GitHub artifact metadata and independently retrieved ZIP say **842,695 bytes**. Actual inner tar.gz is **862,827 bytes**. SHA-256 values match verified outer/inner source. Preserve original report and add an erratum in future bounded maintenance, not an altered hash or test rerun.

**A2-EVID-BOUND-002 — Distinct serialization channels:** the A1 input CSV predictor tokens and 17-significant-digit model-matrix CSV tokens differ (31: x1 80/80, x2 79/80; 33: x1 117/128, x2 118/128). Independent proof uses original *full-precision model-matrix CSV* and checked response, not a regeneration from the rounded input. Numerical solver #7 must explicitly document both representations where relevant.

**A2-EVID-BOUND-003 — Non-independent supplemental LP:** original A1 direct probe uses lpSolveAPI/lp_solve, same underlying solver family as `detectseparation` ROI/lpsolve. There are no archived primal/dual residual fields. Do not promote that probe to independent replication.

**A2-EVID-BOUND-004 — Scientific meaning:** mathematical finiteness of the logistic MLE for fixture 33 does not establish causal population positivity, balancing, matching quality, or publishability.

## Evidence preservation rule

A GitHub Actions artifact may expire or be manually deleted. Preserve hashes and immutable metadata here, but arrange a separately authorized, integrity-verified and suitably access-controlled off-device evidence copy if long-term byte-level replay is required. Do not commit evidence archives, real clinical information or secrets into Git merely to make them 'permanent'.
