# CP-WEBR-01A R1.1 — Final Architecture Contract Consistency Closure Audit

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Required Branch:** `development`
**Required Baseline SHA:** `e5c24b71ea0ac29a0993c2dfd7991490b480c01b`
**Independent Red Team Verdict:** `ARCHITECTURE_CONTRACT_BLOCKED — TARGETED R1.1 REQUIRED`
**Audit Purpose:** Comprehensive closure of all remaining demonstrable contradictions and overclaims in the CP-WEBR-01A architecture contracts. Strictly documentation-only remediation.

---

## 1. Executive Summary & Audit Baseline

In accordance with directives from the Independent Red Team, Phase `CP-WEBR-01A R1.1` performs a targeted, documentation-only remediation across the ClinicalPSM architecture contracts. This phase strictly adheres to the following hard boundaries:
- **Zero Production Application Code Changes:** Only documents under `docs/` have been updated. No files under `clinicalpsm/src/`, `apps/`, or root package files have been modified.
- **Preserved Engine Architecture:** Retains the single-engine WebR 0.6.0 (Wasm R 4.6.0), `MatchIt` 4.8.1, and `cobalt` 5.0.0 architecture.
- **No Early Production Deployments:** Cloudflare Workers Static Assets deployment, DNS changes, commercial payments, or patient data processing remain blocked.
- **Honest Defect Retraction:** Prior R1 claims regarding shallow `Object.freeze()` immutability, abbreviated SPDX lock inferences, restrictive column regexes, and unconditional zero-egress guarantees are formally retracted and replaced with verified, implementable technical contracts.

---

## 2. Exact Document Changes & Old vs. Corrected Assertions

| Document | Section | Old Defective / Overclaimed Assertion | Corrected R1.1 Contract Assertion | Primary Source Authority |
| :--- | :--- | :--- | :--- | :--- |
| `docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md` | §4.4 | Result snapshot frozen with `Object.freeze()`. Claimed deep immutability. | **Defensive Copy Boundary Pattern:** Structured Clone (`postMessage`) transfers unshared JSON-serializable primitives (`number[]`); internal TypedArrays are unshared; encapsulated read-only store; versioned serialization envelope (`1.1.0`); SHA-256 fingerprint verification; clean worker disposal via `webR.destroy()`. Shallow `Object.freeze()` explicitly rejected as deep immutability. | MDN Structured Clone; W3C Web Workers API; ECMAScript 2024 TypedArray Specification |
| `docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md` | §4.2 | Inconsistent with security contract; unclear structural limits. | **Unified Ingestion & Reversible Symbol Mapping:** Accepts original clinical headers (max 256 Unicode characters, UTF-8, NFC normalized, unique, case-sensitive); never imposes R variable regex on categorical values; maps to internal safe aliases (`cov_01`, `trt_01`); collision detection (`cov_01a`); zero string interpolation. | Unicode Standard Annex #15 (NFC); R Language Definition §1.8 |
| `docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md` | §4.3 | WebR 0.6.0 TypeScript example presented without execution qualification. | **API Distinction:** Distinguishes source-level TypeScript API availability (`REnvironment`, `bind`, `evalR`) from proven runtime execution. Mandatory runnable smoke test required in Phase `CP-WEBR-01B` before production integration. | WebR v0.6.0 TypeScript Definitions (`webr-main.d.ts`) |
| `docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md` | §5.3 | Zero-egress guaranteed because Cloudflare hosts only static assets and zero API routes. | **Egress Threat Classification:** Zero-egress is an **architectural objective** subject to automated two-pass verification (`SEC-GATE-01`). Categorizes 8 explicit network channels (intentional uploads, runtime downloads, unexpected same-origin requests, cross-origin requests, XSS, request interception, verified test coverage, unmeasured channels). Prohibits pre-implementation zero-residue and regulatory claims. | W3C CSP Level 3; RFC 6454 (The Web Origin Concept) |
| `docs/security/CP-WEBR-01-SECURITY-AND-PRIVACY-GATES.md` | §3.1, §4.3 | Strict lexical allowlist regex `^[a-zA-Z_][a-zA-Z0-9._]{0,63}$` rejected original clinical headers and factor values. | **Strict Prohibition of R Regex on Clinical Data:** Original headers and categorical cell values undergo structural safety checks only (size, UTF-8, uniqueness). Safe internal aliases (`cov_01`) are used in R code; categorical cell values passed as R string vectors via `webR.RCharacter()`. | R Language Definition (Formula & Factor Semantics) |
| `docs/security/CP-WEBR-01-SECURITY-AND-PRIVACY-GATES.md` | §4.2, §5 | Ambiguous memory erasing and zero-residue guarantees; Gate 3 named "Lexical Allowlist". | **Realistic Privacy Boundaries:** Formal HIPAA/GDPR certifications explicitly prohibited; RAM wiping disclaimer enforced; `SEC-GATE-03` renamed to "R Injection Prevention & Structural Parameterization Gate". Two-pass falsification (`SEC-GATE-01`) and deep IndexedDB record inspection (`SEC-GATE-02`) preserved. | HIPAA Privacy Rule (45 CFR §164.514); Chromium V8 Memory Architecture |
| `docs/architecture/CP-WEBR-01-LICENSING-AND-DISTRIBUTION.md` | §2.1, §2.2 | WebR runtime core labeled `GPL-2.0-or-later`. CRAN packages labeled `GPL-2.0-only` based on lockfile label. | **Verified Complete SBOM & License Separation:** WebR compiled distribution binaries (`R.wasm`, `webr.mjs`) verified as **GPL-3.0**; npm client verified as **MIT** ([LICENSE.md v0.6.0](https://github.com/r-wasm/webr/blob/v0.6.0/LICENSE.md)). Exact 21 packages reconciled against lockfile with exact SHA-256 hashes and byte counts; CRAN declared licenses `GPL (>= 2)` separated from shorthand `"GPL-2"` lockfile label. | WebR v0.6.0 LICENSE.md; Upstream CRAN Package DESCRIPTION files |
| `docs/science/CP-WEBR-01-CANONICAL-RESULT-CONTRACT.md` | §2.2, §2.3 | Rubin B/R lacked propensity score scale, unit conversions, and zero-denominator handling. | **Source-Backed Rubin (2001) Definitions:** Scale explicitly identified as **linear logit scale** ($lp = \text{logit}(e_i)$); Rubin's B stored as dimensionless proportion (e.g. 0.25 SD); conversion to percentage ($0.25 \times 100\% = 25\%$) required before threshold evaluation; Rubin's R variance ratio on linear logit scale with `null` on zero denominator; both metrics strictly informational. | Rubin DB (2001), *Health Services & Outcomes Research Methodology*, 2(3-4): 169–188 |
| `docs/science/CP-WEBR-01-CANONICAL-RESULT-CONTRACT.md` | §2.2, §4 | cobalt asserted to produce all Table 1 summaries; mandatory number fields caused `NaN`/`Infinity`. | **Authoritative Producer Mapping & Schema Nullability:** Table 1 descriptive statistics ($n, \%$, medians, IQRs, means, SDs) produced by base R sample aggregations (`stats::aggregate`, `base::table`), NOT `cobalt::bal.tab()` alone; all numeric diagnostic fields nullable (`number | null`); authoritative R producer documented for every numerical field. | cobalt v5.0.0 Manual; Austin PC (2009), *Statistics in Medicine* |
| `docs/science/CP-WEBR-01-CANONICAL-RESULT-CONTRACT.md` | §4 | Publication status verdict `PUBLICATION_ELIGIBLE` claimed. | **Technical Output-Readiness State Machine:** Replaced with `OUTPUT_READY`, `OUTPUT_GENERATION_RESTRICTED`, and `COMPUTATION_FAILED`. Explicit disclaimer: `OUTPUT_READY` is a technical readiness indicator only; does not certify journal acceptance, clinical validity, or causal inference. | ClinicalPSM Scientific Governance Specification |
| `docs/audits/CP-WEBR-01A-R1-CORRECTION-LEDGER.md` | CORR-003 to CORR-007 | Prior ledger claimed R1 corrections were fully complete. | **Honest Ledger Correction:** Explicitly marked CORR-003, CORR-004, CORR-005, CORR-006, and CORR-007 as `INCOMPLETE / DEFICIENT IN R1` and documented their complete resolution in `R1.1`. | Independent Red Team Audit Mandate |

---

## 3. Primary Source References

1. **WebR Open Source Project:**
   - Posit PBC & R Core Team. WebR Version 0.6.0 Release & Licensing Specification.
   - [Official WebR v0.6.0 LICENSE.md](https://github.com/r-wasm/webr/blob/v0.6.0/LICENSE.md). Confirms: compiled WebAssembly distribution binaries are licensed under **GNU GPL v3**; client TypeScript library is licensed under **MIT**.
   - TypeScript definitions: `webr@0.6.0` (`webr-main.d.ts`, `robj-main.d.ts`).
2. **Propensity Score & Causal Inference Literature:**
   - **Rubin DB (2001).** Using Propensity Scores to Help Design Observational Studies: Application to the Tobacco Litigation. *Health Services & Outcomes Research Methodology*, 2(3-4): 169–188. Defines Rubin's B on linear logit scale with pooled standard deviation denominator and percentage scale; defines Rubin's R as variance ratio on linear logit scale.
   - **Austin PC (2009).** Balance diagnostics for comparing the distribution of baseline covariates between treatment groups in propensity-score matched samples. *Statistics in Medicine*, 28(25): 3083–3107. Establishes raw prevalence difference vs. standardized difference for binary covariates.
   - **Stuart EA (2010).** Matching methods for causal inference: A review and a look forward. *Statistical Science*, 25(1): 1–21. Prohibits post-match variance pooling in continuous SMD denominator.
   - **Imai K, King G, Stuart EA (2008).** Misunderstandings between experimentalists and observationalists about causal inference. *Journal of the Royal Statistical Society: Series A*, 171(2): 481–502. Prohibits hypothesis test p-values in balance tables.
3. **Statistical Package Reference Manuals:**
   - Ho DE, Imai K, King G, Stuart EA. `MatchIt: Nonparametric Preprocessing for Parametric Causal Inference`. Version 4.8.1.
   - Greifer N. `cobalt: Covariate Balance Tables and Plots`. Version 5.0.0.
4. **Web Security & Architecture Standards:**
   - W3C Content Security Policy Level 3 Recommendation.
   - W3C HTML Living Standard: Structured Cloning Algorithm.
   - Free Software Foundation. GNU General Public License v2 & v3 Frequently Asked Questions.

---

## 4. Cross-Document Consistency Matrix

| Architectural Dimension | Production Architecture (`CP-WEBR-01`) | Security & Privacy (`CP-WEBR-01`) | Scientific Data Model (`CP-WEBR-01`) | Licensing & SBOM (`CP-WEBR-01`) | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Immutability Contract** | §4.4: Defensive-copy Structured Clone boundary; standard primitive arrays (`number[]`); encapsulated read-only store; versioned serialization envelope (`1.1.0`); SHA-256 fingerprint | §4.1: Ephemeral memory; no persistent storage; defensive unshared copy | §4: Read-only canonical snapshot; all publication artifacts derive from single canonical snapshot; `Object.freeze()` claim retracted | Aligned | **CONSISTENT** |
| **Identifier Handling** | §4.2: Max 256 code points, UTF-8, NFC normalized, unique, case-sensitive; categorical values never regex-filtered; reversible alias mapping (`cov_01`) | §3.1, §4.3: Strict prohibition of R regex on original headers or categorical values; lossless bidirectional mapping table | §4: `factorConfiguration` records exact `originalHeader`, `internalAlias`, and `displayName` | Aligned | **CONSISTENT** |
| **Zero-Egress Threat Model** | §5.3: Objective conditional on executable CI evidence; 8 network channels categorized; no pre-implementation zero-residue or regulatory claims | §2.1, §4.2, §5: Two-pass falsification test (`SEC-GATE-01`); deep IndexedDB inspection (`SEC-GATE-02`); regulatory disclaimer | §1.1: Blinded outcome variables; zero external communication | Aligned | **CONSISTENT** |
| **WebR Licensing & SBOM** | §5.1: 21 pre-compiled package archives served from local `/assets/repo/`; WebR core binaries served from `/assets/webr/` | §1: Zero third-party CDN egress; all assets local static files | §3: 21 packages locked to exact versions and SHA-256 digests in toolchain provenance | §2.1, §2.2: Complete inventory matching lockfile; WebR binary GPLv3 vs client MIT separated; `PRODUCTION_LICENSING_CLEARANCE = BLOCKED` | **CONSISTENT** |
| **Rubin Diagnostics** | Aligned with canonical scientific data model | Aligned | §2.3, §4: Linear logit scale; proportion vs percentage conversion; zero-denominator `null` handling; informational only | Aligned | **CONSISTENT** |
| **Output Readiness State** | §3: Component inventory reflects technical readiness | §5: Security gate clearance prerequisites | §3.2, §4: `OUTPUT_READY`, `OUTPUT_GENERATION_RESTRICTED`, `COMPUTATION_FAILED`; no journal/causal validity overclaims | Aligned | **CONSISTENT** |

---

## 5. Full Dependency Lock Consistency Result

Authoritative Source File: `experiments/cp-webr-00b/dependency-lock.json`
Generated At: `2026-10-19T00:55:00Z`
Total Packages: **21**
Total Download Bytes: **25,055,047 bytes** (~23.89 MiB)

| Index | Package | Locked Version | CRAN Declared License | Lockfile Label | SHA-256 Digest (Exact Verification) | File Size (Bytes) | Verification Status |
| :---: | :--- | :---: | :--- | :---: | :--- | :---: | :---: |
| 1 | `rlang` | 1.3.0 | MIT | MIT | `c5562dc07b5d3c62fb85ee856a670b83105ba7793c778a30c1d9512d914e208a` | 1,140,560 | **MATCH** |
| 2 | `cli` | 3.6.6 | MIT | MIT | `efa9c2b12c2da09cccb0a27d2e7a079ebd4c38fc1d03560d599f7634eb7f9932` | 967,089 | **MATCH** |
| 3 | `arg` | 0.2.1 | GPL (>= 2) | GPL-2 | `e0c585a046a225787c205990a5e69058a08d40731034494559b9cc5c06125955` | 207,515 | **MATCH** |
| 4 | `Rcpp` | 1.1.2 | GPL (>= 2) | GPL-2 | `87746dcb2b15bb70f944a9585287d5e2876fc7dcb120473d2cb27b9a2ed410b4` | 2,087,828 | **MATCH** |
| 5 | `glue` | 1.8.1 | MIT | MIT | `3b025aa5fd067ad9b87fecd219e561d4537d488b33581af8beabe2b06024d44d` | 152,905 | **MATCH** |
| 6 | `lifecycle` | 1.0.5 | MIT | MIT | `c2f8c5905f58b4526c3b68c6163f891b9a12f81d7e50347ad49a70b1f6592527` | 102,893 | **MATCH** |
| 7 | `gtable` | 0.3.6 | MIT | MIT | `dae6408ed2ed1d759e50c5fb7e45f81348ff3f4f914cb418ac12bdeaae2ee80b` | 184,798 | **MATCH** |
| 8 | `isoband` | 0.3.0 | MIT | MIT | `bc7494f286084e8861331256df0f6ab27e519e1797e807ec100db1116d3e7a8e` | 1,627,614 | **MATCH** |
| 9 | `S7` | 0.2.2 | MIT | MIT | `76b7d1dcbab977c592a2d951a07336f509243c34fa0d56f6c2c56f2b71c3aec4` | 225,283 | **MATCH** |
| 10 | `farver` | 2.1.2 | MIT | MIT | `f7555f2c1926f88d431ff1919c81cff48ff6eadc09de4471610312695be6cea8` | 1,317,442 | **MATCH** |
| 11 | `labeling` | 0.4.3 | MIT | MIT | `1d89f92c8b15aee3b4f9c8c6c0e7697f79c515558c274279fddfd03a34a6d63d` | 42,861 | **MATCH** |
| 12 | `R6` | 2.6.1 | MIT | MIT | `134d30277b1c64afe9ae31a4a52857822bc21d32db46479eb3ea2f3a7397c8d6` | 67,949 | **MATCH** |
| 13 | `RColorBrewer` | 1.1-3 | Apache-2.0 | Apache-2.0 | `cf5564fee1b54d547dd5656afbea17e34d48f74ef97b376e495dd4e223ecafc9` | 26,996 | **MATCH** |
| 14 | `viridisLite` | 0.4.3 | MIT | MIT | `cbb327d9e0efe61bfa40ba89c9af3dc05fc5bd76ea69fc485ef3f64fe1785983` | 1,295,884 | **MATCH** |
| 15 | `scales` | 1.4.0 | MIT | MIT | `1e3fd9c44c6bba3ea2911ee8a2ee9a8cf5a47013a2ca6db8862cb10a1512ba96` | 620,880 | **MATCH** |
| 16 | `vctrs` | 0.7.3 | MIT | MIT | `42cc19d325e7de2160490273d97099049f261e8b6c3e6736391d96e43923798d` | 1,433,335 | **MATCH** |
| 17 | `withr` | 3.0.3 | MIT | MIT | `65530833ac1e34d41a8e991aab69713aae1a24500af11257b637256af7cc2195` | 185,986 | **MATCH** |
| 18 | `ggplot2` | 4.0.3 | MIT | MIT | `1a299608d88c92d5741666229c1125848e4c210b0624ebd0012af97957976ae6` | 7,481,119 | **MATCH** |
| 19 | `gridExtra` | 2.3.1 | GPL (>= 2) | GPL-2 | `d9421e0fd97f89d1893d770fdca2fb9ac5c4a9ac71a762f6776f1b518aaba048` | 504,576 | **MATCH** |
| 20 | `MatchIt` | 4.8.1 | GPL (>= 2) | GPL-2 | `ef2f1439b64037e0acdcfd7699ba641765d5dd16bd46cad0dd13c58305b9b6dc` | 1,573,147 | **MATCH** |
| 21 | `cobalt` | 5.0.0 | GPL (>= 2) | GPL-2 | `b63bfabf563304dfe7ffafd4c21e9b580b817c5d0df155d390fc6c42440b0218` | 2,616,764 | **MATCH** |

**Gate Status Verification:**
- `R_PACKAGE_LOCK_ALIGNMENT` = **`PASS`** (All 21 packages verified).
- `FULL_DISTRIBUTION_SBOM` = **`PASS`** (Component inventory matches actual artifacts, hashes, and verified WebR v0.6.0 LICENSE.md evidence).

---

## 6. Open Implementation-Stage Validation Requirements (Phase CP-WEBR-01B)

The following requirements remain design-complete but blocked for runtime implementation in Phase `CP-WEBR-01B`:
1. **Isolated Runnable Smoke Test of WebR 0.6.0 Object Binding:**
   - Execute an isolated, automated Playwright/Node test validating: `new webR.REnvironment()` → `env.bind()` with `RInteger`, `RDouble`, `RCharacter` → `MatchIt::matchit()` model fitting.
   - Prove end-to-end execution without string interpolation before production UI integration.
2. **Automated Two-Pass Zero-Egress Falsification Suite (`SEC-GATE-01`):**
   - **Pass 1:** Full 10,000-row matching analysis with `context.route('**/*', ...)` interception verifying 0 bytes egressed to external origins.
   - **Pass 2 (Falsification):** Route interception disabled; sentinel request must be received by mock server and trigger a deliberate test failure, proving the monitoring apparatus is capable of failing.
3. **Deep Inode & Record Lifecycle Inspection (`SEC-GATE-02`):**
   - Comprehensive iteration of `emscripten_filesystem` IndexedDB object stores across checkpoints T1–T5 to confirm zero patient records or sentinels survive worker termination.
4. **Automated R Injection Prevention Test Suite (`SEC-GATE-03`):**
   - 20 mutation attack vectors (semicolons, backticks, quotes, `system()`, `file()`) executed to confirm parameterization safely isolates all input.
5. **Runtime Separation Detector (`CP-STAT-02`):**
   - Implement general-purpose detector evaluating boundary probabilities, coefficient SE scale, and IRLS divergence; independently validate across the 25 golden fixtures.

---

## 7. Remaining Privacy & Licensing Blockers

| Blocker ID | Domain | Current State | Release Condition |
| :--- | :--- | :--- | :--- |
| **`PRODUCTION_LICENSING_CLEARANCE`** | Open Source IP Law | **`BLOCKED`** | Mandatory review and formal approval by qualified intellectual property legal counsel before commercial release or production deployment. No commercial distribution clearance may be claimed by engineering. |
| **`AUTOMATED_SEPARATION_SAFETY`** | Statistical Integrity | **`BLOCKED`** | General-purpose runtime separation detector must be implemented and pass 25 golden fixture tests in Phase `CP-STAT-02`. |
| **`REGULATORY_PRIVACY_CERTIFICATION`** | Privacy & Compliance | **`BLOCKED / PROHIBITED`** | Software must never claim HIPAA, GDPR, KVKK, or HITRUST certifications. ClinicalPSM is an open-source client utility; organizational compliance remains the responsibility of the clinical institution. |

---

## 8. Final Disposition

**Phase Outcome:** `CP-WEBR-01A R1.1 ARCHITECTURE CONTRACT CONSISTENCY REMEDIATION COMPLETE`
**Application Code Modified:** None (Zero production changes).
**Next Required Action:** Await Independent Red Team (ChatGPT) review and formal gate clearance.
