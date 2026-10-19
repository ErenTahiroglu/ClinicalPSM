# CP-WEBR-01 — Production Architecture Contract

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Phase:** `CP-WEBR-01A R1 — Architecture Contract Correction`
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
| **Canonical Result Store** | Immutable Memory Object | - Cryptographically fingerprinted analysis snapshot<br>- Complete matched-pair ledger<br>- Provenance metadata and diagnostic warnings | - Validated snapshot with defensive copies<br>- All export generators must reference this snapshot |

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

### 4.2 Reversible Bidirectional Symbol Mapping Table
To avoid imposing arbitrary alphanumeric regexes on legitimate clinical data (e.g. column names with spaces, units, hyphens, or Turkish/Unicode characters, or categorical values like `"Stage IV (Metastatic)"`), ClinicalPSM implements an internal symbol mapping table:

```
[ User Input CSV Headers ]
  - "Patient Age (years)"       ──►  Internal Safe Identifier: "cov_01"
  - "HbA1c > 8.0%"              ──►  Internal Safe Identifier: "cov_02"
  - "Treatment Group (0=A,1=B)" ──►  Internal Safe Identifier: "trt_01"
```

1. **Mapping Invariants:**
   - Internal identifiers strictly follow: `^[a-z]+_[0-9]{2,4}$` (guaranteed safe in R formulas without quotes).
   - The symbol dictionary (`Record<string, string>`) is bidirectional and maintained in TypeScript memory.
   - All R formula construction references internal safe identifiers only:
     `stats::reformulate(termlabels = c("cov_01", "cov_02"), response = "trt_01")`
   - When displaying results, generating Table 1, or drafting Methods text, internal identifiers are translated back to original clinical labels.
   - Categorical cell values are preserved as plain strings without lexical mangling; R factor levels are assigned explicitly using string vectors.

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

**Technical Clarifications on Data Representation:**
- **No Zero-Copy Transfer:** Transferring typed arrays from JavaScript to WebR involves memory serialization across the Web Worker communication channel and allocation into the Emscripten WebAssembly heap. It is **not** zero-copy.
- **`Uint8Array` Warning:** WebR represents `Uint8Array` as R `raw` vectors (`RAWSXP`), not integer vectors. Binary treatment indicators must be converted to `Int32Array` (`RInteger`) or `Float64Array` (`RDouble`) prior to binding.
- **Evaluation Environment:** The evaluation environment must inherit from `baseenv()` or `globalenv()`, **not** `emptyenv()`. `emptyenv()` contains zero functions, precluding basic operations like `data.frame()`, `factor()`, and `reformulate()`.

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

#### Detailed CSP Threat Model & Disclosure
1. **`connect-src 'self'` Scope Disclosure:**
   `connect-src 'self'` restricts network connections to the origin server. It **does not** automatically prevent exfiltration to endpoints hosted on the same origin. True client-side zero-egress is guaranteed because Cloudflare Workers Static Assets hosts static files only, with **zero backend API routes or upload endpoints** configured to accept clinical payloads.
2. **`'unsafe-eval'` Threat Assessment:**
   Emscripten dynamic linking for R shared object libraries (`libRlapack.so`, `libRblas.so`) uses `Function()` constructor bindings for `ASM_CONSTS`. Without `'unsafe-eval'`, dynamic library loading fails.
   - Mitigation: `'unsafe-inline'` is completely eliminated. All script tags are local static assets. Parameterized R execution prevents user data from reaching code evaluation contexts.
   - Worker Isolation Limit: A Dedicated Web Worker does not provide complete CSP immunity. The risk of `'unsafe-eval'` is acknowledged as a continuing technical constraint of the Emscripten toolchain.

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
