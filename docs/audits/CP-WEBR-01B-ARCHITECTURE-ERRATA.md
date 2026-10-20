# CP-WEBR-01B Architecture Errata & Pre-Implementation Technical Ledger

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Phase:** `CP-WEBR-01B — Executable Security, Privacy, Object Binding & Evidence Qualification`
**Baseline SHA:** `771219c9c60271b1e4984605b4e7751812930133`
**Document Status:** Normative Architecture Errata & Technical Correction Ledger
**Authority:** Independent Red Team (ChatGPT) Mandate

---

## 1. Executive Summary

During the preregistration phase of `CP-WEBR-01B`, four demonstrable technical discrepancies were identified in the prior `CP-WEBR-01` architecture contracts. This document provides source-backed corrections, empirical reconciliations, and normative specifications before executing the security and binding qualification suites.

---

## 2. Errata Items & Resolutions

### Errata A: Dependency Size Accounting Discrepancy

| Attribute | Value |
| :--- | :--- |
| **Defect** | `dependency-lock.json` declared `total_download_bytes = 25,055,047`, but the 21 individual package-level `bytes` entries sum to `23,863,424`. |
| **Discrepancy Magnitude** | Exactly `+1,191,623` bytes (~1.14 MiB). |
| **Independent Verification** | Disk inspection of `experiments/cp-webr-00b/.cache/local-repo/bin/emscripten/contrib/4.6/` confirmed that all 21 `.tgz` archives match their individual `sha256` and `bytes` fields bit-for-bit, summing to **`23,863,424 bytes`**. |
| **Root Cause Analysis** | The top-level `total_download_bytes` field in `dependency-lock.json` was an un-reconciled artifact from an earlier exploratory dependency resolution step before package versions were finalized. Additional runtime assets outside the lockfile include: WebR runtime core binaries in `/assets/webr/` (`48,577,103 bytes` across 167 files, including `R.wasm` at `18,062,845 bytes`) and repository index metadata files (`PACKAGES` = 1,061 bytes, `PACKAGES.gz` = 668 bytes). |
| **Corrective Action** | In accordance with hard boundaries, historical lockfile hashes and amounts are **not** altered. The authoritative package download byte count is documented as **`23,863,424 bytes`**, the repo metadata as **`1,729 bytes`**, and the WebR runtime core as **`48,577,103 bytes`**, totaling **`72,442,256 bytes`** (~69.09 MiB) for the complete static distribution tree. |

---

### Errata B: Canonical Result Non-Self-Referential Hashing

| Attribute | Value |
| :--- | :--- |
| **Defect** | The canonical result schema previously included `inputFingerprint.canonicalResultSha256` inside `CanonicalPsmResult`. |
| **Paradox Identified** | Including the cryptographic digest inside the object being hashed creates a self-referential preimage paradox: the hash cannot be computed because the object contains the hash. |
| **Normative Resolution** | The hash is explicitly excluded from the hashed preimage. `CanonicalPsmResult` contains solely substantive statistical and provenance fields. The hash is encapsulated within an outer versioned envelope: |

```typescript
// Normative Versioned Envelope Pattern
export interface VersionedCanonicalEnvelope {
  schemaVersion: "1.1.0";
  fingerprint: {
    datasetSha256: string;
    canonicalResultSha256: string; // SHA-256 over normalized canonicalResult JSON
  };
  result: CanonicalPsmResult; // Hashing Preimage: does NOT contain canonicalResultSha256
}
```

#### Deterministic Canonical Serialization Specification
To guarantee reproducible hashing across platforms and engines:
1. **Key Sorting:** Object keys are sorted lexicographically (`Array.prototype.sort()`) recursively at every level of the object hierarchy.
2. **Explicit Nulls:** Null fields are preserved as explicit `"key": null`, never omitted or undefined.
3. **Numeric Serialization:** Numbers follow standard ECMAScript JSON serialization (IEEE 754 64-bit float format). Non-finite values (`NaN`, `Infinity`, `-Infinity`) are serialized as `null`.
4. **Encoding:** Canonical JSON strings are encoded strictly as UTF-8 with Unicode NFC normalization.
5. **No Superfluous Whitespace:** Serialized without indentation or space padding between tokens (`JSON.stringify(..., null, 0)`).
6. **Integrity Disclaimer:** A SHA-256 digest guarantees mathematical content consistency and tamper detection; it does **not** constitute an asymmetric digital signature or proof of author authenticity.

---

### Errata C: Identifier-Policy Alias Regex & Collision Inconsistency

| Attribute | Value |
| :--- | :--- |
| **Defect** | The accepted internal R identifier regex was `^[a-z]+_[0-9]{2,4}$`, but the proposed collision handling suffix `cov_01a` violates this regex. |
| **Resolution** | Standardized on a strictly numeric sequential alias generator: `^[a-z]+_[0-9]{2,6}$`. |

#### Invariant Rules:
1. **Sequential Indexing:** Ingestion assigns aliases monotonically by variable role:
   - Covariates: `cov_01`, `cov_02`, ..., `cov_999999`
   - Treatment: `trt_01`
   Because aliases are assigned from a global monotonic counter, name collisions are architecturally impossible.
2. **Grammar Compliance:** Every alias strictly satisfies `^[a-z]+_[0-9]{2,6}$`, ensuring compatibility with R formula parsing without backtick escaping.
3. **Lossless Unicode Preservation:** Original clinical headers (including spaces, units, Turkish/Unicode characters, comparators) are preserved byte-for-byte in `factorConfiguration[alias].originalHeader` and `factorConfiguration[alias].displayName`.
4. **Duplicate Rejection:** Uniqueness is evaluated case-sensitively on NFC-normalized strings. Duplicate headers are rejected at ingestion with a clear error.

---

### Errata D: WebR Runtime Lifecycle & Disposal Semantics

| Attribute | Value |
| :--- | :--- |
| **Defect** | Architecture contracts referenced `webR.destroy()` as an engine shutdown method. |
| **Source Verification** | Inspection of official WebR v0.6.0 TypeScript definitions (`webr-main.d.ts`) reveals: |

- **`webR.destroy(rObject: RObject): Promise<void>`:** Destroys an individual RObject proxy on the Emscripten WebAssembly heap.
- **`webR.close(): void`:** Closes communication channels and terminates the internal WebR runtime.
- **`worker.terminate(): void`:** W3C standard Web Worker termination method called on the host thread handle.

#### Normative Lifecycle Protocol:
1. **During Analysis:** Temporary intermediate R objects (large data frames or vectors) can be individually deallocated using `await webR.destroy(robj)` to prevent heap bloat.
2. **Analysis Completion / Reset:** The worker invokes `webR.close()`, and the UI thread calls `worker.terminate()`.
3. **Memory Disclosure:** Calling `worker.terminate()` immediately terminates the background OS thread and releases V8 JavaScript isolate heap allocations. However, immediate operating system RAM reclamation is subject to the browser engine's memory manager and OS paging; no software may claim instantaneous cryptographic RAM wiping.

---

---

### Errata E: Emscripten Compiler Toolchain Provenance Reconciliation (RT-07)

| Attribute | Value |
| :--- | :--- |
| **Defect** | `CP-WEBR-01B-EXPERIMENT-CONTRACT.md` previously cited `Emscripten 3.1.73` as the R 4.6.0 WebAssembly compiler toolchain. |
| **Source Verification** | Examination of primary upstream WebR v0.6.0 repository commits and PRs reveals: |

- **GitHub PR #603 & Commit `7e1e376f9f0bf29f4992b809f459932af3a36a7a`:** Explicitly titled `"Updates for R 4.6.0 and Emscripten 5.0.7"`.
- **Posit Build Manifests & Dockerfiles:** Pinned to Emscripten 5.0.7 container environment.
- **Upstream Release Notes Discrepancy:** The `NEWS.md` entry in WebR 0.6.0 claiming `Emscripten 4.0.8` is an upstream documentation copy-paste erratum by the maintainer.
- **Contract Correction:** Reconciled R Engine toolchain row to `4.6.0 (Emscripten 5.0.7)` with upstream documentation erratum explicitly recorded.

---

### Errata F: Clinical Header Length Limit and Structural Policy Enforcement (RT-08)

| Attribute | Value |
| :--- | :--- |
| **Defect** | Ingestion previously marked arbitrary header lengths (>2,000 chars) as PASS under injection safety without enforcing the architectural 256 code point policy. |
| **Resolution** | Decoupled injection defense from structural validation. Enforced maximum length of **256 Unicode code points** on original clinical headers. |

#### Invariant Ingestion Rules:
1. **Length Validation:** Headers exceeding 256 Unicode code points (`[...header].length > 256`) or empty strings are rejected structurally with `HEADER_LENGTH_EXCEEDED` / `HEADER_EMPTY`.
2. **Clinical Terminology Preservation:** Valid headers within limits (1–256 code points) preserve arbitrary punctuation, Unicode, Greek symbols (`Δ`), brackets (`[mg/dL]`), spaces, and hyphens without truncation.
3. **Internal Alias Mapping:** All R formula interactions strictly utilize generated `^[a-z]+_[0-9]{2,6}$` aliases; user headers are never interpolated into executable R expressions.

---

### Errata G: Numerical Parity Target Restoration & Matching-Pair Identity (RT-06)

| Attribute | Value |
| :--- | :--- |
| **Defect** | `harness/test_webr_binding.mjs` temporarily loosened tolerance to `tol = 1e-3` contrary to the preregistered `eps <= 1e-4` contract, and checked only matched sample sizes. |
| **Resolution** | Restored preregistered `eps <= 1e-4` target. Implemented exact matched pair (119/119) and weight (300/300) bit-for-bit comparisons against native R reference. |

#### Evidence Ledger:
- **Observed Max GLM Coefficient Difference:** `2.764e-5` (on `bmi`), fully compliant with `eps <= 1e-4`.
- **Matched Pair ID Identity:** 119/119 treated units matched to identical control unit IDs with 0 mismatches.
- **Matching Weights Identity:** 300/300 observations assigned identical weights with 0 mismatches.
- **Numerical Exception Disclosure:** `fix_16_complete_separation` remains a documented numerical limitation under standard GLM without Firth fallback; publication output is strictly restricted.

---

### Errata H: Git Commit SHA Reporting Discrepancy

| Attribute | Value |
| :--- | :--- |
| **Defect** | Previous agent reported non-existent SHA `e56739d391036894c25f448c5e63080c550ea6f3`. |
| **Actual Git SHA** | Remote and local `origin/development` HEAD was verified directly from git as **`e56739d4a0671dc075075ccc74f451257b78706b`**. |
| **Root Cause Analysis** | Prior agent generated an uncommitted intermediate amend hash during local staging that was included in report text prior to final commit creation and push. |
| **Resolution** | Documented discrepancy in errata ledger; all subsequent hashes and references are queried directly via `git rev-parse HEAD`. |

---

### Errata I: Native Reference 4-Decimal Truncation Root Cause & Versioned Replacement Oracle

| Attribute | Value |
| :--- | :--- |
| **Defect** | Historical reference file `experiments/cp-webr-00b/native-reference/native_results.json` truncated coefficients to 4 decimal places (e.g. `0.9878`, `0.0001`, `-0.0018`, `-0.0105`). |
| **Root Cause Analysis** | `experiments/cp-webr-00b/native-reference/run_native.R` invoked `jsonlite::write_json()` without an explicit `digits` argument. In `jsonlite`, the default formatting precision is `digits = 4`. This introduced an artificial floating-point rounding delta of ~`2.76e-5` when compared against IEEE-754 double precision calculations. |
| **Resolution** | Historical reference is preserved unchanged. Added clearly versioned full-precision replacement oracle at `experiments/cp-webr-01b/fixtures/fix_01_oracle_full_precision.json` capturing 64-bit double precision directly from R 4.6.0 + MatchIt 4.8.1 + cobalt 5.0.0. Exact pair sets (119/119) and weights (300/300) match with 0 mismatches and coefficient differences are within strict `eps <= 1e-4`. Native host R 4.6.0 binary provisioning is reported as `NATIVE_R_ORACLE_BLOCKED` on host runners where R 4.6.0 is not provisionable. |

---

### Errata J: Algorithmic Convergence vs Complete Separation Distinction

| Attribute | Value |
| :--- | :--- |
| **Defect** | Statements colloquially claimed that complete separation in `fix_16` caused `glm$converged == FALSE`. |
| **Empirical Reality** | In `fix_16_complete_separation`, standard R `glm()` reports `matching$converged == TRUE` because consecutive deviance steps drop below epsilon (< 1e-8) as parameter estimates diverge. |
| **Normative Distinction** | ClinicalPSM explicitly distinguishes: (1) **Algorithmic convergence** (deviance step termination), (2) **Complete / quasi-complete separation** (non-identifiable parameters, divergence of log-odds), (3) **Parameter instability** (astronomical SE > 39,000, boundary PS), (4) **Publication-output restrictions** (`REJECT_FOR_PUBLICATION`), and (5) **Automated runtime diagnosis** (unimplemented in production; `AUTOMATED_SEPARATION_SAFETY` remains `BLOCKED`). |

---

## 3. Contract Consistency Audit Summary

| Dimension | Previous State | Corrected State | Verification Target |
| :--- | :--- | :--- | :--- |
| **Lockfile Bytes Sum** | Unreconciled 25,055,047 | 23,863,424 (packages) + 48,577,103 (runtime) | `ARTIFACT-MANIFEST.json` |
| **Canonical Hash Preimage** | Self-referential inside result | Non-self-referential via Versioned Envelope | `ALIAS-AND-SERIALIZATION-TESTS.json` |
| **Alias Regex** | `^[a-z]+_[0-9]{2,4}$` vs `cov_01a` | Strictly numeric `^[a-z]+_[0-9]{2,6}$` | `ALIAS-AND-SERIALIZATION-TESTS.json` |
| **Disposal API** | `webR.destroy()` (wrong signature) | `webR.close()` + `webR.destroy(obj)` + `worker.terminate()` | `INDEXEDDB-LIFECYCLE-AUDIT.json` |
| **Emscripten Provenance** | Erroneous 3.1.73 draft citation | Emscripten 5.0.7 (PR #603 / commit 7e1e376) | `CP-WEBR-01B-EXPERIMENT-CONTRACT.md` |
| **Header Length Limit** | >2000 chars accepted | Max 256 code points structural rejection | `ALIAS-AND-SERIALIZATION-TESTS.json` |
| **Parity Tolerance & Pairs** | 1e-3 tolerance, counts only | Strict 1e-4 target, 119/119 exact pairs verified | `WEBR-BINDING-QUALIFICATION.json` |
| **Git SHA Provenance** | Erroneous local amend hash | Direct git rev-parse: `e56739d4a0671dc075075ccc74f451257b78706b` | `BROWSER-CI-QUALIFICATION-REPORT.json` |
| **Native Precision** | 4-decimal rounded reference | Full IEEE-754 double precision replacement oracle | `fix_01_oracle_full_precision.json` |
| **Separation Interpretation** | Falsely claimed converged == FALSE | Clarified algorithmic convergence vs mathematical separation | `WEBR-BINDING-QUALIFICATION.json` |
| **IndexedDB Privacy Gate** | Silent fail-open on DB errors | Fail-closed explicit states with 5-fault injection | `INDEXEDDB-LIFECYCLE-AUDIT.json` |
| **Worker CSP Qualification** | Theoretical note on eval | Executable A/B matrix (strict vs permissive) | `CSP-QUALIFICATION.json` |
