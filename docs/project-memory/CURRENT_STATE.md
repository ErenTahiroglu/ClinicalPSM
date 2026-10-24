# CP-STAT-02-A2 — Last independently reviewed status

**Snapshot date:** 2026-10-24. **Snapshot scientific evidence commit:** [`0f27cf3c5a5c0428fdcb3495caebdcaddcae79dd`](https://github.com/ErenTahiroglu/ClinicalPSM/commit/0f27cf3c5a5c0428fdcb3495caebdcaddcae79dd). **Accepted A2-03A preregistration evidence:** [`44b4faaa4b3ed9054a3b05be2741fb1c0d326cbe`](https://github.com/ErenTahiroglu/ClinicalPSM/commit/44b4faaa4b3ed9054a3b05be2741fb1c0d326cbe). **A2-03B attempted-execution commit:** [`cc607737e8725e2d774d8bf34686e9055572301e`](https://github.com/ErenTahiroglu/ClinicalPSM/commit/cc607737e8725e2d774d8bf34686e9055572301e), **CI FAILED before preflight, ZERO solver calls**. These are scientific/provenance SHAs, not an assertion of live HEAD; re-check GitHub. `main` was `53fb05e7c8d9b77b46c4a5d8b7c9cc041345f6a6` at review.

## Scientific gates

| Gate | Evidence-backed state |
| --- | --- |
| CP-WEBR-02 | CLOSED under narrowly ratified scientific-equivalence amendment v1, not original 25/25 numeric parity |
| CP-STAT-02 | OPEN; separate 50+ fixture and 100% semantic/numeric tolerance requirements remain |
| A1 experimental separation diagnostic | 50 evaluated, 48 PASS, 2 FAIL, 0 unmeasured; `NOT_QUALIFIED` |
| A2-01 source semantics | #5 CLOSED, reviewer accepted `4ab9509f550f15af52bad8c2199c8102f10e61b7` |
| A2-02 archived exact ground truth | #6 CLOSED, reviewer accepted `0f27cf3c5a5c0428fdcb3495caebdcaddcae79dd` |
| A2-03A independent HiGHS preregistration | **ACCEPTED as PLAN ONLY**, #7 OPEN; 32 fixed calls, source/wheel provenance pins, prespecified reviewer clarification in [#7 Red Team comment](https://github.com/ErenTahiroglu/ClinicalPSM/issues/7#issuecomment-6387366807); no solver outcomes |
| A2-03B first numerical attempt | **BLOCKED** infrastructure at `pip --report` after checkout deleted staging directory; [run 40121998475](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40121998475), **0/32 LP**, **0/15 locked-CI falsification checks**, no numerical outcome; #7 OPEN, recovery #15 OPEN |
| F1 numerical root-cause investigation | #4 OPEN/INCOMPLETE; mathematical ground truth established, fixture-specific numerical mechanism UNRESOLVED |
| Production general-purpose separation detector | BLOCKED/NOT_QUALIFIED |
| Real clinical data, publication/release and main merge | NOT AUTHORIZED by these scientific experiments |

## Current A2 issue dependency order

[A2 parent #3](https://github.com/ErenTahiroglu/ClinicalPSM/issues/3) — OPEN.

- **Completed:** [#5 source audit](https://github.com/ErenTahiroglu/ClinicalPSM/issues/5), [#6 exact archived proof](https://github.com/ErenTahiroglu/ClinicalPSM/issues/6).
- **Next:** [#15 A2-03B-R1 infrastructure recovery authorization gate](https://github.com/ErenTahiroglu/ClinicalPSM/issues/15) — **review offline minimal checkout/staging and shell-summary fix without re-running CI**. Accepted A2-03A v1 and additive A2-03B v1.1 annex remain frozen. Original 03B one-run budget consumed. Only a **separately approved** future limited run may supply numerical observations to [#7](https://github.com/ErenTahiroglu/ClinicalPSM/issues/7).
- **Parallel after explicit scope authorization:** [#8 negative-control precondition analysis](https://github.com/ErenTahiroglu/ClinicalPSM/issues/8).
- **Then:** [#9 independent F1 synthesis and #4 coordinator disposition](https://github.com/ErenTahiroglu/ClinicalPSM/issues/9).
- **Conditional downstream:** [#10 F2 design decision](https://github.com/ErenTahiroglu/ClinicalPSM/issues/10), [#11 F3 holdout validation](https://github.com/ErenTahiroglu/ClinicalPSM/issues/11), [#12 F4 Wasm/licensing screening](https://github.com/ErenTahiroglu/ClinicalPSM/issues/12), [#13 F5 final A2 review](https://github.com/ErenTahiroglu/ClinicalPSM/issues/13).
- **Governance pilot:** [#14 GitHub project memory](https://github.com/ErenTahiroglu/ClinicalPSM/issues/14) **CLOSED completed**. Original docs-SHA Security CI was CANCELLED (not PASS); descendant 03A exact-SHA Security and Cumulative were SUCCESS; see #14 closure. Memory is manually event-updated, not an active background monitor.

## Frozen mathematical facts; unresolved numerical behavior

Fixture `cpstat02a1_31_small_scale_complete`: on archived high-precision model matrix 80/80 signed margins are strictly positive for `β=(0,1,0)`, minimum exactly `5025148998247459/5000000000000000000000`. **Complete separation mathematically confirmed**; A1 candidate: quasi at `1e-4`, complete at `1e-8` — still an experimental FAIL.

Fixture `cpstat02a1_33_heterogeneous_scale_overlap`: three exact opposite-response anchor pairs `sub_0001/0002`, `sub_0003/0004`, `sub_0005/0006`; full rank `rank(A)=rank(X)=3`; no nonzero weak separator, finite unique logistic MLE for this design **confirmed**. A1 candidate: overlap at `1e-4`, false-positive quasi at `1e-8` — still an experimental FAIL.

**Source semantics:** `detectseparation v0.4` `control$tolerance` is a *package classification threshold* applied to LP coefficients / minimum margin, **not** the solver's primal feasibility tolerance. `solver_control` is separate. Root-cause attribution needs #7 execution (A2-03B); preregistration alone adds no numerical evidence.

**Important data nuance:** A1 input fixture CSV predictor decimal strings are rounded relative to the separate, hash-pinned full-precision model-matrix CSV. #7 must specify which bytes/matrix enter each solver.

**Known documentation erratum:** the #6 report calls outer A1 artifact ZIP 862,966 bytes; GitHub and independent byte count show **842,695**. The inner `.tar.gz` is **862,827**. Digests and mathematical proofs agree. Do not silently overwrite the archived report.

## Work boundaries

No rerun of the 50 A1 scenarios, no changing expected class/tolerance to obtain 50 PASS, no automatic CI retry loop, no patient data, no production statistical/Worker modification, no release/deployment. Full repository issue/doc overhaul waits until A2 independent closure.

## 2026-10-24 A2-03B CI blocker (independently verified)

Exact A2-03B experimental commit `cc607737e8725e2d774d8bf34686e9055572301e`; CI `40121998475` FAIL **before preflight**. The workflow creates `.a2-03b` before `actions/checkout`; checkout `clean:true` discards it; pinned pip's `--report .a2-03b/pip-install-report.json` errors because directory is missing. Downloading wheels **does not** constitute an installed and verified locked environment. The summary shell also evaluates unescaped Markdown backticks as commands. Evidence artifact `12571224297`, outer SHA-256 `2fcc8b064b23a0f50ca4fe874606a4a1ea861b87913b321fc1d4155a1696273b`, 1,497 bytes, 3/3 listed payload hashes PASS, records `linprog_invocation_attempts=0`, `completed_manifest_cells=0`, and 0/15 CI falsification tests. Reported 15/15 local preflight unit controls are **not** CI-qualified. Original A1 48/2 FAIL and package NOT_QUALIFIED stay unchanged.

At this snapshot [Security run 40121998493](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40121998493) SUCCESS; [Cumulative run 40121998513](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40121998513) last inspected IN_PROGRESS, not a claimed PASS. #15 governs any future exception to the one-run policy; do not rerun the original job.


## 2026-10-24 A2-03B-R1 independent STATIC PATCH acceptance and new-run gate

Issue #15 [independent acceptance](https://github.com/ErenTahiroglu/ClinicalPSM/issues/15#issuecomment-6389415130) **ACCEPTED** the *proposed local, uncommitted, unpushed* minimal workflow repair. The reviewed exact patch is SHA-256 `d776141d836f5065bdd7b14d4e0cd750018d1a7cdd09abd900f6f5071fce15c9` and Git blob `dd8117178546e8d4dbe33e14e042c2a057470ecf`, independently reconstructed from the existing workflow. It moves staging after checkout and shell-quotes summary safely; frozen scientific code and configurations unchanged. Delegate-reported STATIC-01 through STATIC-08 PASS, with additional independent synthetic YAML/Bash/summary checks. **These are not scientific solver measurements.**

Issue #7 [separate one-shot Red Team authorization](https://github.com/ErenTahiroglu/ClinicalPSM/issues/7#issuecomment-6389418515) permits a single new `development` workflow-only commit/push **after final exact-SHA gate**. This project-memory documentation update is additive and will advance `development` without altering the science workflow; resolve the live base SHA against this document commit and any subsequent amended authorization before proceeding. No push of the proposed workflow has occurred at this memory update. Original run 40121998475 FAIL; **0/32 HiGHS**, **0/15 locked-CI controls**, A1 48 PASS/2 FAIL, detector `NOT_QUALIFIED`, fixture-specific numerical causes `UNRESOLVED`. #15, #7, #4 and #3 OPEN.

The historical experimental SHA `cc607737...` has Security 40121998493 and Cumulative 40121998513 **SUCCESS**; the preceding docs-only SHA `929898525...` has Security 40122874426 and Cumulative 40122874424 **SUCCESS**. Ordinary CI green does not replace blocked A2-03B evidence.


## 2026-10-25 — A2-03B-R1 one-shot replacement run BLOCKED; next gate #16 (NO new run)

Independent GitHub and downloaded artifact review: `development` reached [workflow-repair-only commit `57050e346d3e6cc6d593a0998a0f73ecd44aa627`](https://github.com/ErenTahiroglu/ClinicalPSM/commit/57050e346d3e6cc6d593a0998a0f73ecd44aa627), matching the previously approved workflow blob `dd8117178546e8d4dbe33e14e042c2a057470ecf` and SHA-256 `d776141d836f5065bdd7b14d4e0cd750018d1a7cdd09abd900f6f5071fce15c9`; `main` unchanged `53fb05e7c8d9b77b46c4a5d8b7c9cc041345f6a6`. Ordinary [Security 40132953061](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40132953061) and [Cumulative 40132952954](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40132952954) SUCCESS.

The authorized **one** new [A2-03B run 40132953044](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40132953044) FAILED during `verify_frozen_files()` after checkout, staging, setup-python and pip hash-locked install succeeded. [Artifact 12575273758](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40132953044/artifacts/12575273758): **1,738 bytes**; independently downloaded outer SHA-256 `8e6bf64be2880079e51f1e23c05a246bc3d1e1b3cad68a40d2b98dad7c764b57`, **3/3 internal payload checksum PASS**. Blocker: v1.1 frozen lock expects original workflow SHA-256 `4d533dfa44d2c423a86466cabd00143a625103199a5fbaa08959d87bc9e564b5`, but repaired workflow is `d776141d...`. Harness `FREEZE_PATH` selects `v1.1`; checker correctly stops. Old integration Red Team approval overlooked the frozen workflow hash pin. **0/32 LP calls, 0/15 locked scientific controls, zero numerical outcomes**, embedded HiGHS runtime UNMEASURED. Pip-log successful installation is narrower than independent runtime verification; pip report was not preserved in the early-blocker artifact.

**Next:** [#16 R2 versioned lock/provenance amendment](https://github.com/ErenTahiroglu/ClinicalPSM/issues/16) **STATIC-ONLY, LOCAL, UNCOMMITTED/UNPUSHED**; never silently rewrite the immutable v1.1, bypass the hash check, or push an R2 file that auto-triggers science. First prepare v1.2 with mechanical harness path selection and full frozen-manifest integrity checks; submit for independent review and obtain a **fresh separate** single-run authorization, if warranted. #15 OPEN/PARTIAL; #16 OPEN/BLOCKED; #7, #4, #3 OPEN. Original A1 48 PASS/2 FAIL, detector NOT_QUALIFIED; fixture 31 COMPLETE, fixture 33 finite-MLE OVERLAP; historic numeric discrepancy causes UNRESOLVED. Full repository issue audit still deferred.
