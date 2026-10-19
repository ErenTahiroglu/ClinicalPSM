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

This R2 edition remediates every finding from the R0 and R1 independent reviews:
1. **Toolchain Provenance & Reproducibility:** WebR 0.6.0 embeds R 4.6.0 compiled with Emscripten 5.0.7. `server.mjs` undefined `PORT` resolved, machine-specific scratch paths eliminated, and deterministic `setup_experiment.mjs` verifies all 21 Wasm packages against SHA-256 digests.
2. **Dedicated Application Worker Qualification:** Delineates Page context (`harness.js`), Dedicated Application Worker (`worker.js`), and WebR internal worker. Real Worker creation, communication via `postMessage`, MatchIt / cobalt execution, cancellation, and termination verified.
3. **Parity Comparator Repairs & Falsification:** Strict symmetric key comparator passes 25/25 semantic fixtures (100.0%) and 24/25 numeric fixtures (96.0%). `fix_16` complete separation is strictly treated as expected fail-closed (`REJECT_FOR_PUBLICATION`). 12/12 comparator falsification mutation tests demonstrably caught.
4. **Genuine No-Egress & Privacy Interception:** Browser-context-wide Playwright request interception aborts unauthorized requests before egress. Negative controls A (page-level) and B (worker-level with synthetic sentinels) intercepted and aborted. Full offline execution with disabled network completed producing 119 matched pairs with 0 network leaks.
5. **Persistent Storage Audit:** Deep inspection of `localStorage` (0), `sessionStorage` (0), `caches` (0), `serviceWorker` (0), and `indexedDB` (`emscripten_filesystem`) confirmed zero patient sentinels or clinical records persisted.
6. **Measurable Cancellation Latency:** Active long-running R workload interrupted via `webr.interrupt()` with confirmed cessation in 1.7 ms and demonstrated recovery. Hard worker termination via `worker.terminate()` completes in 0.1 ms with pending requests rejecting, and fresh recovery worker respawns in 10.7 ms.
7. **Memory Measurement Provenance:** Inaccessible Wasm linear memory across worker boundary explicitly recorded as `UNMEASURED (Private to WebR worker)`. R heap memory measured via R runtime garbage collector `sum(gc()[,2])` (32.8 MB baseline to 38.4 MB at $N=10,000$). Window JS heap measured via performance API (1.5 MB to 2.6 MB).
8. **Real Browser Benchmarks:** Benchmarked on Chromium (Brave 154 / Chrome for Testing) across 3 repetitions: $N=250$ (66 ms), $N=1,000$ (79 ms), $N=5,000$ (201 ms), $N=10,000$ (469 ms). Multi-tab concurrency verified across 4 simultaneous tabs. Firefox, WebKit, and Safari strictly reported as `UNMEASURED`.
9. **Hardened Security Headers & Self-Hosting:** CSP hardened by eliminating `'unsafe-inline'`. Upstream Emscripten dynamic linking requirement for `'unsafe-eval'` documented. COOP, COEP, CORP, and correct Wasm MIME types verified.
10. **Cloudflare Free Hosting Constraints:** 188 deployable runtime and package files total 69.08 MiB. Largest asset (`R.wasm`, 17.23 MiB) strictly satisfies 25 MiB limit. Total files (188) well below 20,000 file limit.
11. **Dedicated CI Workflow:** `.github/workflows/experiment-cp-webr-00b.yml` runs clean-checkout setup, mutation tests, parity comparator, Cloudflare audit, server security headers check, and manifest integrity check without modifying existing security gates.

---

## 2. Section 12 Independent Verdicts

| Category | Verdict | Evidence |
|---|---|---|
| **`PACKAGE_EXECUTION`** | **`PASS`** | Official CRAN MatchIt 4.8.1 and cobalt 5.0.0 execute inside WebR 0.6.0 (R 4.6.0 Wasm). |
| **`NATIVE_R_PARITY`** | **`PASS`** | Strict symmetric comparator passes 25/25 semantic fixtures (100.0%) and 24/25 numeric fixtures (96.0%). `fix_16` complete separation is strictly classified as expected fail-closed (`REJECT_FOR_PUBLICATION`). 12/12 mutation falsification tests caught. |
| **`BROWSER_EXECUTION`** | **`PASS`** | Real browser qualification on Chromium (Brave 154) executing inside a Dedicated Web Worker (`worker.js`). Multi-tab concurrency (4 tabs) verified. Firefox, WebKit, and Safari recorded as `UNMEASURED`. |
| **`PERFORMANCE`** | **`PASS`** | Benchmarked across 3 repetitions on N=250 (66ms), N=1,000 (79ms), N=5,000 (201ms), N=10,000 (469ms). Real memory provenance established: R heap memory tracked via `sum(gc()[,2])` (32.8 MB to 38.4 MB). Internal Wasm linear memory explicitly declared `UNMEASURED`. |
| **`PRIVACY_NO_EGRESS`** | **`PASS`** | Browser-context-wide request interception. Negative controls A (page-level) and B (worker-level with synthetic sentinel) intercepted and aborted before egress. Offline execution completed with zero internet. Persistent storage (localStorage, sessionStorage, caches, service workers) 100% clean; IndexedDB contains 0 clinical data / sentinels. |
| **`CLOUDFLARE_STATIC_FIT`** | **`PASS`** | 188 total deployable assets (limit 20,000). Total uncompressed size 69.08 MiB. Largest file `R.wasm` 17.23 MiB (limit 25 MiB). |
| **`TOOLCHAIN_PROVENANCE`** | **`PASS`** | WebR 0.6.0 (R 4.6.0 Wasm emscripten 5.0.7). Clean-checkout setup script removes all machine-specific paths. NEWS.md upstream documentation discrepancy recorded. |
| **`LICENSING_READINESS`** | **`PASS`** | Full 21-package dependency SBOM locked. GPL-2/GPL-3 boundaries documented; runtime client execution avoids server redistribution issues. |

---

## 3. Final Proposed Verdict

$$\mathbf{EXPERIMENT\_PASS\_FOR\_ARCHITECTURE\_REVIEW}$$

**Remediation Summary:**
- Technical and scientific execution inside WebR is fully qualified in a real browser environment inside a Dedicated Web Worker.
- Privacy and zero-egress contracts are empirically proven with negative controls, browser-context request interception, offline execution, and storage verification.
- Cloudflare Free hosting limits are validated with comfortable headroom.
- **Strict Boundary Reminder:** No production application modifications were made (`clinicalpsm/src/`). No merge into `main`. Awaiting independent ChatGPT Red Team review.

