# A2-03B R2 Frozen-Lock Integrity Amendment v1.2

**Status:** Proposed local engineering-provenance amendment; uncommitted and unapproved.

**Scope:** Repair the frozen-file identity chain after the accepted workflow repair. This document does not revise a scientific hypothesis, LP, numerical method, tolerance, acceptance threshold, or interpretation.

## 1. Authorization and stop condition

This amendment is prepared under the local static-only authorization for issue #16. The R1 one-shot execution authorization is consumed. No commit, push, workflow run, dependency installation, or solver execution is authorized by this amendment. Independent Red Team approval of the complete v1.2 lock, harness change, and offline evidence is required before any future commit or execution authorization.

## 2. Frozen v1.1 and workflow provenance

The original v1.1 lock remains unchanged:

- Path: `A2_03B_FROZEN_INPUTS-v1.1.json`
- SHA-256: `3286eed9b144d62d7b1c8ae6fe8b33c49b1722a4499c35a609a75e8de844b611`
- Schema: `CP-STAT-02-A2-03B-FROZEN-INPUTS-v1.1`
- Its workflow entry records the original preregistered workflow bytes: SHA-256 `4d533dfa44d2c423a86466cabd00143a625103199a5fbaa08959d87bc9e564b5`, Git blob `eee4e6171fabfef0dff7c60c377fa1e3fb4ae61b`.

The accepted R1 workflow repair is a distinct, previously reviewed identity:

- SHA-256: `d776141d836f5065bdd7b14d4e0cd750018d1a7cdd09abd900f6f5071fce15c9`
- Git blob: `dd8117178546e8d4dbe33e14e042c2a057470ecf`
- It repairs staging-directory ordering and summary quoting only. It is already present in the frozen R1 execution commit; this R2 patch does not edit the workflow.

The v1.1 lock correctly rejected the repaired workflow because its pinned workflow hash names the original workflow bytes. Its fail-closed response is valid integrity evidence, not defective scientific evidence.

## 3. Blocked execution history

Both attempts stopped before numerical execution. Neither produced solver observations or completed any CI falsification control.

| Run | Commit | Exact blocker | HiGHS/`linprog` calls | CI falsification controls |
|---|---|---|---:|---:|
| `40121998475` | `cc607737e8725e2d774d8bf34686e9055572301e` | The workflow created `.a2-03b` staging before `actions/checkout`; checkout cleanup removed it. Locked pip installation then could not create `.a2-03b/pip-install-report.json` because the parent directory was absent. | 0/32 | 0/15 |
| `40132953044` | `57050e346d3e6cc6d593a0998a0f73ecd44aa627` | Staging and locked-wheel installation completed. `verify_frozen_files()` then rejected the accepted repaired workflow because v1.1 expected SHA-256 `4d533dfa44d2c423a86466cabd00143a625103199a5fbaa08959d87bc9e564b5` and found `d776141d836f5065bdd7b14d4e0cd750018d1a7cdd09abd900f6f5071fce15c9`. | 0/32 | 0/15 |

The second run's blocked artifact was `12575273758`, SHA-256 `8e6bf64be2880079e51f1e23c05a246bc3d1e1b3cad68a40d2b98dad7c764b57`; its three checksum-listed payloads were independently verified. These receipts do not establish any numerical result.

## 4. Additive v1.2 lock design

The proposed `A2_03B_FROZEN_INPUTS-v1.2.json` is mechanically derived from v1.1. Recursive comparison finds exactly these three leaf changes and no others:

| Field | v1.1 | Proposed v1.2 |
|---|---|---|
| `schema` | `CP-STAT-02-A2-03B-FROZEN-INPUTS-v1.1` | `CP-STAT-02-A2-03B-FROZEN-INPUTS-v1.2` |
| `files_sha256[".github/workflows/experiment-cp-stat-02-a2-03b.yml"]` | `4d533dfa44d2c423a86466cabd00143a625103199a5fbaa08959d87bc9e564b5` | `d776141d836f5065bdd7b14d4e0cd750018d1a7cdd09abd900f6f5071fce15c9` |
| `files_sha256["experiments/cp-stat-02/a2-f1/highs-forensics/a2_03b_harness.py"]` | `78384a3cfddbe6a1fe51851a2d090bac51fb6ed30bb3c4ab667245d838c8067d` | `18ffe93692f98522ef046287fd1b01fa0ce4b24e1653d4c5b2258aafd9f3a30b` |

All remaining fields and file entries retain their exact v1.1 values, including the source archive and matrix identities, wheel hashes, pinned runtime, immutable preregistration commit, frozen scientific contracts, falsification plan, execution manifest, interpretation annex, dependency lock, and 32-call cap. The v1.2 lock does not list its own hash. There is no lock self-hash or cyclic hash dependency.

The v1.2 lock's SHA-256 is `50bdff5679543f089372673e30e9dd22071209b578e5462f184d194d3f86447b`. Its 12 `files_sha256` entries were independently checked against the corresponding local file bytes; all 12 match.

## 5. Minimal harness selector/version correction

The proposed `a2_03b_harness.py` changes only:

1. `FREEZE_PATH` from `A2_03B_FROZEN_INPUTS-v1.1.json` to `A2_03B_FROZEN_INPUTS-v1.2.json`.
2. `verify_frozen_files()` to require schema `CP-STAT-02-A2-03B-FROZEN-INPUTS-v1.2` before accepting the lock.

The exact resulting source SHA-256 is `18ffe93692f98522ef046287fd1b01fa0ce4b24e1653d4c5b2258aafd9f3a30b` (v1.1 harness source SHA-256: `78384a3cfddbe6a1fe51851a2d090bac51fb6ed30bb3c4ab667245d838c8067d`). AST comparison finds no changed function other than `verify_frozen_files()`; after removing the added exact-schema guard, that function is AST-identical to v1.1. All other function ASTs, including manifest, LP construction checks, numerical execution, residual calculations, exact-certificate interpretation, run aggregation, and falsification-control code, are unchanged.

## 6. Scientific and runtime invariants

The following remain unchanged from the accepted v1 preregistration and v1.1 annex:

- A1 source archive identity: workflow `40097510667`, artifact `12560933385`, outer SHA-256 `ebf2d899a4d1bb8404415183dd35d4d7eb221b5a33b0eec1f8d7e9eb4e5c5c6a`, internal SHA-256 `326b94c50d9cbbdf72967c0df0d495761e7b736afb30906e60030c3d1d8ae554`.
- Frozen matrix SHA-256 values: fixture 31 `ea55df16749f235ee69b4634ec37408a2bb6361a9fb26b820170cbaf0373370e`; fixture 33 `be5efb7a008f0ca285691c32faff08b48df19054bd1f09bc25e0e1c10609add1`.
- Runtime and dependency versions and all wheel hashes, including CPython 3.13.17, NumPy 2.5.4, SciPy 1.18.1, and embedded HiGHS 1.12.0.
- The exact 32-cell order: fixtures 31 and 33; raw and column-max-normalized representations; `highs-ds` and `highs-ipm`; complete-margin A and weak-margin B; two fresh-process repeats.
- LP objectives, constraints, options, tolerances, diagnostics, the repeatability bound, classification rules, and all 15 falsification-control definitions.
- Historical A1 results: 48 PASS / 2 FAIL, general detector `NOT_QUALIFIED`; fixture 31 mathematical COMPLETE separation; fixture 33 mathematical OVERLAP. Numerical root causes remain unresolved.

Offline manifest verification returned 32 cells in the frozen order. Full lock verification checked 12/12 entries. The archive-only `verify_archive_bytes()` path was also run without GitHub metadata: it verified the outer and internal archive hashes, all 160 `SHA256SUMS` entries, the accepted proof manifest, both frozen matrix hashes, and the existing exact proof records, with zero solver calls. These are integrity/engineering checks only and are not new numerical observations or CI-qualified falsification results.

## 7. Proposed files and identities

| Proposed file | Change | SHA-256 |
|---|---|---|
| `experiments/cp-stat-02/a2-f1/highs-forensics/a2_03b_harness.py` | Minimal lock selector and exact v1.2 schema guard | `18ffe93692f98522ef046287fd1b01fa0ce4b24e1653d4c5b2258aafd9f3a30b` |
| `experiments/cp-stat-02/a2-f1/highs-forensics/A2_03B_FROZEN_INPUTS-v1.2.json` | New additive versioned integrity lock | `50bdff5679543f089372673e30e9dd22071209b578e5462f184d194d3f86447b` |
| `experiments/cp-stat-02/a2-f1/highs-forensics/A2_03B_R2_FROZEN_LOCK_AMENDMENT-v1.2.md` | This engineering-provenance amendment | Reported in the final SHA-256 ledger; not embedded in its own bytes |

The amendment itself is not a member of `files_sha256`; this avoids self-reference. The proposed lock is also not self-hashed. An independent reviewer can calculate and freeze the final amendment file hash from its bytes.

## 8. Remaining risks and stop conditions

- This is offline source/lock validation only. It does not establish the GitHub runner's pinned Python, wheel provenance, SciPy, or embedded HiGHS runtime.
- The exact-runtime `self-test --require-frozen` was not run locally: CPython 3.13.17 and NumPy 2.5.4 are unavailable, and installing or substituting a runtime is outside authorization. The original archive bytes, all internal checksums, and the existing exact proofs were verified separately without extraction or solver use.
- The local proposed harness and lock have not been committed or executed by GitHub Actions. Only their local hashes and frozen-file checks are reported.
- No HiGHS/`linprog` call, numerical cell, or CI-qualified control has been completed. No fixture discrepancy has been resolved.
- Both the v1.2 lock and this amendment match the existing `A2_03B_*` workflow path filter. Pushing either to `development` would trigger the dedicated numerical workflow. No push is authorized here.

**Required next gate:** independent Red Team review and explicit separate authorization before any commit, push, workflow execution, or numerical experiment.
