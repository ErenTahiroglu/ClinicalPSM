# `detectseparation` 0.4 source audit — A2-01-R2, ready for independent review

**Audit scope:** CP-STAT-02-A2-01 / GitHub Issue #5 only

**Status:** `A2_01_SOURCE_AUDIT_READY_FOR_RED_TEAM`

**Audited upstream revision:** tag `v0.4`, commit `2bb2104338aeb49f6c01bacb7ede7cfa09033c88`

**Repository baseline:** `579a2532a5fe210917e2b37e7d7f950c8d01d78f`

## Corrected helper provenance

The earlier draft incorrectly placed `check_ROI_solver()` in `R/zzz_conventions.R`. The helper is in [`R/auxiliary.R:3–8`](https://github.com/ikosmidis/detectseparation/blob/2bb2104338aeb49f6c01bacb7ede7cfa09033c88/R/auxiliary.R). Its exact v0.4 raw source was retrieved and its Git blob and SHA-256 were verified. It only handles non-`lpsolve` solver plugin checking/loading: it forms `ROI.plugin.<solver>`, calls `pkgload::check_suggested(...)`, then `requireNamespace(...)`. For `solver="lpsolve"` the helper does nothing. It does not modify LP constraints or solver feasibility controls.

`R/zzz_conventions.R` is a different file. Its Git blob identity in the verified v0.4 commit tree is `1a6654a7319a73ffd05f85f0df7c8370ee9593c3`; independent review identifies it as exported aliases. Its contents were not downloaded in this bounded task, so no SHA-256 is claimed for it. The former failed request for that wrong path is retained in provenance as history, not as an outstanding helper blocker.

The frozen A1 archive was not changed and A1 was not rerun. The local artifact ZIP SHA-256 matches the supplied GitHub artifact digest. No fixture matrix was reconstructed and no LP experiment was run in this issue.

## Source provenance

The exact source URLs, SHA-256 values, Git blob identities, package archive digests, and corrected helper path are recorded in [`source-provenance.json`](./source-provenance.json). Source citations below use commit-pinned GitHub permalinks, not current `main`.

| File | Commit-pinned source | Relevant lines | Git blob SHA | SHA-256 |
|---|---|---:|---|---|
| `R/auxiliary.R` | [source](https://github.com/ikosmidis/detectseparation/blob/2bb2104338aeb49f6c01bacb7ede7cfa09033c88/R/auxiliary.R) | 1–9 | `06f6e232467bdbc49eff730ea7f086cf879b70ff` | `a01f9c00107174c349c327684d553afdd74834c0579f0d486f485bc888f60c46` |
| `R/zzz_conventions.R` | [source](https://github.com/ikosmidis/detectseparation/blob/2bb2104338aeb49f6c01bacb7ede7cfa09033c88/R/zzz_conventions.R) | file identity only | `1a6654a7319a73ffd05f85f0df7c8370ee9593c3` | `UNVERIFIED — bytes not downloaded` |
| `R/detect_separation.R` | [source](https://github.com/ikosmidis/detectseparation/blob/2bb2104338aeb49f6c01bacb7ede7cfa09033c88/R/detect_separation.R) | 225–268, 306–376 | `b39f41bb4df29e76c25a924e239a78b1ad027b4e` | `e257302365de9f9d8bedc82b8f8e17340eb8023bca0e0c64696104a56c934224` |
| `R/detect_infinite_estimates.R` | [source](https://github.com/ikosmidis/detectseparation/blob/2bb2104338aeb49f6c01bacb7ede7cfa09033c88/R/detect_infinite_estimates.R) | 162–249 | `006b12127a5feb5572c0060c5d7900546df93ca6` | `4739edb72606716ef721021235f6401b63ac8b82a2b4997c17ef73b3753f18b5` |
| `R/linear_programs.R` | [source](https://github.com/ikosmidis/detectseparation/blob/2bb2104338aeb49f6c01bacb7ede7cfa09033c88/R/linear_programs.R) | 39–82, 116–236, 239–286 | `4230f83bfa5db960081ba1ba147e16a54f239c6e` | `ca37986a24f9ea33e188fb15ccaf2e0376434a8214785ef781ff0488ca4c1b18` |

The Git blob IDs are Git object identities, not SHA-256 values. The three originally downloaded source files and `auxiliary.R` were checked byte-for-byte against their listed blob IDs using `git hash-object`. `zzz_conventions.R` was checked by its immutable commit-tree blob entry only.

## Call path established from retrieved source

```text
stats::glm(..., method = detectseparation::detect_separation,
           control = detect_separation_control(...))
  -> detect_separation(x, y, ...)
     -> .detect_infinite_estimates(...)
        -> detect_separation_control(...) when control is a list
           -> check_ROI_solver(solver) [R/auxiliary.R:3–8]
        -> QR rank / alias handling; zero-weight removal; response preparation
        -> separator_ROI(...) OR separator_lpSolveAPI(...)
        -> coefficient post-processing using control$tolerance
     -> if separation_type is TRUE and primary outcome is TRUE:
          separation_type_ROI(...), regardless of selected implementation
```

Source locations: [`detect_separation.R:225–268`](https://github.com/ikosmidis/detectseparation/blob/2bb2104338aeb49f6c01bacb7ede7cfa09033c88/R/detect_separation.R#L225-L268), [`detect_infinite_estimates.R:162–249`](https://github.com/ikosmidis/detectseparation/blob/2bb2104338aeb49f6c01bacb7ede7cfa09033c88/R/detect_infinite_estimates.R#L162-L249), [`auxiliary.R:3–8`](https://github.com/ikosmidis/detectseparation/blob/2bb2104338aeb49f6c01bacb7ede7cfa09033c88/R/auxiliary.R#L3-L8), and [`linear_programs.R:39–82`](https://github.com/ikosmidis/detectseparation/blob/2bb2104338aeb49f6c01bacb7ede7cfa09033c88/R/linear_programs.R#L39-L82).

`.detect_infinite_estimates()` first makes `x` a matrix, uses `qr(x)` to identify and remove aliased columns, and returns `NA` coefficient slots for aliases (`detect_infinite_estimates.R:173–205`). It drops rows with zero weights and expands non-boundary binomial responses into paired 0/1 rows (`:207–217`). It then calls the implementation selected by `control$implementation` (`:218–224`). Returned coefficients are named from the retained columns; values whose absolute magnitude is below `control$tolerance` are set to zero before remaining values are mapped to signed infinity (`:233–242`). This last use affects the reported infinite-coefficient pattern, not the complete/quasi flag itself.

## Verified control semantics

`detect_separation_control()` defaults to `implementation="ROI"`, `solver="lpsolve"`, `linear_program="primal"`, `purpose="find"`, `tolerance=1e-4`, `solver_control=list()`, and `separation_type=FALSE` (`detect_separation.R:359–376`). Its documentation calls `tolerance` the maximum absolute LP-variable value before separation is declared (`:308–315`) and describes `solver_control` as a separate, solver-specific list (`:323–327`).

### `ROI` primary separation LP

For binary response $y_i\in\{0,1\}$, define $s_i=2y_i-1$ and $Z=\operatorname{diag}(s)X$. `separator_ROI()` constructs the LP

\[
\max_{\beta}\quad \mathbf 1^T Z\beta
\qquad\text{subject to}\quad Z\beta\geq 0,\quad -1\leq\beta_j\leq 1.
\]

(`linear_programs.R:47–66`). It sends this model to `ROI::ROI_solve(..., solver=solver, control=solver_control)` (`:70`). After the solve, the package tests `any(abs(sol) > tolerance)` (`:71–74`). It accepts ROI `status_code == 0L`; any other canonical status changes the outcome to `NA` (`:75–78`). ROI.plugin.lpsolve registers raw lp_solve statuses 0 (optimal) and 9 (solved by presolve) as canonical success 0, and its other listed statuses as failure 1 (`ROI.plugin.lpsolve/R/status_codes.R:8–17`). Thus the package decision applies a threshold to returned coefficient coordinates only after an accepted solver result. `tolerance` is not inserted into the LP constraints, the objective, or the solver-control list. The source comment at `:68–69` mentions an unbounded LP as indicating separation, but the explicitly bounded coefficient variables make this ROI formulation bounded for finite input data; the implementation accepts only canonical status 0 and maps other statuses to `NA`.

The source establishes the implementation's bounded, finite-precision decision rule. It does not make that rule an exact mathematical feasibility oracle. The coefficient threshold is coordinate-scale dependent.

### `separation_type = TRUE`

When the primary outcome is exactly `TRUE`, `detect_separation()` calls a second LP. With the same $Z$, the source formulation is

\[
\max_{\beta,t}\quad t
\qquad\text{subject to}\quad Z\beta\geq t\mathbf 1,
\quad -1\leq\beta_j\leq1,
\quad t\geq0.
\]

The final bound follows from the exact A1-pinned dependency sources. `detectseparation` calls `ROI::V_bound` with `nobj=m+1` and supplies explicit lower/upper bounds only at indices `1:m` (`linear_programs.R:257–261`). ROI 1.0-2's `V_bound()` defaults are `ld=0, ud=Inf` (`ROI/R/bounds.R:138, 177–210`), so the omitted `(m+1)`th variable (t) receives `[0,+Inf)`. ROI.plugin.lpsolve 1.0-2 builds bounds by initializing all lower bounds to zero and upper bounds to infinity before replacing explicit entries (`R/plugin.R:26–33, 141–145`). Both exact CRAN source archive digests match the immutable A1 source-integrity manifest; see [`source-provenance.json`](./source-provenance.json). The computed margin is classified complete exactly when `minimum_margin > tolerance` (`linear_programs.R:273–281`). Optimal status is represented by `status_code == 0L`; any other status gives `NA`. `detect_separation()` stores that result in `complete`; `FALSE` prints as quasi-complete, `TRUE` as complete, and `NA` as undetermined (`detect_separation.R:249–257, 281–289`). If the primary result is false or `NA`, the second LP is not run because the call is guarded by `isTRUE(out$outcome)`.

The second LP uses the same `tolerance` argument but applies it to the normalized minimum margin, not to a solver feasibility setting. Since the coefficient box is in the supplied parameterization, rescaling a predictor changes the numerical value of the margin achievable within that box even though it does not change the underlying column space or existence of a separating direction. This is a source-supported scaling mechanism; its role in fixtures 31 and 33 requires their archived LP solutions and residuals.

### `solver_control` and solver feasibility

The control constructor stores `solver_control` separately from `tolerance`; the ROI separator passes the former directly to `ROI_solve` and does not derive or overwrite it from the latter. For the A1 `solver="lpsolve"`, `check_ROI_solver()` does nothing (`auxiliary.R:3–8`). ROI.plugin.lpsolve 1.0-2 builds the lpSolve model and applies the control list passed to its solve method (`R/plugin.R:115–145, 184–202`). With A1's empty `solver_control`, the plugin sets its default `verbose="neutral"` and objective `sense`; lpSolveAPI retains its defaults for other controls.

The official lpSolveAPI 5.5.2.0-17.15 manual documents `epslevel="tight"` by default, with `epsb=1e-10` (RHS values treated as zero), `epsd=1e-9` (reduced costs treated as zero), `epsel=1e-12` (rounding-to-zero threshold), and `epspivot=2e-7` (pivot treated as zero), pp. 31–34 ([official CRAN manual](https://cran.r-project.org/web/packages/lpSolveAPI/lpSolveAPI.pdf)). These are underlying solver controls. `epsb` is not the same quantity as `detectseparation`'s coefficient/margin threshold, and `control$tolerance` is not passed as any of them. The plugin source and manual are version-matched to A1's pinned ROI.plugin.lpsolve 1.0-2 and lpSolveAPI 5.5.2.0-17.15.

Therefore the source-backed answer to the central question is: **the `detectseparation` `tolerance` argument is not the LP solver's primal feasibility tolerance.** It is used as one or more post-solve package decision thresholds and for coefficient-output post-processing. The solver's own controls are a separate argument.

## `lpSolveAPI` implementation differences (source-level)

`separator_lpSolveAPI()` is a separate code path (`linear_programs.R:116–236`). It encodes the response with `y.bar = -sign(y - 0.5)`, so for binary outcomes $W=\operatorname{diag}(y.bar)X=-Z$; negating all rows preserves separation existence and reverses the coefficient direction. The official lpSolveAPI 5.5.2.0-17.15 manual maps constraint type 1 to `<=`, type 2 to `>=`, type 3 to `=`, and reports the status codes used below ([manual, pp. 14, 48, 56](https://cran.r-project.org/web/packages/lpSolveAPI/lpSolveAPI.pdf)). This is the A1-pinned lpSolveAPI version. Four branches follow:

| Branch | Construction visible in v0.4 source | Status / tolerance handling |
|---|---|---|
| primal / test | Free $\beta$; $W\beta\leq0$; maximize $-\mathbf1^TW\beta$ (`:131–153`). | Status 0 (optimal) → `FALSE`; status 3 (unbounded) → `TRUE`; all others → `NA`. No package `tolerance` check. |
| primal / find | Same $W\beta\leq0$, $\beta$ bounded in `[-1,1]`; maximize $-\mathbf1^TW\beta$ (`:155–178`). | A nonzero status first sets `NA`, but the subsequent coefficient check assigns `TRUE`/`FALSE`, replacing it (`:166–176`). This branch is not fail-closed on nonzero status. `tolerance` is applied to `abs(beta)`. |
| dual / test | $\lambda\geq0$; solve $W^T\lambda=-W^T\mathbf1$ with zero objective (`:179–202`). Equivalently, test for $w=\lambda+\mathbf1>0$ with $W^Tw=0$. | Status 0 (feasible optimal) → `FALSE` (no separation); status 2 (infeasible) → `TRUE`; all others → `NA`. No package `tolerance` check. |
| dual / find | $\lambda,a,c\geq0$; solve $W^T\lambda-a+c=-W^T\mathbf1$, minimize $\mathbf1^T(a+c)$ (`:203–235`). The dual variables of the $p$ equality rows are returned as $\beta$, the bounded separation direction. | `tolerance` is applied to the absolute returned dual coefficients. The code does not branch on the solver status after `solve` before reading/classifying the dual solution. |

The dual/find LP is dual to maximizing $-\mathbf1^TW\beta$ subject to $W\beta\leq0$ and $-1\leq\beta\leq1$; its dual row solution is the returned $\beta$. Solver status is not checked in this branch. All four `lpSolveAPI` branches call `lp.control` with `pivoting="firstindex"`, `simplextype=c("primal","primal")`, and the branch's max/min sense (`linear_programs.R:140–142, 164–167, 188–190, 221–227`). They do not pass package `tolerance` as an lpSolve control; other lpSolveAPI controls retain their defaults. The ROI route does not read `linear_program` or `purpose`; it always solves its bounded objective LP. Also, `separation_type_ROI()` is invoked by the wrapper even when `implementation="lpSolveAPI"`; it uses ROI and `ROI_solve`, so `separation_type=TRUE` is not a pure lpSolveAPI execution.

The A1 execution path was `implementation="ROI"`, `solver="lpsolve"`, `solver_control=list()`, `separation_type=TRUE`. The `lpSolveAPI` alternatives above are not the A1 primary path. The exact ROI.plugin.lpsolve 1.0-2 source and version-matched lpSolveAPI manual establish the control path and published solver defaults. No single `epsb` value should be conflated with `detectseparation`'s package threshold or described as the sole primal-feasibility setting.

## A1 terminology correction (historical evidence remains unchanged)

The A1 protocol calls `1e-4` and `1e-8` “primary sensitivity values” and explicitly says they are experimental settings, not production tolerances (`CP-STAT-02-A1-PROTOCOL-v1.md:49–53`). The generated qualification record labels them `feasibility_tolerances` (`qualification.R:881`). The latter field name is inaccurate for `detectseparation` v0.4: the two values are package decision-threshold settings, not the LP solver's primal feasibility tolerance. The A1 report and its machine-readable evidence remain immutable; this is a terminology clarification only and does not alter any recorded value or classification.

## Fixture 31 and 33: mechanisms, not fixture conclusions

| Potential mechanism | Source assessment | Fixture-specific conclusion |
|---|---|---|
| Fixture 31: the primary separation result is `TRUE` for both observed labels; the second LP's `minimum_margin > tolerance` test separates quasi at `1e-4` from complete at `1e-8`. | `SOURCE_SUPPORTED_MECHANISM` | The exact margin, status, and residuals are still required to confirm a clean threshold crossing rather than differing solver results. |
| Fixture 33: the result changes from overlap (`FALSE`) at `1e-4` to separation (`TRUE`) at `1e-8`; the primary ROI `any(abs(beta)>tolerance)` branch is the candidate decision point. The second LP then returns quasi at `1e-8`. | `SOURCE_SUPPORTED_MECHANISM` | Archived returned coefficients, status, margin, and residuals are required to confirm why the primary decision changed. |
| `tolerance` changes the solver's primal feasibility settings. | `SOURCE_REFUTED_MECHANISM` | v0.4 source passes `solver_control` separately and does not pass `tolerance` to ROI as a solver control. Implicit plugin defaults can still affect numerical outcomes. |
| Column scaling changes coefficient/margin magnitudes under the fixed coordinate bounds and can move values across the package thresholds. | `SOURCE_SUPPORTED_MECHANISM` | `REQUIRES_FIXTURE_NUMERICAL_EVIDENCE`; source alone cannot assign cause to either observed fixture. |
| QR rank/alias handling, ROI solver status, or solver-default tolerances affect the call's result. | `REQUIRES_FIXTURE_NUMERICAL_EVIDENCE` | Requires the immutable matrices, raw solutions/statuses, and plugin defaults. |
| CSV/JSON serialization creates the classification changes. | Not tested here. | `REQUIRES_FIXTURE_NUMERICAL_EVIDENCE`; no archived A1 records were altered or reconstructed in A2-01. |

The frozen A1 observations remain exactly: fixture 31, expected complete, package result quasi at `1e-4` and complete at `1e-8`; fixture 33, expected overlap/finite MLE, package result overlap at `1e-4` and quasi at `1e-8`. Source inspection does not adjudicate those expected classes or prove why either changed.

## Issue #5 disposition and handoff boundaries

Completed: verified exact v0.4 tag target; retrieved and hash-verified all three requested primary files and `R/auxiliary.R`; matched their Git blob identities; verified the exact A1 ROI and ROI.plugin.lpsolve source archive hashes; traced the helper and LP branches; established the effective $t$ bound; distinguished package and solver tolerances; documented source-supported candidate mechanisms; and preserved A1 classifications.

Explicit limitations: `R/zzz_conventions.R` bytes were not downloaded, so its SHA-256 is not claimed; its exact tag-tree blob identity is recorded. The archived fixture matrices and raw fixture-specific LP outputs were not reconstructed; no numerical root cause is assigned to fixture 31 or 33. No CI was run.

Issue #6 should use only the verified A1 archive to reconstruct the exact fixture 31 and 33 model matrices, treatment vectors, row IDs, hashes, witness/anchor identities, raw LP values, statuses and residuals, without regeneration. Issue #7 should conduct the separately authorized independent-solver assessment under preregistered solver/version/normalization settings; it must not tune a threshold to these outcomes and must distinguish numerical agreement from mathematical proof. These are handoff scopes inferred from the A2-F1 decomposition, not statements about uninspected GitHub issue bodies.

**Issue #4:** the source-access and tolerance-terminology blocker is resolved by this exact-source audit. Issue #4 can proceed to its separately authorized fixture-specific numerical evidence stage after independent Red Team review; this report does not establish either fixture's mathematical root cause.

See [`SOURCE_AUDIT_DECISION.md`](./SOURCE_AUDIT_DECISION.md) for the final bounded disposition.
