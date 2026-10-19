# CP-WEBR-01 — Production Architecture Contract

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Phase:** `CP-WEBR-01A R1.1 — Architecture Contract Correction`
**Governing Authority:** Independent Red Team (ChatGPT)
**Status:** Normative Architecture Contract (Design-Only — Zero Production Code Integration)
**Target Runtime:** Cloudflare Workers Static Assets (`apps/web`)
**Statistical Engine:** WebR 0.6.0 (R 4.6.0 Wasm) + MatchIt 4.8.1 + cobalt 5.0.0

---

## 1. Executive Architecture Summary

### 1.1 Purpose
This document establishes the authoritative production architecture for ClinicalPSM. It translates the empirical findings of experimental qualification (`CP-WEBR-00B R2.1`) and primary-source API and mathematical definitions into an implementation-ready contract for a browser-local, zero-egress clinical propensity score matching application.

### 1.2 Core Architectural Principle: Single Authoritative Computation Layer
The statistical computing architecture is strictly hierarchical:

```
┌────────────────────────────────────────────────────────┐
│             TypeScript UI & Orchestration              │
│  - Input validation & dataset ingestion                │
│  - Bidirectional symbol mapping (original <-> safe)    │
│  - Parameter configuration & factor role assignment    │
│  - Worker lifecycle management & progress display      │
│  - Canonical result presentation & export formatting   │
└──────────────────────────┬─────────────────────────────┘
                           │ Typed Data Structures (Structured Clone)
                           ▼
┌────────────────────────────────────────────────────────┐
│          Dedicated Application Worker (worker.ts)      │
│  - WebR 0.6.0 runtime coordination & package mounting  │
│  - Verified RObject binding via webR.RObject APIs      │
│  - Parameterized template execution in child env       │
│  - Error interception, diagnostics & fail-closed policy│
└──────────────────────────┬─────────────────────────────┘
                           │ Copied into WebAssembly Heap Memory
                           ▼
┌────────────────────────────────────────────────────────┐
│             WebR Runtime (Wasm R 4.6.0)                │
│  - MatchIt 4.8.1 (1:1 Nearest-Neighbor, glm logit)     │
│  - cobalt 5.0.0 (ATT standardized balance diagnostics) │
│  - Single authoritative statistical computation        │
└────────────────────────────────────────────────────────┘
```

**Prohibition on Silent TypeScript Recalculation:**
The TypeScript application layer is strictly prohibited from recalculating, substituting, or modifying statistical quantities. Specifically:
- Propensity scores and linear logits are produced exclusively by R's `stats::glm`.
- Pair matching, weights, and subclass assignments are generated exclusively by `MatchIt::matchit`.
- Standardized Mean Differences (SMDs), variance ratios, and baseline summaries are calculated exclusively by `cobalt::bal.tab`.
- The unvalidated legacy TypeScript statistical engine (`clinicalpsm/src/lib/psm/`) is **retired** and must never be used as an automatic fallback.
- If WebR fails to initialize, load packages, or execute safely, the application must **fail closed** with an explanatory diagnostic report.

---

## 2. Component Boundaries & Responsibilities

| Component | Execution Context | Responsibilities | Strict Boundaries |
| :--- | :--- | :--- | :--- |
| **UI Orchestrator** | Main Thread (`Window`) | - File parsing (CSV -> Schema)<br>- Original header preservation & reversible symbol mapping<br>- Pretreatment/treatment/outcome role selection<br>- Form validation & user alerts<br>- Rendering balance tables & Love plots<br>- DOCX, CSV, SVG publication downloads | - Zero statistical computation<br>- No direct WebR manipulation<br>- Cannot alter result snapshots |
| **Dedicated Application Worker** | Web Worker (`DedicatedWorkerGlobalScope`) | - Lazy initialization of WebR 0.6.0<br>- Pre-compiled package archive mounting<br>- Verified object binding via `webR.RObject` API<br>- Execution of immutable R function template<br>- Extraction of canonical results<br>- Interruption & termination lifecycle | - Isolated from DOM and storage<br>- Single-job execution queue<br>- No external network connectivity |
| **WebR Runtime Worker** | Internal Worker (`webr-worker.js`) | - Emscripten Wasm execution environment<br>- R virtual filesystem (`emscripten_filesystem`)<br>- Dynamic library linking (`libRblas.so`, `libRlapack.so`) | - Managed exclusively via WebR API<br>- Sandboxed execution |
| **Official R Packages** | Wasm R Libraries (`/repo/`) | - `MatchIt` 4.8.1: greedy 1:1 matching without replacement<br>- `cobalt` 5.0.0: ATT covariate balance tables<br>- 19 pinned transitive dependencies in `dependency-lock.json` | - Pure CRAN binaries compiled for Wasm R 4.6.0<br>- Zero custom algorithm modifications |
| **Canonical Result Store** | Worker-to-UI Boundary Copy | - Cryptographically fingerprinted analysis snapshot<br>- Complete matched-pair ledger<br>- Provenance metadata and diagnostic warnings | - Defensive copy at boundary (see §4.4)<br>- No shared mutable buffer after finalization<br>- All export generators derive from the finalized copy |

---

## 3. Dedicated Worker Lifecycle & State Machine

### 3.1 State Machine Specification
The worker runtime transitions deterministically through eight mutually exclusive states:

```
[ NOT_LOADED ]
       │
       ▼ (User requests analysis / Preload trigger)
[ INITIALIZING ] ────(Fatal load error)────► [ BLOCKED ]
       │
       ▼ (WebR ready, VFS mounted, packages loaded)
   [ READY ] ◄─────────────────────────────────────────────┐
       │                                                   │
       ▼ (Job submitted)                                   │
  [ RUNNING ] ────(Interrupt / Cancel)──► [ CANCELLING ]   │
       │                                       │           │
       │                                       ▼           │
       │                                [ Hard Terminate ] │
       │                                       │           │
       ├────(Execution success)────────────────┼───────────┘
       │                                       ▼
       ▼                                [ RECOVERABLE_ERROR ]
  [ COMPLETED ]                                │
       │                                       ▼ (Spawn fresh worker)
       └───────► (Ready for next job) ──► [ INITIALIZING ]
```

### 3.2 State Definitions & Transitions
1. **`NOT_LOADED`:** Worker script has not been instantiated. Memory consumption is 0 MB.
2. **`INITIALIZING`:** `new Worker('/worker.js', { type: 'module' })` invoked. WebR downloads runtime assets (`R.wasm`, `webr.mjs`) and installs pinned package archives. Emits progress events (`INIT_PROGRESS`).
3. **`READY`:** WebR runtime is initialized; `MatchIt` and `cobalt` are loaded into the R session; VFS is ready. Ready to receive analysis payloads.
4. **`RUNNING`:** Actively executing statistical analysis on dataset. Accepts zero concurrent tasks. Emits heartbeats.
5. **`CANCELLING`:** Cancellation requested by user. Worker issues `webr.interrupt()`. If workload does not cease within 2,000 ms, transitions to hard termination.
6. **`COMPLETED`:** Analysis finished successfully. Canonical result payload dispatched to main thread. State reverts to `READY`.
7. **`RECOVERABLE_ERROR`:** Job failed due to data-specific error (e.g. numerical failure, missing data, rank deficiency) or interrupted execution. Worker instance terminates (`worker.terminate()`); main thread prepares fresh replacement worker.
8. **`BLOCKED`:** Fatal environment failure (e.g. WebAssembly unsupported, SharedArrayBuffer disabled without fallback, network download failure for static assets). Execution halts with clear user advisory.

### 3.3 Concurrency & Multi-Tab Resource Governance
- **Single-Job Concurrency:** Each worker processes exactly one job at a time. Concurrent requests on the same tab are queued or rejected.
- **Worker Interruption Protocol:**
  - User clicks "Cancel Analysis": UI dispatches `{ type: 'INTERRUPT' }`.
  - Worker calls `webr.interrupt()`. Measured cessation latency in Chromium: **1.59 ms** (`EVID_EXPERIMENT_VERIFIED`).
  - If worker does not acknowledge cessation within 2.0 seconds, UI executes `worker.terminate()`. Measured termination request latency: **0.04 ms** (`EVID_EXPERIMENT_VERIFIED`).
- **Demonstrated Recovery:**
  - Upon hard termination, all pending promises reject with `OperationCancelledError`.
  - UI instantiates a fresh worker (`0.08 ms`), re-mounts pinned packages (`2,225.88 ms`), and confirms operational readiness via statistical benchmark (`91.25 ms`, 119 matched pairs) (`EVID_EXPERIMENT_VERIFIED`).
- **Multi-Tab Memory Controls & RAM Disclosure:**
  - Each browser tab spawns its own Dedicated Worker and private WebR instance.
  - Tab close or navigation immediately destroys the worker and initiates browser garbage collection.
  - **Critical Provenance Disclosure:** Calling `worker.terminate()` drops user-space JavaScript references, but immediate operating system RAM reclamation is governed by browser engine internal garbage collection and OS memory management. User-space code cannot force synchronous OS memory release (`wasm_linear_memory = UNMEASURED`).

---

## 4. Secure Data Ingestion & Injection Prevention Architecture

### 4.1 Vulnerability Elimination: No String Interpolation
In experimental prototypes, R scripts were generated via JavaScript template strings (e.g., `evalR(\`matchit(\${formula}, data = df)\`)`). This pattern is strictly prohibited in production. User-provided CSV headers or factor levels containing backticks, quotes, or semicolons could inject arbitrary R commands.

### 4.2 Reversible Bidirectional Symbol Mapping & Header Ingestion Policy

To support legitimate clinical naming conventions without compromising R execution security, ClinicalPSM rejects applying restrictive R identifier regexes to raw clinical headers or factor levels. Ordinary clinical names routinely feature whitespace, parentheses, comparator operators, units, hyphens, and Unicode characters (e.g., `"Patient Age (years)"`, `"HbA1c > 8.0%"`, `"Stage IV (Metastatic)"`, `"Yaş (yıl)"`).

Instead, the architecture enforces a strict two-tier ingestion and symbol translation model:

```
[ User Input CSV Headers ]
  - "Patient Age (years)"       ──►  Internal Safe Identifier: "cov_01"
  - "HbA1c > 8.0%"              ──►  Internal Safe Identifier: "cov_02"
  - "Treatment Group (0=A,1=B)" ──►  Internal Safe Identifier: "trt_01"
```

1. **Tier 1 — Original Header & Value Structural Safety Checks:**
   - **Size Limits:** Minimum 1 non-whitespace character; maximum 256 Unicode code points per header.
   - **Encoding & Safety:** Must be valid UTF-8. Null bytes (`\x00`) and unprintable control characters are strictly rejected.
   - **Unicode Normalization:** Unicode strings are normalized to canonical decomposition followed by canonical composition (NFC) before uniqueness evaluation.
   - **Case Sensitivity & Uniqueness:** Column headers are evaluated case-sensitively (`"Age"` and `"age"` are distinct). Duplicate headers within the same dataset are rejected at ingestion with a clear explanatory diagnostic.
   - **Categorical Cell Values:** Legitimate categorical strings are preserved exactly as provided. Categorical cell values are **never** subjected to an R variable-name regex.
   - **Structural Malformation Rejection:** Files with mismatched column counts, unterminated quotes, or corrupted UTF-8 encodings are rejected at the parsing boundary. Ordinary clinical terminology is accepted.

2. **Tier 2 — Reversible Internal Symbol Mapping Invariants:**
   - Every accepted original header is mapped deterministically to a syntactically safe internal R identifier following: `^[a-z]+_[0-9]{2,4}$` (e.g., `cov_01`, `cov_02`, `trt_01`).
   - **Collision Detection:** If an alias generator encounters a potential alias collision, unique deterministic suffixes (`cov_01a`, `cov_01b`) are appended.
   - **Formula Construction:** All R formula strings, `data.frame()` column definitions, and `env.bind()` operations reference internal safe identifiers only:
     `stats::reformulate(termlabels = c("cov_01", "cov_02"), response = "trt_01")`
   - **Zero String Interpolation:** User-controlled header strings and cell values are **never interpolated into executable R code**.
   - **Factor Handling:** Categorical values are passed into R as explicit string vectors via WebR constructors (`webR.RCharacter`) and converted to factors programmatically (`factor(cov_02_raw)`).
   - **Reversibility Guarantee:** A bidirectional mapping table (`Record<string, string>`) is retained in memory. When rendering user-facing tables, plots, DOCX exports, or Methods text, all internal aliases are faithfully mapped back to original clinical headers.

### 4.3 Verified WebR 0.6.0 Object Binding Specification
Based on the exact WebR v0.6.0 TypeScript definitions (`webr-main.d.ts`, `robj-main.d.ts`, `robj-worker.d.ts`), object transfer is executed via verified WebR APIs rather than fictitious helpers:

```typescript
// Verified WebR 0.6.0 Object Binding Pattern
// 1. Data arrays constructed with appropriate TypedArray representations:
const n = rowCount;
const trtArray = new Int32Array(treatmentValues); // R INTSXP (0 and 1)
const ageArray = new Float64Array(ageValues);      // R REALSXP (numeric)
const stageArray = stageStringValues;             // R STRSXP (character)

// 2. Wrap into official WebR RObject proxies:
const rTrt = await new webR.RInteger(trtArray);
const rAge = await new webR.RDouble(ageArray);
const rStage = await new webR.RCharacter(stageArray);

// 3. Bind into an isolated child R environment (parent = baseenv()):
const analysisEnv = await new webR.REnvironment();
await analysisEnv.bind('trt_01', rTrt);
await analysisEnv.bind('cov_01', rAge);
await analysisEnv.bind('cov_02_raw', rStage);

// 4. Execute pre-compiled R function template within the isolated environment:
await webR.evalR(`
  # Build data frame programmatically
  df <- data.frame(
    trt_01 = trt_01,
    cov_01 = cov_01,
    cov_02 = factor(cov_02_raw)
  )
  # Execute MatchIt with exact arguments
  m_out <- MatchIt::matchit(
    formula = stats::reformulate(termlabels = c("cov_01", "cov_02"), response = "trt_01"),
    data = df,
    method = "nearest",
    distance = "glm",
    link = "linear.logit",
    estimand = "ATT",
    m.order = "largest",
    replace = FALSE,
    ratio = 1
  )
`, { env: analysisEnv });
```

**Technical Clarifications on Data Representation & API Status:**
- **Distinction Between Source API Availability and Proven Runtime Execution:** While the TypeScript interface signatures for `REnvironment`, `RInteger`, `RDouble`, `RCharacter`, `bind()`, and `evalR()` are verified in `webr@0.6.0`, this specific end-to-end execution sequence (environment creation, proxy binding, data frame conversion, and `MatchIt::matchit()` fitting) must undergo an isolated runnable smoke test in Phase `CP-WEBR-01B` before production integration. Unexecuted code examples must not be designated as fully validated runtime pipelines.
- **No Zero-Copy Transfer:** Transferring typed arrays from JavaScript to WebR involves memory serialization across the Web Worker communication channel and allocation into the Emscripten WebAssembly heap. It is **not** zero-copy.
- **`Uint8Array` Warning:** WebR represents `Uint8Array` as R `raw` vectors (`RAWSXP`), not integer vectors. Binary treatment indicators must be converted to `Int32Array` (`RInteger`) or `Float64Array` (`RDouble`) prior to binding.
- **Evaluation Environment:** The evaluation environment must inherit from `baseenv()` or `globalenv()`, **not** `emptyenv()`. `emptyenv()` contains zero functions, precluding basic operations like `data.frame()`, `factor()`, and `reformulate()`.

### 4.4 Canonical Result Immutability & Defensive Copy Contract

> [!IMPORTANT]
> Neither TypeScript `readonly` modifiers nor JavaScript shallow `Object.freeze()` provide runtime deep immutability. Shallow `Object.freeze()` does not freeze nested objects or arrays, and it cannot be applied meaningfully to nonempty `TypedArray` views (`Float64Array`, `Uint8Array`) backed by mutable `ArrayBuffer`s.
> Presenting `Object.freeze()` as a comprehensive deep immutability guarantee is technically false.

To ensure strict scientific integrity, ClinicalPSM establishes an implementable API-level defensive copy and boundary contract:

1. **Worker Finalization & Data Representation:**
   - Inside the Dedicated Worker, the calculation engine completes all model estimation, balance diagnostics, and sample accounting.
   - Upon finalization, the worker serializes all statistical values into a plain JSON-compatible canonical snapshot.
   - TypedArrays used during internal Wasm calculations are converted to standard primitive arrays (`number[]`, `string[]`). No live `Float64Array` or `Uint8Array` views backed by Emscripten WebAssembly heap memory are exposed across the worker boundary.
   - Any undefined numeric metric (e.g., variance ratio with a zero denominator) is represented explicitly as `null` (never `NaN`, `Infinity`, or omitted fields).

2. **Structured Clone Boundary Transfer:**
   - The finalized snapshot is transferred across the Web Worker boundary to the UI thread via `postMessage()`.
   - Structured Clone guarantees deep memory cloning: the UI thread receives a completely independent object graph with zero shared memory references.
   - No `SharedArrayBuffer` is utilized. `ArrayBuffer` instances are cloned, preventing buffer detachment or post-finalization mutation by the worker.

3. **No Writable Buffer Sharing:**
   - Once finalization and transmission occur, the worker terminates its references to the active analysis snapshot.
   - The worker cannot asynchronously mutate any property of the transferred result.

4. **Encapsulated Read-Only Consumer Access:**
   - On the UI main thread, the canonical result is ingested into an encapsulated store.
   - The store holds the plain data object in private closure scope (or `WeakMap`) and exposes access solely through read-only accessors.
   - Downstream UI components and export generators receive freshly reconstructed or defensive copy views upon request; consumers cannot mutate internal state.

5. **Versioned Serialization & Integrity Verification:**
   - The canonical result is enclosed within a versioned envelope:
     ```typescript
     interface VersionedCanonicalEnvelope {
       schemaVersion: "1.1.0";
       fingerprint: {
         datasetSha256: string;
         canonicalResultSha256: string;
       };
       result: CanonicalPsmResult;
     }
     ```
   - A SHA-256 integrity hash is computed over the deterministic JSON serialization of the canonical result at finalization.
   - The UI layer verifies this cryptographic fingerprint before enabling export generation, ensuring the data received matches the worker's computation bit-for-bit.

6. **Lifecycle & Disposal Semantics:**
   - The canonical snapshot persists in UI memory only for the duration of the active analysis session.
   - When a user uploads a new dataset, resets the analysis, or closes the browser tab, all snapshot references are dereferenced, making them eligible for immediate garbage collection.
   - To prevent memory accumulation in the worker, the dedicated worker is cleanly disposed of via `webR.destroy()` or terminated via `worker.terminate()`.

7. **Publication Consistency Guarantee:**
   - All generated publication artifacts—including DOCX Table 1, CSV matched pairs, SVG Love plots, and Methods narrative paragraphs—must derive all statistical and diagnostic values from the exact same finalized canonical result snapshot.

---

## 5. Cloudflare Workers Static Assets & CSP Architecture

### 5.1 Deployment Model
The production web client is hosted as static assets via Cloudflare Workers Static Assets (`apps/web`):
- All WebR core binaries (`R.wasm`, `webr.mjs`, `webr-worker.js`) are served directly from `/assets/webr/`.
- All 21 pre-compiled package archives are served directly from `/assets/repo/`.
- Zero external CDNs or third-party package repositories are accessed at runtime.

### 5.2 Cloudflare Free Tier Constraint Compliance
- **Total Asset Count:** 188 files (Limit: 20,000 files). Headroom: 99.06%.
- **Total Deployment Size:** 69.08 MiB uncompressed (Limit: 1,000 MiB).
- **Largest Single Asset:** `assets/webr/R.wasm` at 17.23 MiB (Limit: 25.00 MiB). Headroom: 7.77 MiB (31.1%).
- **Asset Integrity:** All files verified against `artifact-manifest.json` SHA-256 digests.

### 5.3 Content Security Policy (CSP) & Threat Analysis
Required headers configured in `_headers`:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self';
```

#### Detailed CSP Threat Model & Egress Threat Classification

> [!WARNING]
> Zero-egress of patient data is an **architectural objective** conditional on implementation and automated evidence from Phase `CP-WEBR-01B` (`SEC-GATE-01`). It is **not** an established pre-implementation guarantee.
> Asserting that zero-egress is guaranteed simply because Cloudflare hosts static assets and no API routes is technically invalid. A web browser can transmit sensitive data in attempted same-origin requests (e.g., query parameters, request headers, POST bodies) even when the destination server does not expose an API or rejects the request.

To avoid unsupported claims, the architecture categorizes network channels and security boundaries:

| Egress Category | Architectural Mechanism / Boundary | Verification Status |
| :--- | :--- | :--- |
| **1. Intentional Clinical-Row Uploads** | No server endpoints exist; client architecture dispatches zero clinical payload network requests | Architectural intent; requires automated CI verification |
| **2. Same-Origin Runtime Asset Downloads** | Static asset requests for `R.wasm`, `webr.mjs`, and 21 package archives from `/assets/` | Expected & verified; contain zero user data |
| **3. Unexpected Same-Origin Requests** | `connect-src 'self'` permits same-origin requests; does NOT prevent browser code from dispatching sensitive data to same-origin paths | Must be verified by automated request interception in CP-WEBR-01B |
| **4. Cross-Origin Requests** | Blocked at browser engine level by CSP `default-src 'self'; connect-src 'self'` | Architectural rule; verified via automated browser testing |
| **5. Browser-Side XSS & Malicious Dependencies** | Elimination of `'unsafe-inline'`; script hashes/sources locked to origin | Residual supply-chain risk; must be continuously monitored |
| **6. Observable Request Interception** | Mandatory Playwright `context.route('**/*', ...)` network surveillance | Gate specification locked (`SEC-GATE-01`); implementation targets CP-WEBR-01B |
| **7. Verified Privacy-Test Coverage** | Two-pass egress falsification (Pass 1 nominal, Pass 2 negative control validation) | **BLOCKED** pending execution in Phase CP-WEBR-01B |
| **8. Unmeasured Channels** | Timing side-channels, browser extension interference, speculative DNS prefetch | Unmeasured; explicitly excluded from zero-egress claims |

**Mandatory Verification Gates Preserved for Phase CP-WEBR-01B:**
1. **Automated Two-Pass Egress Falsification (`SEC-GATE-01`):** Must verify that 0 bytes egress during full 10,000-row matching, and prove that test assertions trigger a build failure when route interception is disabled.
2. **Deep Inode & IndexedDB Lifecycle Inspection (`SEC-GATE-02`):** Must inspect `emscripten_filesystem` records across all 5 lifecycle states (T1–T5) to confirm zero patient records remain stored.
3. **No Regulatory Certification Overclaims:** ClinicalPSM is an open-source client utility. It must **never** claim compliance certifications (HIPAA, GDPR, KVKK, HITRUST) prior to formal organizational auditing and executable technical verification.

---

## 6. Scientific Separation Policy & Runtime Diagnostics

### 6.1 Scientific Distinction: Convergence vs. Separation
The R2.1 experiment demonstrated that R's `stats::glm()` stopping criterion is relative deviance reduction:
$$\frac{|D^{(t)} - D^{(t-1)}|}{|D^{(t)}| + 0.1} < 10^{-8}$$

Under complete separation (e.g. `fix_16`), consecutive deviance changes drop below $10^{-8}$ as estimates diverge, causing `glm()` to exit with `converged: true`.

**Normative Distinction of Numerical States:**
1. **Complete Separation:** A linear combination of covariates perfectly predicts the binary outcome. The maximum likelihood estimate does not exist in the parameter space (diverges to $\pm\infty$).
2. **Quasi-Complete Separation:** Covariates perfectly predict outcome for a subset of units, while overlap exists elsewhere. Certain coefficients diverge.
3. **GLM Algorithmic Convergence:** The iterative numerical optimizer satisfied its deviance stopping rule (`converged == TRUE`). Does **not** indicate parameter identifiability or finite bounds.
4. **Large Coefficients / Large Standard Errors:** Heuristic indicators of ill-conditioning, multicollinearity, sparse categories, or separation, but **not** a universal mathematical test. Arbitrary thresholds (such as $|\beta| > 10$ or $SE > 50$) are unvalidated heuristics and are **removed** from normative separation definitions.
5. **Rank Deficiency:** Exact linear dependency among design matrix columns. Identified deterministically by `stats::glm` setting aliased coefficients to `NA`.
6. **Extreme Propensity Scores:** Fitted probabilities within numerical epsilon of boundary values ($p < 10^{-5}$ or $p > 1 - 10^{-5}$).

### 6.2 Reference Mathematical Method: Linear Programming
The scientifically established method for detecting complete and quasi-complete separation prior to or during logistic regression is linear programming (Konis 2007; Kosmidis & Firth 2021, implemented in the `detectseparation` R package). It solves a linear programming feasibility problem to verify whether the convex hulls of the covariate points for $Z=1$ and $Z=0$ are disjoint.

**Current Architectural Status:**
- `SEPARATION_DETECTOR = NOT_IMPLEMENTED`
- `AUTOMATED_SEPARATION_SAFETY = BLOCKED`
- The `detectseparation` package is **not** included in the locked 21-package dependency set and cannot be silently added without formal experimental qualification.
- Firth penalized likelihood regression is **not** implemented and must not be used as an automatic fallback.
- **Handling Policy:** Fixture `fix_16` is retained as an unsafe model classified fail-closed as `OUTPUT_GENERATION_RESTRICTED` based on fixture metadata. General-purpose automatic runtime separation detection remains an open engineering requirement for Phase `CP-STAT-02`.

---

## 7. Implementation-Phase Segmentation Roadmap

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase CP-WEBR-01A: Production Architecture Contract (CURRENT PHASE)     │
│ - Design contracts, scientific schema, security gates, licensing rules  │
│ - Stop Condition: Independent Red Team (ChatGPT) approval               │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase CP-WEBR-01B: Security, Privacy & Falsification Release Gates      │
│ - Implement automated interception-disabled negative control suite     │
│ - Implement deep IndexedDB emscripten_filesystem lifecycle inspection   │
│ - Stop Condition: Zero data leakage across all storage and network      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase CP-WEBR-02: Dedicated Worker WebR Engine Integration              │
│ - Implement worker.ts and WebR pipeline in apps/web                     │
│ - Wire verified WebR RObject parameter binding protocol                │
│ - Stop Condition: 25 synthetic fixtures match native R golden results   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase CP-STAT-02: Scientific Separation & Golden Test Expansion         │
│ - Investigate/qualify LP-based separation detector (detectseparation)   │
│ - Validate against 50+ diverse clinical synthetic fixtures             │
│ - Stop Condition: 100% semantic and numerical tolerance parity          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase CP-PUB-01: Canonical Publication Artifact Generation              │
│ - Generate DOCX Table 1, Love plot SVG, matched CSV, and R script       │
│ - Validate independent native R reproduction of generated R scripts     │
│ - Stop Condition: Exact numerical reproduction in native desktop R      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase CP-RELEASE: Cross-Browser, Security & Legal Final Clearance       │
│ - Multi-browser CI qualification (Chromium, Firefox, WebKit, Safari)    │
│ - Formal IP legal review of GPL binary redistribution & frontend IP     │
│ - Stop Condition: Production deployment authorized                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Architectural Alternatives Considered & Rejected

| Candidate Architecture | Description | Rejection Rationale |
| :--- | :--- | :--- |
| **Pure TypeScript Engine** (`clinicalpsm/src/lib/psm/`) | Custom TypeScript reimplementation of IRLS, MatchIt nearest-neighbor matching, and cobalt balance. | **REJECTED:** Classified as UNVALIDATED. Custom statistical algorithms risk mathematical divergence and lack clinical peer-review authority. |
| **Remote Server-Side R Execution** (Containerized R API) | Next.js API route or Dockerized R container executing MatchIt on remote server. | **REJECTED:** Violates core zero-trust, local-first clinical privacy requirement. Transmitting patient rows across the network triggers strict HIPAA/GDPR cloud data liability. |
| **Main-Thread WebR Execution** | Running WebR directly in the browser Window context without a Web Worker. | **REJECTED:** Blocks the browser main event loop during package compilation and model fitting (causing UI freeze). Precludes clean memory reclamation and instant worker termination. |
| **Arbitrary Separation Thresholds** | Declaring $|\beta| > 10$ or $SE > 50$ as definitive complete separation. | **REJECTED:** Unvalidated heuristic; risks false positives in legitimately large clinical effects or sparse binary categories; rejected by Independent Red Team. |
| **Automated Firth Fallback** | Automatically falling back to `logistf` upon detecting separation. | **REJECTED:** Alters the target estimand and penalty structure without user consent; requires unverified Wasm packages. |
