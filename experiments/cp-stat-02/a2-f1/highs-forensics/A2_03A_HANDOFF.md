# A2-03A Preregistration Handoff

**Status:** `A2_03A_PREREGISTRATION_READY_FOR_RED_TEAM` pending independent review.
**Type:** preparation only; no solver result or new scientific conclusion.
**Required starting SHA:** `bc2cceec8cd3308fb60842e0d7b33e89fc976d6d`.

## Verified project state

- Live `development` at task start was exactly `bc2cceec8cd3308fb60842e0d7b33e89fc976d6d`. Local history was one documentation-only commit behind at `0f27cf3c5a5c0428fdcb3495caebdcaddcae79dd`; the only added commit was the A2 project-memory pilot. It was fast-forwarded without resetting or overwriting any work.
- Live `main` remains `53fb05e7c8d9b77b46c4a5d8b7c9cc041345f6a6`.
- GitHub issue states checked live on 2026-10-24: #3 open; #4 open; #5 closed; #6 closed; #7 open; #8 open; #9 open; #14 open.
- All five required project-memory files were read from the verified baseline. They reaffirm CP-WEBR-02 closure under its narrow ratified amendment, CP-STAT-02 OPEN, A1 48/50 PASS with two scientific FAILs, and detector `NOT_QUALIFIED`.
- The local, untracked A1 ZIP was preserved unchanged. Its SHA-256 is `ebf2d899a4d1bb8404415183dd35d4d7eb221b5a33b0eec1f8d7e9eb4e5c5c6a`; the embedded tar.gz SHA-256 independently reads `326b94c50d9cbbdf72967c0df0d495761e7b736afb30906e60030c3d1d8ae554`.
- The full-precision matrix member hashes match the accepted #6 manifest: fixture 31 `ea55df16749f235ee69b4634ec37408a2bb6361a9fb26b820170cbaf0373370e`; fixture 33 `be5efb7a008f0ca285691c32faff08b48df19054bd1f09bc25e0e1c10609add1`.

## Created files

1. `HIGHS_PREREGISTRATION-v1.md` — fixed scientific scope, source evidence, run matrix, and no-adaptation boundary.
2. `LP_MATHEMATICAL_CONTRACT.md` — signed design, complete/weak LPs, normalization proof, classification and numeric limitations.
3. `NUMERICAL_ACCEPTANCE_CONTRACT.json` — machine-readable environment, options, repeatability, residual thresholds, and fail-closed outcomes.
4. `SOLVER_ENVIRONMENT_LOCK.md` — Python/SciPy/embedded HiGHS pins, wheel hashes, runner, and action commits.
5. `FALSIFICATION_PLAN.md` — identity, proof, status, residual, boundary and repeatability controls.
6. `A2_03A_HANDOFF.md` — this handoff and proposed memory follow-up.

Only these bounded preparation files are in scope. No source audit, exact-proof evidence, A1 artifact, fixture, manifest, production dependency or scientific value is changed.

## Scientific facts preserved

The A1 result is unchanged: 50 evaluated, 48 PASS, 2 FAIL, 0 unmeasured, general detector `NOT_QUALIFIED`. Fixture 31 is mathematically completely separated under the accepted #6 exact-rational witness. Fixture 33 has no nonzero weak separator and has a finite unique logistic MLE for the archived full-rank model matrix under the accepted #6 anchor/rank proof. Their historical A1 detector classifications remain exactly as before. The numeric root causes remain unresolved.

The solver plan runs only the two immutable full-precision model-matrix CSVs. It does not use the rounded fixture CSVs or regenerate data. SciPy's bundled HiGHS source is pinned to v1.12.0 through SciPy 1.18.1's exact `subprojects/highs` commit. The configured solver tolerances are not `detectseparation`'s package-level classification threshold. A zero objective or `success=true` is not considered proof of no separation.

## Issue #7 readiness assessment

The preregistration answers the issue's pre-execution requirements for exact packages, package artifact hashes, embedded HiGHS source identity, runner label, methods, solver options, formulation, scaling, bounded repeats, required output fields, numeric interpretation, and falsification controls. No solver run, A1 suite run, or experimental CI workflow was performed as part of A2-03A.

Issue #7 remains open pending independent acceptance. A2-03B must not start until that acceptance and its separate execution authorization are recorded. That execution may use only the 32 fixed calls listed here, only fixture 31 and fixture 33, and no adaptive retry.

## Proposed project-memory updates after independent acceptance

Do not apply these updates before the Red Team accepts the preregistration. Once accepted, append a dated `DECISION_LEDGER.md` entry stating that only the numerical protocol is preregistered and **no HiGHS result exists**; add hashes and this exact commit to `EVIDENCE_INDEX.md`; update `CURRENT_STATE.md` to leave A1 at 48/50 with two FAILs and the general detector NOT_QUALIFIED; and update `HANDOFF.md` so the next task is the separately authorized A2-03B execution. Do not mark #7 closed based solely on A2-03A.

## Explicit non-results and blockers

- No SciPy, HiGHS, ROI or lpSolve call was made.
- No A1 fixture was regenerated or modified.
- No numerical cause was inferred from source semantics or expected classes.
- SciPy's pinned wheel embeds HiGHS v1.12.0; this is not an independent standalone HiGHS executable or engine.
- GitHub-hosted `ubuntu-24.04` image revisions move. The later run must record its exact image revision and the actual Python runtime artifact provenance before solving; if that cannot be verified, it must stop before the first LP.
- The scientific result may remain inconclusive. This is an acceptable outcome and does not change A1's `NOT_QUALIFIED` status.
