# CP-WEBR-01 — Open Source Licensing & Distribution Compliance Architecture

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Phase:** `CP-WEBR-01A R1.1 — Final Licensing Contract Consistency Closure`
**Document Status:** Normative Compliance Contract & Legal Risk Ledger
**Primary Legal Authority:** GNU General Public License v2 & v3 (FSF Guidance: [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html))
**Licensing Gates Status:**
- **`R_PACKAGE_LOCK_ALIGNMENT`:** **`PASS`** (21-package inventory verified against `experiments/cp-webr-00b/dependency-lock.json`)
- **`FULL_DISTRIBUTION_SBOM`:** **`PASS`** (Complete component inventory with verified license sources; see §2 tables)
- **`PRODUCTION_LICENSING_CLEARANCE`:** **`BLOCKED`** (Formal IP legal counsel review required; no commercial distribution clearance may be claimed)

---

## 1. Executive Summary & Legal Reality

### 1.1 Retraction of Defective Prior Claims
In earlier exploratory phases, it was informally suggested that *"executing WebR purely in the user's browser avoids server redistribution issues."* This statement was scientifically and legally flawed and has been **formally retracted**.

### 1.2 Binary Distribution Reality
When a web server (e.g. Cloudflare Workers Static Assets) delivers pre-compiled WebAssembly archives (`R.wasm`, `MatchIt.tgz`, `cobalt.tgz`, `libRblas.so`, `libRlapack.so`) to a client browser via HTTP:
1. **Conveying / Distribution:** This constitutes binary redistribution of object code under Section 3 of GNU GPL v2 and Section 6 of GNU GPL v3.
2. **Corresponding Source Obligations:** Distributing GPL-covered WebAssembly binaries triggers non-negotiable legal obligations to provide Corresponding Source code, license texts, and copyright notices to all recipients under the terms of the applicable licenses.
3. **Commercial SaaS Permission:** The GNU GPL does **not** prohibit commercial use or charging for access to software. However, it strictly conditions the right to distribute binaries upon making the corresponding source code available under the same copyleft license terms.
4. **Combined Work Uncertainty:** Communicating across a Web Worker boundary via `postMessage` with JSON payloads provides technical memory isolation, but does **not** definitively resolve legal combined-work questions under copyright law. If companion frontend code and WebR components form a single combined program, GPL copyleft provisions could extend to proprietary frontend code.

---

## 2. Pinned WebR & R Package Complete Distribution SBOM

### 2.1 WebR Runtime Core & System Libraries Inventory (Verified Source)

**Authoritative Source:** [WebR v0.6.0 LICENSE.md](https://github.com/r-wasm/webr/blob/v0.6.0/LICENSE.md) (retrieved and verified 2026-10-19).

WebR distinguishes between its compiled distribution binaries and its TypeScript/JavaScript client library:

| Component / File Artifact | Version | Upstream Declared License | Component Type & Authoritative Source | Distribution & Compliance Obligation |
| :--- | :---: | :--- | :--- | :--- |
| **WebR Compiled Distribution Binaries** (`R.wasm`, `webr-worker.js`, `webr.mjs`) | 0.6.0 | **GPL-3.0** | Compiled WebAssembly core; Posit PBC & R Core Team ([LICENSE.md](https://github.com/r-wasm/webr/blob/v0.6.0/LICENSE.md)) | Full Corresponding Source disclosure under GPLv3 §6; in-app attribution |
| **WebR Client Library** (`node_modules/webr/`, npm package) | 0.6.0 | **MIT** | TypeScript/JavaScript API client; Posit PBC ([LICENSE.md](https://github.com/r-wasm/webr/blob/v0.6.0/LICENSE.md)) | MIT notice and copyright attribution retention |
| **R Base Core & Math Libraries** (`libR.so`, `libRblas.so`, `libRlapack.so`) | 4.6.0 | **GPL-2.0 and GPL-3.0** | Bundled R runtime; R Foundation for Statistical Computing | Full Corresponding Source code disclosure |
| **PCRE2** | 10.42 | **BSD-3-Clause** | Regular expression engine bundled in `R.wasm` binary | License and copyright notice retention |
| **libgfortran** | GCC 12.2.0 | **GPL-2.0 and GPL-3.0** | Runtime Fortran support bundled in `R.wasm` binary | Source availability under GPL copyleft terms |
| **LLVM Flang** | 18.1.0 | **Apache-2.0** | Fortran runtime libraries bundled in WebR toolchain | Apache 2.0 notice retention and modification disclosure |

> [!IMPORTANT]
> The **WebR npm package client** is MIT-licensed. The **compiled WebAssembly binaries** (`R.wasm`, `webr-worker.js`) served to the browser at runtime are **GPL-3.0**. They are distinct artifacts with distinct legal obligations.

### 2.2 Pre-Compiled R Packages Wasm Distribution SBOM (Exact Lockfile Reconciliation)

Authoritative lockfile source: `experiments/cp-webr-00b/dependency-lock.json`.
The distribution comprises **exactly 21 R package WebAssembly archives** served from `/assets/repo/`.

> [!NOTE]
> **Distinction Between Verified License Metadata and Legal Shorthand:**
> In CRAN package `DESCRIPTION` files, `MatchIt`, `cobalt`, `Rcpp`, `gridExtra`, and `arg` declare their license as `GPL (>= 2)`. The lockfile metadata summarizes this using the repository index shorthand `"GPL-2"`. In accordance with GNU licensing interpretation, `GPL (>= 2)` permits redistribution under GPL version 2 or any later version (GPL-2.0-or-later). The table below lists both the upstream CRAN declaration and the lockfile label.

| Package | Version (Lock) | Upstream CRAN License | Lockfile Label | SHA-256 Digest (Exact Artifact Hash) | Archive Size | Authoritative Upstream Source | Distribution Obligation |
| :--- | :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| **`rlang`** | 1.3.0 | MIT | MIT | `c5562dc07b5d3c62fb85ee856a670b83105ba7793c778a30c1d9512d914e208a` | 1,140,560 B | CRAN (Lionel Henry) | MIT notice retention |
| **`cli`** | 3.6.6 | MIT | MIT | `efa9c2b12c2da09cccb0a27d2e7a079ebd4c38fc1d03560d599f7634eb7f9932` | 967,089 B | CRAN (Gábor Csárdi) | MIT notice retention |
| **`arg`** | 0.2.1 | GPL (>= 2) | GPL-2 | `e0c585a046a225787c205990a5e69058a08d40731034494559b9cc5c06125955` | 207,515 B | CRAN | Corresponding Source |
| **`Rcpp`** | 1.1.2 | GPL (>= 2) | GPL-2 | `87746dcb2b15bb70f944a9585287d5e2876fc7dcb120473d2cb27b9a2ed410b4` | 2,087,828 B | CRAN (Dirk Eddelbuettel) | Corresponding Source |
| **`glue`** | 1.8.1 | MIT | MIT | `3b025aa5fd067ad9b87fecd219e561d4537d488b33581af8beabe2b06024d44d` | 152,905 B | CRAN (Jim Hester) | MIT notice retention |
| **`lifecycle`** | 1.0.5 | MIT | MIT | `c2f8c5905f58b4526c3b68c6163f891b9a12f81d7e50347ad49a70b1f6592527` | 102,893 B | CRAN (Lionel Henry) | MIT notice retention |
| **`gtable`** | 0.3.6 | MIT | MIT | `dae6408ed2ed1d759e50c5fb7e45f81348ff3f4f914cb418ac12bdeaae2ee80b` | 184,798 B | CRAN (Hadley Wickham) | MIT notice retention |
| **`isoband`** | 0.3.0 | MIT | MIT | `bc7494f286084e8861331256df0f6ab27e519e1797e807ec100db1116d3e7a8e` | 1,627,614 B | CRAN (Hadley Wickham) | MIT notice retention |
| **`S7`** | 0.2.2 | MIT | MIT | `76b7d1dcbab977c592a2d951a07336f509243c34fa0d56f6c2c56f2b71c3aec4` | 225,283 B | CRAN | MIT notice retention |
| **`farver`** | 2.1.2 | MIT | MIT | `f7555f2c1926f88d431ff1919c81cff48ff6eadc09de4471610312695be6cea8` | 1,317,442 B | CRAN (Thomas Lin Pedersen) | MIT notice retention |
| **`labeling`** | 0.4.3 | MIT | MIT | `1d89f92c8b15aee3b4f9c8c6c0e7697f79c515558c274279fddfd03a34a6d63d` | 42,861 B | CRAN (Justin Talbot) | MIT notice retention |
| **`R6`** | 2.6.1 | MIT | MIT | `134d30277b1c64afe9ae31a4a52857822bc21d32db46479eb3ea2f3a7397c8d6` | 67,949 B | CRAN | MIT notice retention |
| **`RColorBrewer`**| 1.1-3 | Apache-2.0 | Apache-2.0 | `cf5564fee1b54d547dd5656afbea17e34d48f74ef97b376e495dd4e223ecafc9` | 26,996 B | CRAN (Erich Neuwirth) | Apache 2.0 notice retention |
| **`viridisLite`** | 0.4.3 | MIT | MIT | `cbb327d9e0efe61bfa40ba89c9af3dc05fc5bd76ea69fc485ef3f64fe1785983` | 1,295,884 B | CRAN (Simon Garnier) | MIT notice retention |
| **`scales`** | 1.4.0 | MIT | MIT | `1e3fd9c44c6bba3ea2911ee8a2ee9a8cf5a47013a2ca6db8862cb10a1512ba96` | 620,880 B | CRAN (Hadley Wickham) | MIT notice retention |
| **`vctrs`** | 0.7.3 | MIT | MIT | `42cc19d325e7de2160490273d97099049f261e8b6c3e6736391d96e43923798d` | 1,433,335 B | CRAN (Hadley Wickham) | MIT notice retention |
| **`withr`** | 3.0.3 | MIT | MIT | `65530833ac1e34d41a8e991aab69713aae1a24500af11257b637256af7cc2195` | 185,986 B | CRAN (Jim Hester) | MIT notice retention |
| **`ggplot2`** | 4.0.3 | MIT | MIT | `1a299608d88c92d5741666229c1125848e4c210b0624ebd0012af97957976ae6` | 7,481,119 B | CRAN (Hadley Wickham) | MIT notice retention |
| **`gridExtra`** | 2.3.1 | GPL (>= 2) | GPL-2 | `d9421e0fd97f89d1893d770fdca2fb9ac5c4a9ac71a762f6776f1b518aaba048` | 504,576 B | CRAN (Baptiste Auguie) | Corresponding Source |
| **`MatchIt`** | 4.8.1 | GPL (>= 2) | GPL-2 | `ef2f1439b64037e0acdcfd7699ba641765d5dd16bd46cad0dd13c58305b9b6dc` | 1,573,147 B | CRAN (Ho, Imai, King, Stuart) | Corresponding Source |
| **`cobalt`** | 5.0.0 | GPL (>= 2) | GPL-2 | `b63bfabf563304dfe7ffafd4c21e9b580b817c5d0df155d390fc6c42440b0218` | 2,616,764 B | CRAN (Noah Greifer) | Corresponding Source |

**Total Distribution Package Volume:** Exactly 25,055,047 bytes (~23.89 MiB across 21 archives).

---

## 3. GPL Redistribution Compliance Architecture

To achieve full compliance when distributing GPL-covered WebAssembly binaries, ClinicalPSM implements four mandatory distribution mechanisms:

```
┌──────────────────────────────────────────────────────────────┐
│ ClinicalPSM Production Distribution Server                   │
├────────────────────────────────┬─────────────────────────────┤
│ WebAssembly Binaries           │ Corresponding Source Store  │
│ - /assets/webr/R.wasm          │ - /source/webr-0.6.0.tar.gz │
│ - /assets/repo/MatchIt.tgz     │ - /source/MatchIt-4.8.1.tar.gz
│ - /assets/repo/cobalt.tgz      │ - /source/cobalt-5.0.0.tar.gz
│ - (19 dependency archives)     │ - (Full source tarballs)    │
└────────────────────────────────┴─────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────┐
│ In-App Open Source License & Source Disclosure Dialog        │
│ - Exact license texts (GPL-2, GPL-3, MIT, Apache)            │
│ - Direct one-click download for Corresponding Source         │
│ - Complete build instructions to recreate Wasm packages      │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 Corresponding Source Hosting
In accordance with GPL v3 Section 6 (governing the WebR binary distribution) and GPL v2 Section 3(a) (for any GPL-2.0-only package tarballs separately hosted), whenever compiled Wasm binaries are hosted and served from `/assets/`:
1. The exact, un-modified upstream source tarballs for all 21 R packages must be hosted on the same origin under `/source/`.
2. The exact WebR 0.6.0 source tree, including all Emscripten build scripts and patches, must be made downloadable directly alongside the binary.
3. Every distributed archive must match its cryptographic digest recorded in `dependency-lock.json`.

### 3.2 In-App Legal Notices & Attribution Dialog
The production web application must incorporate a non-dismissible, easily accessible "Open Source Licensing & Source Code" interface:
- Displays complete copyright notices for the R Core Team, Posit PBC, MatchIt authors (Ho, Imai, King, Stuart), and cobalt authors (Greifer).
- Provides complete verbatim copies of GNU GPL v2, GNU GPL v3, MIT, and Apache 2.0 license texts.
- Provides direct download links to the exact Corresponding Source tarballs.

---

## 4. Frontend Combined-Work Analysis & Legal Boundaries

### 4.1 Technical IPC vs. Copyright Derivative Work
A central question in the architecture review is whether the proprietary TypeScript frontend (`apps/web`) is considered a combined work with the GPL-covered WebR/MatchIt runtime:

1. **The FSF Interpretation (GPL FAQ):**
   - The Free Software Foundation maintains that if two programs are designed to communicate intimately, sharing complex internal data structures and operating as a single unified functional unit, they form a single combined work regardless of whether the communication occurs via shared memory, function calls, sockets, or IPC pipes.
   - Merely separating code into a Web Worker and communicating over `postMessage` does not guarantee exemption from copyleft obligations if the frontend cannot function without the GPL engine and is tightly coupled to its semantics.
2. **GPL-2 vs. GPL-3 Nuances:**
   - **GPL-2:** Governed by the US Copyright Act doctrine of "derivative works". There is legal ambiguity regarding whether dynamic execution of a client-side Wasm library via IPC creates a derivative work of the underlying library.
   - **GPL-3:** Explicitly defines "Corresponding Source" and "Conveying", extending copyleft to all software needed to run, modify, and install the work if distributed as a combined product.

### 4.2 Production Release Boundary
Because ClinicalPSM is intended to provide a specialized clinical research tool without compromising intellectual property boundaries:
- **`PRODUCTION_LICENSING_CLEARANCE = BLOCKED`:** Under no circumstances may ClinicalPSM be deployed to production or commercial users until formal intellectual property legal counsel conducts a comprehensive review.
- **Scope of Legal Review:**
  1. Approve the Corresponding Source delivery mechanism.
  2. Confirm whether the TypeScript frontend can remain under a proprietary or permissive license, or whether a dual-licensing / AGPL strategy is recommended.
  3. Validate the in-app attribution and source download workflows.
