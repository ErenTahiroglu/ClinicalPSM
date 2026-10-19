# CP-WEBR-01 — Security Architecture & Privacy Release Gates

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Phase:** `CP-WEBR-01A — Security Contract`
**Governing Standard:** Zero-Trust Browser-Local Client Architecture
**Status:** Normative Security Gate Specification (Design-Only — Executable Gates Target Phase CP-WEBR-01B)

---

## 1. Security Threat Model & Defense-in-Depth

### 1.1 Threat Assessment in Browser-Local Clinical Computing
In ClinicalPSM, users process sensitive, de-identified or pseudo-anonymized observational clinical datasets containing patient-level covariates, treatment assignments, and clinical outcomes. The primary security threats and architectural mitigations are:

| Threat Category | Attack Vector | Architectural Countermeasure | Release Gate |
| :--- | :--- | :--- | :---: |
| **Unauthorized Data Egress** | Silent background network exfiltration (beacon, WebSocket, fetch, telemetry) of patient identifiers or covariates. | Complete client-side isolation; strict CSP `connect-src 'self'` (permits same-origin requests only — zero external origins); context-wide route interception in automated tests. | `SEC-GATE-01` |
| **Malicious R Code Injection** | Malicious column names or cell values in CSV files injecting arbitrary R syntax via string interpolation. | Strict lexical allowlist for identifiers; structured typed buffer ingestion; parameterized R templates with zero code interpolation. | `SEC-GATE-03` |
| **Persistent Data Residue** | Unintended retention of patient records in browser storage (`localStorage`, `sessionStorage`, `IndexedDB`, or Cache API). | Ephemeral in-memory execution; deep virtual filesystem lifecycle audits; zero patient data persisted by default. | `SEC-GATE-02` |
| **CSP Bypass & XSS** | Exploitation of required `'unsafe-eval'` CSP directive to execute unauthorized scripts. | Complete elimination of `'unsafe-inline'`; strict script-src and worker-src boundaries; zero external network access. | `SEC-GATE-04` |
| **Cross-Tab & State Bleed** | Concurrent analysis in Tab A leaking memory or patient data into Tab B. | Process isolation via Dedicated Web Workers per tab; private WebR sessions; zero shared global state. | `SEC-GATE-01` |

---

## 2. Resolution of Unresolved R2.1 Experimental Gaps

### 2.1 Gap A: Automated Falsification of Negative Controls
- **Problem Identified in R2.1:** In the R2.1 audit, the assertion `negative_controls_falsification_verified` was recorded as `true` based on code inspection, without an automated test demonstrating that the suite fails when route interception is disabled.
- **Normative Gate Specification (`SEC-GATE-01`):**
  Phase `CP-WEBR-01B` must implement a two-pass automated security test:
  1. **Pass 1 (Interception Active — Nominal Security Test):**
     - The browser context installs request interception (`context.route('**/*', ...)`).
     - Negative Control A dispatches an intentional egress attempt from the main thread (`fetch('/api/intentional-prohibited-leak', { body: SENTINEL_A })`).
     - Negative Control B dispatches an intentional egress attempt from the Dedicated Worker (`fetch('/api/intentional-prohibited-leak', { body: SENTINEL_B })`).
     - Both requests are aborted (`blockedbyclient`).
     - Test passes only if **0 bytes** reach the server and the mock endpoint logs **0 received sentinels**.
  2. **Pass 2 (Interception Inactive — Falsification Control):**
     - A secondary test suite runs **without** client route interception.
     - Negative Controls A and B dispatch their sentinel payloads.
     - The mock HTTP server verifies receipt of the sentinels.
     - The falsification test passes only if the un-intercepted leak triggers an assertion failure in the test suite, proving empirically that the security monitor is capable of failing when an egress occurs.

```
Pass 1: Interception Active
[ Page / Worker ] ──(Sentinel)──► [ Route Interceptor ] ──X (Aborted: 0 bytes to network) ──► PASS

Pass 2: Interception Disabled (Falsification)
[ Page / Worker ] ──(Sentinel)──► [ Mock Server ] ──► (Received Sentinel) ──► Demonstrates Failure ──► PASS
```

---

### 2.2 Gap B: IndexedDB Deep Inode & Record Lifecycle Inspection
- **Problem Identified in R2.1:** The R2.1 audit verified that `localStorage`, `sessionStorage`, `caches`, and `serviceWorker` contained 0 records, and that an IndexedDB database named `emscripten_filesystem` existed. However, individual records inside `emscripten_filesystem` were not comprehensively inspected across browser lifecycle states.
- **Normative Gate Specification (`SEC-GATE-02`):**
  Phase `CP-WEBR-01B` must implement deep binary record inspection of `emscripten_filesystem`:
  1. **Record Inspection Protocol:**
     - Open `emscripten_filesystem` via standard IndexedDB API (`indexedDB.open('emscripten_filesystem')`).
     - Iterate through all object stores (e.g. `FILE_DATA`, `FILES`).
     - Inspect all stored keys, binary blobs, and string contents.
     - Verify with strict regular expressions that **zero patient sentinels**, **zero clinical covariate names**, and **zero CSV rows** are stored in any record.
  2. **Lifecycle State Matrix:**
     The inspection must execute across five distinct lifecycle checkpoints:
     - **T1:** Immediately following successful completion of a matching analysis.
     - **T2:** Immediately following hard worker termination (`worker.terminate()`).
     - **T3:** Following a browser page reload (`page.reload()`).
     - **T4:** In a newly opened browser tab in the same context.
     - **T5:** Following a completely fresh browser context launch.
  3. **Pass Criteria:** At all five checkpoints, stored patient records and sentinels must equal **zero**.

---

## 3. R Injection Prevention Architecture & Parameter Binding

### 3.1 Strict Identifier Lexical Allowlist
User-supplied CSV column names and factor category labels must undergo lexical validation before interacting with the statistical worker:
- **Character Constraint:** `^[a-zA-Z_][a-zA-Z0-9._]{0,63}$`
- **Length Constraint:** Minimum 1 character, maximum 64 characters.
- **Prohibited Tokens (R Reserved Keywords):**
  `if`, `else`, `repeat`, `while`, `function`, `for`, `in`, `next`, `break`, `TRUE`, `FALSE`, `NULL`, `Inf`, `NaN`, `NA`, `NA_integer_`, `NA_real_`, `NA_complex_`, `NA_character_`
- **Handling of Invalid Headers:** Column names failing lexical validation must be rejected at the client ingestion boundary with a clear UI advisory requesting the user rename the column, rather than attempting automated silent escaping.

### 3.2 Parameterized Execution via WebR Object API
To eliminate command injection, the application must never construct executable R strings via JavaScript interpolation:

```typescript
// PROHIBITED VULNERABLE PATTERN (NEVER USE IN PRODUCTION):
await webr.evalR(`df <- read.csv("${filename}"); m <- matchit(${formula}, data = df)`);

// AUTHORIZED SAFE PARAMETER BINDING PATTERN (WebR 0.6.0 REnvironment API):
// 1. Structured dataset passed as typed binary buffers via Transferable postMessage.
// 2. Bound directly into a new R environment using the verified API:
const env = await new webR.REnvironment();
const treatmentRVec = await new webR.RInteger(treatmentValues);
const covMatrixRMat = await new webR.RDouble(covariateMatrix);
await env.bind('clinicalpsm_treatment', treatmentRVec);
await env.bind('clinicalpsm_covariates', covMatrixRMat);

// 3. Execution invokes a pre-compiled, immutable R function template, passing the
//    bound environment — zero user-supplied strings interpolated into R code:
await webR.evalR(`
  result <- clinicalpsm_engine$execute_matching(
    treatment_vec = clinicalpsm_treatment,
    covariate_mat = clinicalpsm_covariates,
    method        = "nearest",
    ratio         = 1L,
    replace       = FALSE,
    m_order       = "largest",
    distance      = "glm",
    link          = "linear.logit",
    caliper       = NULL,
    std.caliper   = TRUE
  )
`, { env });
// NOTE: webr.objs.setData() does NOT exist in WebR 0.6.0.
// The authoritative binding API is new webR.REnvironment() / env.bind() / evalR(..., { env }).
```

---

## 4. Privacy, Compliance & Storage Disclaimers

### 4.1 Ephemeral In-Memory Storage Policy
1. **Zero Cloud Storage:** No patient records, propensity scores, or matching weights are ever uploaded to Cloudflare Workers, Supabase, or any external backend.
2. **Zero Persistent Browser Storage by Default:** Patient datasets exist solely in ephemeral JavaScript and WebAssembly memory during the active browser session.
3. **Optional Project Export:** If users choose to save their analysis, it is exported as an encrypted local file (`.cpsm`) downloaded directly to their local filesystem via the browser's native file picker API.

### 4.3 Symbol Mapping Language Requirements
1. **Reversible Symbol Mapping:** If any column-name sanitization or aliasing is performed (e.g., replacing spaces with underscores to satisfy the `^[a-zA-Z_][a-zA-Z0-9._]{0,63}$` lexical allowlist), the mapping must be **bidirectional and lossless**. The original user-supplied display names must be recoverable and shown in all user-visible outputs (balance tables, exports, method text) without permanent transformation.
2. **No Irreversible Escaping:** Symbol normalization must never permanently overwrite the user's original column name in the stored result snapshot (`CanonicalPsmResult.factorConfiguration`). The original name is preserved; the sanitized name is an internal-only runtime alias.

### 4.2 Realistic Memory & Compliance Disclosures
1. **No Guaranteed Instant RAM Erasure:**
   Calling `worker.terminate()` drops user-space object references, but operating system memory deallocation and RAM overwriting are governed by the browser engine (Chromium V8, Gecko, JavaScriptCore) and the underlying OS memory manager. The software must **never claim guaranteed cryptographic RAM wiping**.
2. **Strict Regulatory Compliance Honesty:**
   - ClinicalPSM is client-side, zero-egress statistical software.
   - The software does **not** store, transmit, or process Protected Health Information (PHI) on servers.
   - However, the software must **never claim formal certification under HIPAA, GDPR, KVKK, or HITRUST**. Such certifications apply to legal entities, covered health systems, and managed cloud environments, not client-side browser open-source utilities. All marketing and technical documentation must accurately state: *"Architecturally designed for zero-egress clinical data privacy; organizational HIPAA/GDPR compliance remains the responsibility of the institutional user."*

---

## 5. Security Release Gates (Phase CP-WEBR-01B Criteria)

Before any WebR code is merged into `apps/web`, the following automated security gates must achieve passing status in CI:

```
┌────────────────────────────────────────────────────────────────────────┐
│ SEC-GATE-01: Zero-Egress Network Isolation & Falsification             │
│ - Pass 1: 0 bytes egressed across 10,000-row online analysis           │
│ - Pass 2: Automated interception-disabled run demonstrably fails test  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ SEC-GATE-02: Local Storage & IndexedDB Cleanliness                     │
│ - Deep inspection of emscripten_filesystem confirms 0 patient records  │
│ - Validated across all 5 lifecycle checkpoints (T1 through T5)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ SEC-GATE-03: R Injection Prevention & Lexical Allowlist                │
│ - 20 automated mutation attack vectors (semicolons, quotes, system())  │
│ - Parameterized template rejects 100% of malicious column payloads     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ SEC-GATE-04: CSP & Header Hardening                                    │
│ - Complete elimination of 'unsafe-inline' verified                     │
│ - COOP same-origin, COEP require-corp, CORP same-origin active         │
│ - 'unsafe-eval' documented in threat model and confined                │
└────────────────────────────────────────────────────────────────────────┘
```
