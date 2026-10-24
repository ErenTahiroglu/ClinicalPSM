# CP-STAT-02-A2 — Last independently reviewed status

**Snapshot date:** 2026-10-24. **Snapshot scientific evidence commit:** [`0f27cf3c5a5c0428fdcb3495caebdcaddcae79dd`](https://github.com/ErenTahiroglu/ClinicalPSM/commit/0f27cf3c5a5c0428fdcb3495caebdcaddcae79dd). **This is NOT an assertion of the current live branch HEAD; re-check GitHub.** `main` was `53fb05e7c8d9b77b46c4a5d8b7c9cc041345f6a6` at review.

## Scientific gates

| Gate | Evidence-backed state |
| --- | --- |
| CP-WEBR-02 | CLOSED under narrowly ratified scientific-equivalence amendment v1, not original 25/25 numeric parity |
| CP-STAT-02 | OPEN; separate 50+ fixture and 100% semantic/numeric tolerance requirements remain |
| A1 experimental separation diagnostic | 50 evaluated, 48 PASS, 2 FAIL, 0 unmeasured; `NOT_QUALIFIED` |
| A2-01 source semantics | #5 CLOSED, reviewer accepted `4ab9509f550f15af52bad8c2199c8102f10e61b7` |
| A2-02 archived exact ground truth | #6 CLOSED, reviewer accepted `0f27cf3c5a5c0428fdcb3495caebdcaddcae79dd` |
| F1 numerical root-cause investigation | #4 OPEN/INCOMPLETE; mathematical ground truth established, fixture-specific numerical mechanism UNRESOLVED |
| Production general-purpose separation detector | BLOCKED/NOT_QUALIFIED |
| Real clinical data, publication/release and main merge | NOT AUTHORIZED by these scientific experiments |

## Current A2 issue dependency order

[A2 parent #3](https://github.com/ErenTahiroglu/ClinicalPSM/issues/3) — OPEN.

- **Completed:** [#5 source audit](https://github.com/ErenTahiroglu/ClinicalPSM/issues/5), [#6 exact archived proof](https://github.com/ErenTahiroglu/ClinicalPSM/issues/6).
- **Next:** [#7 independently pinned SciPy/HiGHS numerical LP investigation](https://github.com/ErenTahiroglu/ClinicalPSM/issues/7) on frozen 31/33 matrices.
- **Parallel after explicit scope authorization:** [#8 negative-control precondition analysis](https://github.com/ErenTahiroglu/ClinicalPSM/issues/8).
- **Then:** [#9 independent F1 synthesis and #4 coordinator disposition](https://github.com/ErenTahiroglu/ClinicalPSM/issues/9).
- **Conditional downstream:** [#10 F2 design decision](https://github.com/ErenTahiroglu/ClinicalPSM/issues/10), [#11 F3 holdout validation](https://github.com/ErenTahiroglu/ClinicalPSM/issues/11), [#12 F4 Wasm/licensing screening](https://github.com/ErenTahiroglu/ClinicalPSM/issues/12), [#13 F5 final A2 review](https://github.com/ErenTahiroglu/ClinicalPSM/issues/13).
- **Governance pilot:** [#14 GitHub project memory](https://github.com/ErenTahiroglu/ClinicalPSM/issues/14). Completing this governance issue does not complete A2.

## Frozen mathematical facts; unresolved numerical behavior

Fixture `cpstat02a1_31_small_scale_complete`: on archived high-precision model matrix 80/80 signed margins are strictly positive for `β=(0,1,0)`, minimum exactly `5025148998247459/5000000000000000000000`. **Complete separation mathematically confirmed**; A1 candidate: quasi at `1e-4`, complete at `1e-8` — still an experimental FAIL.

Fixture `cpstat02a1_33_heterogeneous_scale_overlap`: three exact opposite-response anchor pairs `sub_0001/0002`, `sub_0003/0004`, `sub_0005/0006`; full rank `rank(A)=rank(X)=3`; no nonzero weak separator, finite unique logistic MLE for this design **confirmed**. A1 candidate: overlap at `1e-4`, false-positive quasi at `1e-8` — still an experimental FAIL.

**Source semantics:** `detectseparation v0.4` `control$tolerance` is a *package classification threshold* applied to LP coefficients / minimum margin, **not** the solver's primal feasibility tolerance. `solver_control` is separate. Root-cause attribution needs #7.

**Important data nuance:** A1 input fixture CSV predictor decimal strings are rounded relative to the separate, hash-pinned full-precision model-matrix CSV. #7 must specify which bytes/matrix enter each solver.

**Known documentation erratum:** the #6 report calls outer A1 artifact ZIP 862,966 bytes; GitHub and independent byte count show **842,695**. The inner `.tar.gz` is **862,827**. Digests and mathematical proofs agree. Do not silently overwrite the archived report.

## Work boundaries

No rerun of the 50 A1 scenarios, no changing expected class/tolerance to obtain 50 PASS, no automatic CI retry loop, no patient data, no production statistical/Worker modification, no release/deployment. Full repository issue/doc overhaul waits until A2 independent closure.
