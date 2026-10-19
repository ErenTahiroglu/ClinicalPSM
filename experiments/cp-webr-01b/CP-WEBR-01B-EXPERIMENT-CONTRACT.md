# CP-WEBR-01B Experiment Preregistration Contract

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Phase:** `CP-WEBR-01B — Executable Security, Privacy, Object Binding & Evidence Qualification`
**Baseline SHA:** `771219c9c60271b1e4984605b4e7751812930133`
**Document Status:** Preregistered Experimental Protocol
**Authority:** Independent Red Team (ChatGPT) Gate Requirements

---

## 1. Experimental Scope & Objectives

This experiment establishes the bounded, executable qualification suite required prior to any production integration of WebR, MatchIt, and cobalt.

The experiment evaluates five core gates:
1. **SEC-GATE-01:** Genuine Network Egress Falsification (nominal offline execution, positive controls, and mock-sink falsification).
2. **SEC-GATE-02:** Deep IndexedDB & Browser Storage Persistence Audit across 5 checkpoints (T1 through T5).
3. **SEC-GATE-03:** Executable WebR 0.6.0 Parameter Binding via `REnvironment`, typed proxies, reversible symbol mapping, and 20 adversarial injection cases.
4. **SEC-GATE-04:** Production-approximate Content Security Policy (CSP), COOP/COEP isolation, and `'unsafe-eval'` necessity determination.
5. **STAGE 0 & DATA INTEGRITY:** Errata reconciliation, non-self-referential canonical hashing, and monotonic sequential alias assignment.

---

## 2. Runtime & Pinned Package Manifest

| Component | Pinned Version | Source / SHA-256 Archive Digest |
| :--- | :--- | :--- |
| **WebR Core** | `v0.6.0` | `dist/R.wasm` (18,062,845 bytes, `f417f7b30cf337f7fa2032479e02c5f11186714dbf77c867a1fb5f0967ae87b1`) |
| **R Engine** | `4.6.0` (Emscripten 3.1.73) | Integrated in WebR v0.6.0 |
| **MatchIt** | `4.8.1` | `MatchIt_4.8.1.tgz` (`a79a32cbebeff67f6b92f7d14d2a138db565668b813f8983944634ea81048f06`) |
| **cobalt** | `5.0.0` | `cobalt_5.0.0.tgz` (`4fceba6fa8c11f71a9f1437fd69e6b3eb72c67feea9c395bc58e1c6ae78a1bc7`) |
| **Transitive Dependencies** | 19 pinned packages | Verified in `experiments/cp-webr-00b/dependency-lock.json` |

Total verified R package download bytes: **`23,863,424 bytes`**.
Total runtime assets (including WebR binaries & metadata): **`72,442,256 bytes`**.

---

## 3. High-Entropy Synthetic Sentinels

All tests strictly utilize synthetic sentinels designed to exhibit zero false-positive collision with base runtime strings or dictionary terms.

| Sentinel ID | Target Placement | Value / Entropy Pattern |
| :--- | :--- | :--- |
| `SNTL-ID-01` | Patient Row Identifier | `SYNTH_PT_7a9f8c12_SEC_TRACE_01` |
| `SNTL-ID-02` | Patient Row Identifier | `SYNTH_PT_b3e4d567_SEC_TRACE_02` |
| `SNTL-VAL-03` | Categorical Factor Level | `FACTOR_LEVEL_ALPHA_9f8e7d6c` |
| `SNTL-VAL-04` | Categorical Factor Level | `FACTOR_LEVEL_BETA_1a2b3c4d` |
| `SNTL-HDR-05` | Input Column Display Header | `Clinical Biomarker \u0394 [mg/dL]` |
| `SNTL-FALS-06` | Egress Falsification Payload | `FALSIFICATION_SENTINEL_PAYLOAD_339a1c` |

---

## 4. Execution Contexts & Browser Boundaries

### 4.1 Supported Contexts
1. **Host Window Context (`Window`):** UI orchestration, IndexedDB recursive traversal, CSP enforcement.
2. **Dedicated Application Worker (`DedicatedWorkerGlobalScope`):** WebR lifecycle management, parameter binding, R object compilation, MatchIt/cobalt execution.
3. **WebR Internal Worker (`WorkerGlobalScope`):** WebAssembly execution thread (`webr-worker.js`), Emscripten heap (`Module.HEAPU8`).

### 4.2 Browser Scope
- **Chromium (Primary Baseline):** Chromium / Brave Chromium (`v154.0.8037.93` or bundled Playwright Chromium). Strict requirement: PASS.
- **Firefox:** Attempted if Gecko runtime is present; otherwise marked `UNMEASURED_BROWSER_UNAVAILABLE`.
- **WebKit:** Attempted if WebKit runtime is present; otherwise marked `UNMEASURED_BROWSER_UNAVAILABLE`.
- **Mobile / Native Safari:** Explicitly `UNMEASURED`.

---

## 5. Ceilings & Stopping Rules

| Metric | Threshold Ceiling | Remediation / Action on Breach |
| :--- | :--- | :--- |
| **Worker Initialization Time** | ≤ 20,000 ms | Abort test; flag initialization performance breach |
| **Pipeline Execution Time (N=1000)** | ≤ 15,000 ms | Abort test; flag compute budget breach |
| **R Heap Allocation** | ≤ 250 MB | Trigger GC; flag excessive heap retention |
| **Data Residue Sentinel Match** | 0 occurrences | Immediate test FAIL; preserve store dumps |
| **Prohibited Egress In Nominal Run**| 0 requests | Immediate test FAIL; preserve HTTP audit log |
| **Falsification Detection** | Exactly 1 receipt | If mock sink receives 0 requests, falsification FAILS |

---

## 6. Positive and Negative Controls

### 6.1 Positive Controls
1. **Runtime Verification:** WebR version string (`R.version.string`) returns `"R version 4.6.0"`.
2. **Package Loading:** `library(MatchIt)` and `library(cobalt)` execute with exit code 0.
3. **Statistical Parity:** Point estimates and covariate balance match native R golden reference within validated numerical tolerances (`eps ≤ 1e-4`).
4. **Falsification Positive Control:** Deliberate dispatch of `SNTL-FALS-06` to `/api/mock-falsification-sink` is captured by mock HTTP sink, proving surveillance active.

### 6.2 Negative Controls
1. **Control A (Page Scope):** Page initiates `fetch('/api/prohibited-leak-page')` -> detected & blocked by isolation rule.
2. **Control B (Worker Scope):** Dedicated Worker initiates `fetch('/api/prohibited-leak-worker')` with payload -> detected & blocked.
3. **Control C (External Scope):** Worker initiates `fetch('https://unauthorized-external-telemetry.example.org')` -> blocked by CSP `connect-src 'self'`.
4. **Control D (R Internal Scope):** Simulated R `download.file` / internal socket egress -> prohibited.

---

## 7. Qualification Verdict Definitions

- **`PASS`:** All positive controls pass, zero unexpected network egress, zero storage residue across T1–T5, 100% parameter binding attack rejection/sanitization, and falsification successfully traps leak.
- **`FAIL`:** Any sentinel detected in persistent storage, unexpected network egress during nominal run, failure to trap falsification attempt, or parameter binding code injection.
- **`BLOCKED`:** Required binary dependencies missing or corrupt, or environmental inability to launch browser context.
- **`UNMEASURED`:** Feature or browser platform not evaluated in current run (e.g. mobile Safari, direct Wasm linear memory byte inspection).
