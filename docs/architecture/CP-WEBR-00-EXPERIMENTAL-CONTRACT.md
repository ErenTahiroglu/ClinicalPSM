# CP-WEBR-00 Experimental Contract: Browser-R Feasibility & Reference Parity

**Phase Identifier:** `CP-WEBR-00`
**System:** ClinicalPSM
**Date Context:** 18 October 2026
**Document Status:** Research & Evaluation Contract (Not Approved for Production)
**Governing Authority:** Independent Red Team (ChatGPT)

---

## 1. Objective & Non-Goals

### 1.1 Objective
The purpose of `CP-WEBR-00` is to rigorously evaluate whether executing native R packages (`MatchIt` v4.8.x and `cobalt` v5.0.x) inside client browsers via WebAssembly (**WebR**) represents a superior, lower-maintenance, and more defensible architecture than maintaining a custom pure-TypeScript statistical engine in `src/lib/psm/`.

### 1.2 Explicit Non-Goals & Boundaries in FOUNDATION-01
- **DO NOT** replace the existing TypeScript engine during FOUNDATION-01.
- **DO NOT** add `@web-r/webr` to root `package.json` or `apps/web/package.json` until the feasibility gate passes.
- **DO NOT** download or vendor unverified WebAssembly binaries into the repository.
- **DO NOT** claim that WebR automatically guarantees exact numerical equivalence without running golden-reference test suites.
- **DO NOT** enable real clinical data uploads.

---

## 2. Experimental Dimensions & Evaluation Protocol

```
[WebR Wasm Evaluation Dimensions]
  ├── 1. Package Availability & Version Pinning (CRAN Wasm binaries for MatchIt/cobalt)
  ├── 2. Performance & Payload (Wasm download size, cold start, memory limits)
  ├── 3. Security & Isolation (CSP, COOP/COEP headers, zero external calls)
  ├── 4. Numerical Fidelity (Golden R 4.4.2 fixtures agreement)
  └── 5. Hosting Feasibility (Cloudflare Free Static Assets compatibility)
```

### 2.1 Package Availability, Pinning & Licensing
1. **Target Versions:**
   - WebR Core Runtime: `v0.4.x` (or latest stable release pinned to WebR's official release repository).
   - Base R Version: `R 4.4.x` or `R 4.5.x`.
   - Primary Packages: `MatchIt` (`>= 4.8.1`), `cobalt` (`>= 5.0.0`), `stats`, `graphics`.
2. **Wasm Binary Provenance:**
   - Investigate whether official pre-compiled Wasm packages exist on R-Universe (`https://r-universe.dev`) or Posit's official WebR package repository (`https://repo.r-wasm.org`).
   - Packages with compiled C/C++ or Fortran code (e.g., MatchIt's C++ nearest-neighbor routines) must have verified Emscripten/Wasm builds.
3. **Licensing Compliance:**
   - R is licensed under GPL-2 / GPL-3. `MatchIt` is GPL-2 / GPL-3.
   - Serving WebAssembly binaries as client-side executables must be evaluated to ensure compliance with GPL copyleft distribution clauses. Because ClinicalPSM operates as a browser-local open workflow, distributing source-linked R scripts and open-source frontend code aligns with GPL obligations.

### 2.2 Performance, Cold-Start & Memory Limits
1. **Initial Payload Size:**
   - WebR base runtime (`webr.mjs`, `webr-R.wasm`, `webr-R.data`): Typically ~25–30 MB uncompressed, ~8–12 MB gzipped/brotli.
   - Package bundle size (`MatchIt`, `cobalt`, dependencies): Measure exact transfer size.
   - **Acceptance Threshold:** Total initial transfer must not exceed **20 MB compressed** over broadband; asset caching via HTTP Cache-Control must ensure second visits load in $< 500$ ms.
2. **Cold-Start Latency:**
   - Measure time from worker initialization to R interpreter ready:
     - High-end desktop (M-series Mac, Intel i7): Target $< 2.5$ seconds.
     - Mid-range laptop / hospital terminal: Target $< 6.0$ seconds.
   - UI must display a clear, accessible loading state: *"Initializing independent R statistical environment..."*
3. **Memory Ceiling & Heap Constraints:**
   - V8 WebAssembly linear memory limits: typically 2GB maximum heap.
   - Measure memory consumption when matching datasets of $N = 1,000$, $N = 10,000$, and $N = 50,000$ rows.
   - Garbage collection behavior: Ensure terminating or recycling the WebR worker frees all allocated memory.

### 2.3 Browser Compatibility & Security Isolation
1. **Cross-Browser Verification:**
   - Test execution across modern desktop engines: Chromium (Chrome, Brave, Edge), Gecko (Firefox), and WebKit (Safari).
   - Safari memory restrictions on WebAssembly threads must be specifically audited.
2. **Security Headers (COOP / COEP):**
   - WebR with multi-threading (SharedArrayBuffer) requires:
     ```http
     Cross-Origin-Opener-Policy: same-origin
     Cross-Origin-Embedder-Policy: require-corp
     ```
   - Cloudflare Workers Static Assets (`_headers`) must be verified to serve these headers without breaking existing asset delivery.
3. **Content Security Policy (CSP):**
   - CSP must permit `worker-src 'self' blob:` and `script-src 'self' 'wasm-unsafe-eval'`.
   - Network transmission rules: `connect-src 'self'` must strictly block outgoing HTTP requests during data analysis, preventing covert telemetry or package auto-fetching.

### 2.4 Golden-Reference Verification Protocol
WebR must be tested against the exact same four golden benchmark datasets used to audit the TypeScript engine:
- **Benchmark 1 (Lalonde NSW):** Standard 1:1 nearest neighbor matching on continuous and binary variables.
- **Benchmark 2 (Synthetic HD20):** 2,500 subjects, 20 covariates, moderate collinearity.
- **Benchmark 3 (Synthetic RareExp):** Skewed exposure ratio (3% treated), donor pool exhaustion.
- **Benchmark 4 (Synthetic QuasiSep):** Quasi-complete separation detection and error propagation.

**Required Numerical Concordance:**
- Propensity score agreement: $|\text{PS}_{\text{WebR}} - \text{PS}_{\text{Docker R}}| < 1.0 \times 10^{-7}$.
- Matched pair indices: **100% exact match** on unique closest candidates; where identical-distance ties exist, tie-breaker resolution must match R MatchIt's deterministic C++ index order.
- Standardized Mean Differences: $|\text{SMD}_{\text{WebR}} - \text{SMD}_{\text{Docker R}}| < 1.0 \times 10^{-4}$.

### 2.5 Cloudflare Free Compatibility
1. **Zero Recurring Infrastructure Cost:**
   - WebR Wasm binaries, data files, and JavaScript wrappers must be served entirely as static files via Cloudflare Workers Static Assets.
   - Cloudflare Free allows unlimited bandwidth and static file requests; asset sizes must remain well within Cloudflare's 25 MB single-file upload limit.
2. **Zero Server Compute:**
   - The Cloudflare Worker script must do zero data processing; it serves only static assets, preserving the 10 ms CPU Free tier limit.

---

## 3. Failure & Rollback Protocol

If `CP-WEBR-00` discovers that:
1. Cold start exceeds 10 seconds on standard hardware, or
2. Compiled Wasm binaries for `MatchIt` have unresolved Emscripten C++ runtime faults, or
3. Browser memory crashes on datasets $N > 10,000$, or
4. Security headers (COOP/COEP) cause unacceptable breakage on target clinical hospital networks:

**The platform will immediately roll back to the verified TypeScript engine architecture** (Option A from the architecture review), focusing engineering effort on fixing the five mathematical discrepancies in `src/lib/psm/` against containerized R golden fixtures.

---

## 4. Phase Execution Gate Criteria

`CP-WEBR-00` research may commence only when:
- FOUNDATION-01 is approved by the independent Red Team.
- `development` branch is stable and CI is green.
- An isolated experimental worktree `research/cp-webr-00` is established.
- Zero production or user-facing files are touched during the experiment.
