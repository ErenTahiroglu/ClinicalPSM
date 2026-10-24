# A2-01-R2 source-audit decision

**Verdict:** `A2_01_SOURCE_AUDIT_READY_FOR_RED_TEAM`

The exact `detectseparation` v0.4 source is tied to commit `2bb2104338aeb49f6c01bacb7ede7cfa09033c88`. The corrected helper path is `R/auxiliary.R:3–8`; the earlier draft's `zzz_conventions.R` attribution was wrong. The helper checks/loads non-`lpsolve` ROI plugins and does not alter LP construction or solver tolerance. The exact helper bytes match Git blob `06f6e232467bdbc49eff730ea7f086cf879b70ff` and have SHA-256 `a01f9c00107174c349c327684d553afdd74834c0579f0d486f485bc888f60c46`.

The central terminology conclusion is verified: `detectseparation`'s `control$tolerance` is a package decision threshold. In the primary ROI LP it thresholds returned coefficient coordinates; in the second LP it thresholds the minimum margin; in coefficient post-processing it determines which values are mapped to zero versus signed infinity. It is not passed as the solver's feasibility setting. `solver_control` is passed separately to `ROI_solve`.

The exact A1-pinned ROI 1.0-2 and ROI.plugin.lpsolve 1.0-2 source archives were retrieved from their current CRAN contrib URLs and match the archive byte counts and SHA-256 values in the immutable A1 source-integrity manifest. They establish that the omitted (t) bound in `separation_type_ROI()` is ([0,+\infty)): ROI 1.0-2 `V_bound()` defaults to `ld=0`, `ud=Inf`, and the plugin materializes those defaults across variables before applying the explicit coefficient bounds. The exact A1 solver-control path is also known. With `solver_control=list()`, ROI.plugin.lpsolve sets objective sense and neutral verbosity, then retains lpSolveAPI defaults for other controls. The version-matched lpSolveAPI manual documents `epslevel="tight"`, `epsb=1e-10`, `epsd=1e-9`, `epsel=1e-12`, and `epspivot=2e-7`; these are distinct from `detectseparation`'s package threshold.

## Fixture-level judgments

These remain source-only mechanism findings, not reclassifications:

| Fixture | Preserved A1 result | Source-supported possibilities | Root cause |
|---|---|---|---|
| `cpstat02a1_31_small_scale_complete` | `TOLERANCE_SENSITIVE_UNRESOLVED`; expected complete; quasi at `1e-4`, complete at `1e-8`. | Primary coefficient-threshold crossing, complete-margin threshold crossing, and scale sensitivity are possible. | `REQUIRES_FIXTURE_NUMERICAL_EVIDENCE` |
| `cpstat02a1_33_heterogeneous_scale_overlap` | `FALSE_POSITIVE`; expected overlap/finite MLE; overlap at `1e-4`, quasi at `1e-8`. | The primary coefficient threshold and scale sensitivity could explain the false transition from no separation to separation. The complete-margin threshold can distinguish complete from quasi only after the primary LP returns separation; it cannot by itself explain the overlap-to-quasi transition. | `REQUIRES_FIXTURE_NUMERICAL_EVIDENCE` |

No archived matrix reconstruction or fixture-specific LP-value analysis was performed. Issue #6 must establish the exact mathematical witness/anchor proofs from immutable A1 data. Issue #7 must provide the separately authorized independent HiGHS results. Neither can tune thresholds or change the A1 outcomes.

## Issue #5 acceptance assessment

- **Satisfied:** exact v0.4 tag/commit; corrected helper path and behavior; Git blob identities for the five package R files; SHA-256 for the three primary source files and auxiliary helper; source hashes and versions for A1-pinned ROI and ROI.plugin.lpsolve archives; source call path; ROI LP constraints and `t` bound; lpSolveAPI branch formulations, statuses, bounds, controls and return behavior; package versus solver tolerance; A1 terminology correction; fixture-specific causality left unresolved; historical A1 result and artifact preservation.
- **Explicitly unverified:** `R/zzz_conventions.R` content bytes and SHA-256 (its immutable Git blob identity is recorded; independent review identifies it as aliases); the manual PDF's local-file SHA-256 (manual version is verified from its cover); exact fixture-specific causes and numerical residuals (assigned to Issues #6 and #7).
- **No execution outside scope:** zero A1 or fixture reruns, zero new scientific LP experiments, zero SciPy/HiGHS runs, zero scientific CI runs, and no production changes.

The initial wrong CRAN Archive URL returned HTTP 404. The exact current CRAN contrib URLs then succeeded for both pinned dependencies, and their bytes matched the A1 source-integrity manifest. No repeated request loop was used.

The source-access blocker is now removed. Issue #4 may proceed to its separately authorized fixture-specific numerical forensics after independent Red Team review; this source audit does not establish fixture 31 or 33's mathematical root cause and does not start Issue #6 or #7.
