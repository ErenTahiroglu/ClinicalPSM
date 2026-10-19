# CP-WEBR-00B Executable Qualification Report (R2 Remediation Edition)

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Required Reference Branch:** `development`
**Starting Baseline SHA:** `ccac139638ffecb121ea2eb18e4514930c92f664`
**Date:** 19 October 2026
**Auditor:** Autonomous Agentic Red Team Pair
**Independent Phase Authority:** ChatGPT
**R0 Initial Verdict:** `EXPERIMENT_INSUFFICIENT — R1_REQUIRED`
**R1 Verdict:** `EXPERIMENT_INSUFFICIENT — R2_REQUIRED`
**R2 Remediation Report:** [`CP-WEBR-00B-R2-RED-TEAM-REPORT.md`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/CP-WEBR-00B-R2-RED-TEAM-REPORT.md)
**Final Recommended Verdict:** `EXPERIMENT_PASS_FOR_ARCHITECTURE_REVIEW`

---

## 1. Executive Summary

This qualification experiment evaluated whether official R packages `MatchIt` (4.8.1) and `cobalt` (5.0.0) can execute correctly, reproducibly, privately, and performantly inside `WebR` (0.6.0) under supported browser environments and Cloudflare Workers Static Assets Free tier constraints.

The initial R0 submission was returned by the Independent Red Team as `EXPERIMENT_INSUFFICIENT — R1_REQUIRED` due to Node-only host measurements, an asymmetric comparator, unresolved complete separation diagnostics, and lack of real browser qualification.

This R2.1 edition resolves all remaining evidence-integrity and scientific accounting items:
1. **Toolchain Provenance & Reproducibility:** WebR 0.6.0 embeds R 4.6.0 compiled with Emscripten 5.0.7. `server.mjs` undefined `PORT` resolved, machine-specific scratch paths eliminated, and deterministic `setup_experiment.mjs` verifies all 21 Wasm packages against SHA-256 digests.
2. **Dedicated Application Worker Qualification:** Delineates Page context (`harness.js`), Dedicated Application Worker (`worker.js`), and WebR internal worker. Real Worker creation, communication via `postMessage`, MatchIt / cobalt execution, cancellation, and termination verified. Target architecture is Cloudflare Workers Static Assets (`apps/web`).
3. **Parity Comparator Accounting & Falsification:** Strict symmetric key comparator passes 25/25 semantic fixtures (100.0%) and 24/25 numeric fixtures (96.0%). Categories computed directly from result object statuses: 20 successful pair equivalence fixtures (`fix_01`..`fix_15`, `fix_17`, `fix_18`, `fix_20`, `fix_21`, `fix_22`), 3 expected reference errors (`fix_19`, `fix_19b`, `fix_23`), 1 policy reject (`fix_24`), and 1 numerical tolerance failure (`fix_16` complete separation; parameters non-identifiable, `matching.converged == TRUE` by deviance delta < 1e-8, classified fail-closed as `REJECT_FOR_PUBLICATION`). 12/12 comparator falsification mutation tests demonstrably caught.
4. **Verified Patient Sentinel & Genuine No-Egress:** Target ID `sub_0001` verified to exist exactly once and replaced with patient sentinel `SENTINEL_PATIENT_MRN_8877665544`. Verified that worker received sentinel dataset and sentinel was present in R data.frame. Online analysis completed producing 119 pairs with 0 unexpected network requests. Offline analysis completed with network disabled. Negative controls A (page-level) and B (worker-level) intercepted and aborted before egress. Persistent storage (localStorage, sessionStorage, caches, SW) 100% clean; IndexedDB has zero sentinels.
5. **Measurable Cancellation & Full Demonstrated Recovery:** Active long-running R workload interrupted via `webr.interrupt()` with observed cessation in 1.59 ms. Hard worker termination via `worker.terminate()` completes in 0.04 ms with pending requests rejected. Fresh worker creation (0.08 ms), full WebR and package restoration (2225 ms), and subsequent statistical pipeline execution (91 ms, 119 matched pairs) empirically demonstrates full statistical recovery. Wasm linear memory release latency is explicitly declared `UNMEASURED`.
6. **Memory Measurement Provenance:** Inaccessible Wasm linear memory across worker boundary explicitly recorded as `UNMEASURED (Private to WebR worker)`. R heap memory measured via R runtime garbage collector `sum(gc()[,2])` (32.8 MB baseline to 38.5 MB at $N=10,000$). Window JS heap measured via performance API (1.4 MB to 2.9 MB).
7. **Real Browser Benchmarks:** Benchmarked on Chromium (Brave 154 / Chrome for Testing) across 3 repetitions: $N=250$ (65 ms), $N=1,000$ (83 ms), $N=5,000$ (191 ms), $N=10,000$ (468 ms). Multi-tab concurrency verified across 4 simultaneous tabs. Firefox, WebKit, Safari, and mobile strictly reported as `UNMEASURED`.
8. **Hardened Security Headers & Self-Hosting:** CSP hardened by eliminating `'unsafe-inline'`. Upstream Emscripten dynamic linking requirement for `'unsafe-eval'` documented. COOP, COEP, CORP, and correct Wasm MIME types verified.
9. **Cloudflare Free Hosting Constraints:** 188 deployable runtime and package files total 69.08 MiB. Largest asset (`R.wasm`, 17.23 MiB) strictly satisfies 25 MiB limit. Total files (188) well below 20,000 file limit. Asset limit compliance is verified; real Cloudflare deployment remains out-of-scope for the experiment.
10. **GPL Licensing Status:** Complete 21-package SBOM and licenses verified (`LICENSING_INVENTORY = PASS`). Delivering GPL-covered WebAssembly binaries to users' browsers creates distribution/conveying obligations under GPL v2/v3. Web Worker message boundaries do not automatically resolve combined-work status for proprietary frontend code. Production clearance is strictly blocked (`PRODUCTION_LICENSING_CLEARANCE = BLOCKED`) pending formal legal counsel review.
11. **Dedicated CI Workflow:** `.github/workflows/experiment-cp-webr-00b.yml` runs clean-checkout setup, mutation tests, parity comparator, Cloudflare audit, server security headers check, and manifest integrity check without modifying existing security gates. Trailing blank line whitespace cleanly remediated (`git diff --check` passes).

---

## 2. Section 12 Independent Verdicts

| Category | Verdict | Evidence |
|---|---|---|
| **`PACKAGE_EXECUTION`** | **`PASS`** | Official CRAN MatchIt 4.8.1 and cobalt 5.0.0 execute inside WebR 0.6.0 (R 4.6.0 Wasm). |
| **`NATIVE_R_PARITY`** | **`PASS`** | Strict symmetric comparator passes 25/25 semantic fixtures (100.0%) and 24/25 numeric fixtures (96.0%). Machine-readable statuses: 20 pair equivalence, 3 expected reference errors, 1 policy reject, 1 numerical failure (`fix_16` complete separation; SE > 39,000, `matching.converged == TRUE`, classified fail-closed as `REJECT_FOR_PUBLICATION`). 12/12 mutation falsification tests caught. |
| **`BROWSER_EXECUTION`** | **`PASS`** | Dedicated Application Worker (`worker.js`) qualified on Chromium (Brave 154). Multi-tab concurrency (4 tabs) verified. Firefox, WebKit, Safari, and mobile recorded as `UNMEASURED`. |
| **`PERFORMANCE`** | **`PASS`** | Benchmarked across 3 repetitions on N=250 (65ms), N=1,000 (83ms), N=5,000 (191ms), N=10,000 (468ms). Real memory provenance established: R heap memory tracked via `sum(gc()[,2])` (32.8 MB to 38.5 MB). Internal Wasm linear memory explicitly declared `UNMEASURED`. |
| **`PRIVACY_NO_EGRESS`** | **`PASS`** | Browser-context request interception. Patient sentinel `SENTINEL_PATIENT_MRN_8877665544` verified injected in place of `sub_0001` and received by R. Negative controls A (page) and B (worker) intercepted before egress. Offline execution completed with zero internet. Persistent storage (localStorage, sessionStorage, caches, SW) 100% clean; IndexedDB contains 0 clinical data / sentinels. |
| **`CLOUDFLARE_STATIC_FIT`** | **`PASS`** | 188 total deployable assets (limit 20,000). Total uncompressed size 69.08 MiB. Largest file `R.wasm` 17.23 MiB (limit 25 MiB). Cloudflare asset-limits verified; real deployment out-of-scope. |
| **`TOOLCHAIN_PROVENANCE`** | **`PASS`** | WebR 0.6.0 (R 4.6.0 Wasm emscripten 5.0.7). Clean-checkout setup script removes all machine-specific paths. NEWS.md upstream documentation discrepancy recorded. |
| **`LICENSING_INVENTORY`** | **`PASS`** | Full 21-package dependency SBOM locked with exact license classifications. |
| **`PRODUCTION_LICENSING_CLEARANCE`** | **`BLOCKED`** | Delivering GPL WebAssembly binaries constitutes distribution. Combined-work status for companion frontend code requires formal legal review. |

---

## 3. Final Proposed Verdict

$$\mathbf{EXPERIMENT\_PASS\_FOR\_ARCHITECTURE\_REVIEW}$$

**Remediation Summary:**
- Technical and scientific execution inside WebR is fully qualified in a real browser environment inside a Dedicated Web Worker.
- Privacy and zero-egress contracts are empirically proven with verified patient-sentinel injection, negative controls, browser-context request interception, offline execution, and storage verification.
- Cloudflare Free hosting limits are validated with comfortable headroom.
- Target architecture is confirmed as Cloudflare Workers Static Assets (`apps/web`).
- Production licensing clearance is explicitly marked `BLOCKED` pending legal review.
- **Strict Boundary Reminder:** No production application modifications were made (`clinicalpsm/src/`). No merge into `main`. Awaiting independent ChatGPT Red Team review.
