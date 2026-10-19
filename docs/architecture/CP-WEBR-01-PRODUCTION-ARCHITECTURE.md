# CP-WEBR-01 — Production Architecture Contract

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Phase:** `CP-WEBR-01A — Architecture Contract`
**Governing Authority:** Independent Red Team (ChatGPT)
**Status:** Normative Architecture Contract (Design-Only — Not Authorized for Production Code Integration)
**Target Runtime:** Cloudflare Workers Static Assets (`apps/web`)
**Statistical Engine:** WebR 0.6.0 (R 4.6.0 Wasm) + MatchIt 4.8.1 + cobalt 5.0.0

---

## 1. Executive Architecture Summary

### 1.1 Purpose
This document establishes the authoritative production architecture for ClinicalPSM. It translates the empirical findings of experimental qualification (`CP-WEBR-00B R2.1`) into an implementation-ready contract for a browser-local, zero-egress clinical propensity score matching application.

### 1.2 Core Architectural Principle: Single Authoritative Computation Layer
The statistical computing architecture is strictly hierarchical:

```
┌────────────────────────────────────────────────────────┐
│             TypeScript UI & Orchestration              │
│  - Input validation & dataset ingestion                │
│  - Parameter configuration & factor role assignment    │
│  - Worker lifecycle management & progress display      │
│  - Canonical result presentation & export formatting   │
└──────────────────────────┬─────────────────────────────┘
                           │ Typed JSON Task (Structured Clone)
                           ▼
┌────────────────────────────────────────────────────────┐
│          Dedicated Application Worker (worker.ts)      │
│  - WebR runtime coordination & package mounting        │
│  - Secure template execution (No code interpolation)   │
│  - Error interception, diagnostics & fail-closed policy│
└──────────────────────────┬─────────────────────────────┘
                           │ Virtual Filesystem / Typed Buffers
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
| **UI Orchestrator** | Main Thread (`Window`) | - File parsing (CSV -> Schema)<br>- Pretreatment/treatment/outcome role selection<br>- Form validation & user alerts<br>- Rendering balance tables & Love plots<br>- DOCX, CSV, SVG publication downloads | - Zero statistical computation<br>- No direct WebR manipulation<br>- Cannot alter result snapshots |
| **Dedicated Application Worker** | Web Worker (`DedicatedWorkerGlobalScope`) | - Lazy initialization of WebR<br>- Pre-compiled package archive mounting<br>- Safe parameter injection via structured templates<br>- Extraction of canonical results<br>- Interruption & termination lifecycle | - Isolated from DOM and storage<br>- Single-job execution queue<br>- No external network connectivity |
| **WebR Runtime Worker** | Internal Worker (`webr-worker.js`) | - Emscripten Wasm execution environment<br>- R virtual filesystem (`emscripten_filesystem`)<br>- Dynamic library linking (`libRblas.so`, `libRlapack.so`) | - Managed exclusively via WebR API<br>- Sandboxed execution |
| **Official R Packages** | Wasm R Libraries (`/repo/`) | - `MatchIt` 4.8.1: greedy 1:1 matching without replacement<br>- `cobalt` 5.0.0: ATT covariate balance tables<br>- 19 pinned transitive dependencies | - Pure CRAN binaries compiled for Wasm R 4.6.0<br>- Zero custom algorithm modifications |
| **Canonical Result Store** | Immutable Memory Object | - Cryptographically fingerprinted analysis snapshot<br>- Complete matched-pair ledger<br>- Provenance metadata and diagnostic warnings | - Frozen via `Object.freeze()`<br>- All export generators must reference this snapshot |

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
7. **`RECOVERABLE_ERROR`:** Job failed due to data-specific error (e.g. non-convergence, missing data, rank deficiency) or interrupted execution. Worker instance terminates (`worker.terminate()`); main thread prepares fresh replacement worker.
8. **`BLOCKED`:** Fatal environment failure (e.g. WebAssembly unsupported, SharedArrayBuffer disabled without fallback, network download failure for static assets). Execution halts with clear user advisory.

### 3.3 Concurrency & Multi-Tab Resource Governance
- **Single-Job Concurrency:** Each worker processes exactly one job at a time. Concurrent requests on the same tab are queued or rejected.
- **Worker Interruption Protocol:**
  - User clicks "Cancel Analysis": UI dispatches `{ type: 'INTERRUPT' }`.
  - Worker calls `webr.interrupt()`. Measured cessation latency in Chromium: **1.59 ms**.
  - If the worker does not acknowledge cessation within 2.0 seconds, UI executes `worker.terminate()`. Measured termination request latency: **0.04 ms**.
- **Demonstrated Recovery:**
  - Upon hard termination, all pending promises reject with `OperationCancelledError`.
  - UI instantiates a fresh worker (`0.08 ms`), re-mounts pinned packages (`2,225 ms`), and confirms operational readiness via statistical benchmark (`91.25 ms`).
- **Multi-Tab Memory Controls:**
  - Each browser tab spawns its own Dedicated Worker and private WebR instance.
  - Tab close or navigation immediately destroys the worker and initiates browser garbage collection.
  - **Critical Provenance Disclosure:** Calling `worker.terminate()` drops user-space JavaScript references, but immediate operating system RAM reclamation is controlled by the browser engine's internal garbage collection. User-space code cannot force synchronous OS memory release (`wasm_linear_memory = UNMEASURED`).

---

## 4. Secure Data Ingestion & Injection Prevention Architecture

### 4.1 Vulnerability Elimination: No String Interpolation
In experimental prototypes, R scripts were generated via JavaScript template strings (e.g., `evalR(\`matchit(\${formula}, data = df)\`)`). This pattern is strictly prohibited in production. User-provided CSV headers or factor levels containing backticks, quotes, or semicolons could inject arbitrary R commands.

### 4.2 Production Secure Parameter Binding Protocol
The production architecture implements a four-stage trust boundary:

```
[ Raw CSV Input ]
       │
       ▼
[ Stage 1: Strict Lexical Sanitizer ]
  - Column name regex: ^[a-zA-Z_][a-zA-Z0-9._]{0,63}$
  - Disallow all R reserved keywords (if, else, repeat, function, TRUE, FALSE, NA, Inf, etc.)
  - Reject duplicate, empty, or whitespace-only headers
       │
       ▼
[ Stage 2: Typed Structural Transfer ]
  - Cleaned tabular data passed to worker as structured typed columns:
    {
      treatment: Uint8Array,
      covariates: Record<string, Float64Array | Int32Array>,
      categories: Record<string, string[]>,
      rowIds: string[]
    }
  - Transferred via postMessage Transferable objects (ArrayBuffers) with zero string serialization
       │
       ▼
[ Stage 3: Trusted R Script Template ]
  - Pre-compiled, immutable R script template loaded from static assets
  - Receives parameters strictly through WebR object bindings:
    `webr.objs.setData('input_payload', payload)`
  - Internal R code constructs data frame programmatically:
    `df <- as.data.frame(lapply(input_payload$covariates, identity))`
    `formula_obj <- stats::reformulate(termlabels = valid_covariates, response = valid_treatment)`
       │
       ▼
[ Stage 4: Sandboxed Execution & Schema Validation ]
  - Formula evaluated in isolated R environment: `new.env(parent = emptyenv())`
  - Zero dynamic `eval(parse(text = ...))` allowed
```

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
To enable WebAssembly multi-threading, dynamic linking, and shared memory, the following security headers must be configured in `_headers` or worker responses:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self';
```

#### Detailed CSP Threat Model & Disclosure: `'unsafe-eval'`
1. **Technical Root Cause:** WebR requires dynamic linking for R shared object libraries (`libRlapack.so`, `libRblas.so`). Emscripten's dynamic linker uses `Function()` constructor bindings to compile address stubs (`ASM_CONSTS`) at runtime. Without `'unsafe-eval'`, dynamic linking fails and R aborts.
2. **Threat Assessment:** `'unsafe-eval'` allows runtime execution of strings as code in the JavaScript execution context.
3. **Mitigations Enforced:**
   - `'unsafe-inline'` is **completely eliminated** from all script and style directives.
   - Strict Input Sanitization (Section 4) prevents user-controlled data from reaching any code evaluation context.
   - External network connections are restricted strictly to `'self'` (`connect-src 'self'`), preventing unauthorized data exfiltration even in the event of XSS.
   - Worker scripts are constrained to `'self' blob:`.
4. **Architectural Disclosure:** A Dedicated Web Worker does **not** provide complete CSP isolation from the main thread in all browser engines. The production application acknowledges this limitation and relies on defense-in-depth: zero-egress network policies, strict input validation, and lack of external network capabilities.

---

## 6. Scientific Fail-Closed Policy & Runtime Diagnostics

### 6.1 Complete Separation & Convergence Policy
As empirically documented in `CP-WEBR-00B R2.1`, R's `glm()` optimization terminates with `converged: true` under complete separation because consecutive deviance differences drop below $10^{-8}$. However, the estimated coefficients diverge toward $\pm\infty$ with astronomical standard errors ($SE > 39,000$).

**Governing Production Rules:**
1. **Algorithmic vs. Scientific Convergence:** Algorithmic convergence (`converged == TRUE`) must **never** be presented as proof that complete or quasi-complete separation is absent.
2. **Diagnostic Separation Thresholds:** If any estimated coefficient satisfies $|\beta_j| > 10.0$ or $SE(\beta_j) > 50.0$, the result is flagged as `QUASI_COMPLETE_SEPARATION`.
3. **Publication Eligibility Gate:** Analyses flagged with complete or quasi-complete separation are designated **`REJECT_FOR_PUBLICATION`**. They may be reviewed in a diagnostic tab with explanatory guidance, but publication exports (DOCX Table 1, Methods draft, reproduction script) are **disabled**.
4. **No Automated Firth Fallback:** The application must **not** automatically substitute Firth penalized logistic regression or alternative matching algorithms without explicit, independent validation and user consent. If the standard model fails, the application fails closed.
5. **No Universal Balance Threshold:** The application must **never** assert that Standardized Mean Difference (SMD) $< 0.10$ "proves" balance or causal validity. All balance metrics must be accompanied by neutral methodological reference guidelines.

---

## 7. Implementation-Phase Segmentation Roadmap

The path from architecture contract to production release is partitioned into strictly bounded, sequential phases:

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
│ - Wire secure parameter binding protocol (zero string interpolation)    │
│ - Stop Condition: 25 synthetic fixtures match native R golden results   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase CP-STAT-02: Independent Scientific Golden Test Suite              │
│ - Implement runtime separation & collinearity diagnostic detectors      │
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
| **Pure TypeScript Engine** (`clinicalpsm/src/lib/psm/`) | Custom TypeScript reimplementation of IRLS, MatchIt nearest-neighbor matching, and cobalt balance. | **REJECTED:** Remains classified as UNVALIDATED. Custom statistical algorithms risk mathematical divergence, lack peer-reviewed clinical authority, and create unmaintainable duplicate code. |
| **Remote Server-Side R Execution** (Containerized R API) | Next.js API route or Dockerized R container executing MatchIt on remote server. | **REJECTED:** Violates core zero-trust, local-first clinical privacy requirement. Transmitting patient rows across the network triggers strict HIPAA/GDPR business associate agreements and cloud data liability. |
| **Main-Thread WebR Execution** | Running WebR directly in the browser Window context without a Web Worker. | **REJECTED:** Blocks the browser main event loop during package compilation and model fitting (causing UI freeze). Precludes clean memory reclamation and instant worker termination. |
| **Automated Firth Fallback** | Automatically falling back to `logistf` (Firth's penalized likelihood) upon detecting separation. | **REJECTED:** Firth regression alters the target estimand and penalty structure without user consent; requires additional unverified Wasm packages; must not be automated without explicit clinical researcher opt-in. |
