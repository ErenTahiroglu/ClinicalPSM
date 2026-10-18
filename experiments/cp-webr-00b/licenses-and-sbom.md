# Software Bill of Materials (SBOM) & Licensing Risk Analysis

**Artifact:** `experiments/cp-webr-00b/licenses-and-sbom.md`  
**Phase:** `CP-WEBR-00B`  
**Date:** 19 October 2026  
**Auditor:** Independent Technical & Legal Provenance Assessment  

---

## 1. Component Licensing Inventory

### 1.1 WebR Runtime Core
| Component | Pinned Version | License | Upstream Source Repository | Distribution Obligation |
| :--- | :--- | :--- | :--- | :--- |
| **webR JS Tooling** | `0.6.0` | MIT | `github.com/r-wasm/webr` | Include MIT copyright notice & license. |
| **Embedded R Runtime** | `4.6.0` | GPL-2 \| GPL-3 | `cran.r-project.org/src/base/R-4` | Make corresponding source available upon binary distribution. |
| **libRblas.so** | `4.6.0` | BSD-3-Clause | Reference BLAS | Include BSD notice. |
| **libRlapack.so** | `4.6.0` | BSD-3-Clause | Reference LAPACK | Include BSD notice. |
| **cairo / pixman** | `1.14.12` | LGPL-2.1 / MIT | `cairographics.org` | Allow relinking / dynamic loading; source availability. |
| **pcre2 / zlib** | `10.42 / 1.3` | BSD / zlib | Standard system libs | Permissive notice. |

---

### 1.2 R Packages (Exact 21 Dependency Closure)

| Package | Version | License Category | Upstream License Tag | Commercial Use Permitted? | Source Code Disclosure Required? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MatchIt** | `4.8.1` | **GPL** | `GPL (>= 2)` | YES | **YES (GPL copyleft)** |
| **cobalt** | `5.0.0` | **GPL** | `GPL (>= 2)` | YES | **YES (GPL copyleft)** |
| **Rcpp** | `1.1.2` | **GPL** | `GPL (>= 2)` | YES | **YES (GPL copyleft)** |
| **arg** | `0.2.1` | **GPL** | `GPL (>= 2)` | YES | **YES (GPL copyleft)** |
| **gridExtra** | `2.3.1` | **GPL** | `GPL (>= 2)` | YES | **YES (GPL copyleft)** |
| **RColorBrewer**| `1.1-3` | **Apache** | `Apache License 2.0` | YES | Notice only |
| **rlang** | `1.3.0` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **cli** | `3.6.6` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **glue** | `1.8.1` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **lifecycle** | `1.0.5` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **gtable** | `0.3.6` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **isoband** | `0.3.0` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **S7** | `0.2.2` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **farver** | `2.1.2` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **labeling** | `0.4.3` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **R6** | `2.6.1` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **viridisLite** | `0.4.3` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **scales** | `1.4.0` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **vctrs** | `0.7.3` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **withr** | `3.0.3` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **ggplot2** | `4.0.3` | **MIT** | `MIT + file LICENSE` | YES | Notice only |
| **jsonlite** | `2.0.0` | **MIT** | `MIT + file LICENSE` | YES | Notice only |

---

## 2. Supply Chain & Provenance Verification

- All 21 Wasm package binaries originate from official `repo.r-wasm.org/bin/emscripten/contrib/4.6/` builds maintained by the `r-wasm` project.
- Every individual `.tgz` archive has been cryptographically digested (SHA-256) and locked in [`dependency-lock.json`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/dependency-lock.json).
- No unpinned, arbitrary third-party, or unauthenticated binaries are permitted.

---

## 3. Legal & Distribution Risk Analysis

> [!WARNING]
> **UNRESOLVED LICENSING PRODUCTION BLOCKER**  
> Serving `MatchIt`, `cobalt`, and `Rcpp` WebAssembly binaries from ClinicalPSM web servers constitutes **distribution of object code** under GPL v2 Section 3 and GPL v3 Section 6.
> 
> While a Web Worker boundary with JSON `postMessage` messaging physically isolates the address space between the browser UI and the Wasm runtime:
> 1. It is an **unsettled legal question** whether dynamic browser loading of GPL WebAssembly modules makes a proprietary companion frontend a derivative or combined work.
> 2. ClinicalPSM **must** host and provide access to the exact corresponding source code of the distributed WebR, R 4.6.0, MatchIt, cobalt, Rcpp, and arg packages.
> 3. This question **CANNOT** be resolved by technical assertion. It is marked as a **formal production blocker** until an architecture review determines whether ClinicalPSM's frontend code will be open-sourced under GPL-compatible terms or whether legal counsel certifies a clean-boundary model.
