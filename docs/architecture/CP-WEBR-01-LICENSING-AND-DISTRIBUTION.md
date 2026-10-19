# CP-WEBR-01 — Open Source Licensing & Distribution Compliance Architecture

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Phase:** `CP-WEBR-01A — Licensing Contract`
**Document Status:** Normative Compliance Contract & Legal Risk Ledger
**Primary Legal Authority:** GNU General Public License v2 & v3 (FSF Guidance: [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html))
**Licensing Gates Status:**
- **`LICENSING_INVENTORY`:** **`PASS`** (Complete 21-package + WebR runtime SBOM locked)
- **`PRODUCTION_LICENSING_CLEARANCE`:** **`BLOCKED`** (Formal IP legal counsel review required before production release)

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

## 2. Pinned WebR & R Package Dependency Inventory (SBOM)

The complete runtime distribution comprises 21 R package archives and the WebR WebAssembly core, locked in `dependency-lock.json`:

| Package / Binary Component | Version | Exact License | Primary Upstream Source | Distribution Obligation |
| :--- | :---: | :--- | :--- | :--- |
| **`WebR Runtime Core`** (`R.wasm`, `webr.mjs`) | 0.6.0 | GPL-2.0-or-later | Posit / R Core Team | Full Wasm toolchain patch source disclosure |
| **`R Base Core & Math Libraries`** (`libR.so`, `libRblas.so`) | 4.6.0 | GPL-2.0-or-later | R Foundation | Complete Corresponding Source |
| **`MatchIt`** | 4.8.1 | GPL-2.0-or-later | CRAN (Ho, Imai, King, Stuart) | Complete Corresponding Source |
| **`cobalt`** | 5.0.0 | GPL-2.0-or-later | CRAN (Greifer) | Complete Corresponding Source |
| **`backports`** | 1.5.0 | GPL-2.0-only | CRAN (R Core Team / Michel Lang) | Complete Corresponding Source |
| **`chk`** | 0.9.2 | GPL-3.0-only | CRAN (Joe Thorley) | Complete Corresponding Source |
| **`cli`** | 3.6.5 | MIT | CRAN (Gábor Csárdi) | Notice & license retention |
| **`crayon`** | 1.5.3 | MIT | CRAN (Gábor Csárdi) | Notice & license retention |
| **`digest`** | 0.6.37 | GPL-2.0-or-later | CRAN (Dirk Eddelbuettel) | Complete Corresponding Source |
| **`glue`** | 1.8.0 | MIT | CRAN (Jim Hester) | Notice & license retention |
| **`gridExtra`** | 2.3 | GPL-2.0-or-later | CRAN (Baptiste Auguie) | Complete Corresponding Source |
| **`gtable`** | 0.3.6 | MIT | CRAN (Hadley Wickham) | Notice & license retention |
| **`isoband`** | 0.2.7 | MIT | CRAN (Hadley Wickham) | Notice & license retention |
| **`lifecycle`** | 1.0.4 | MIT | CRAN (Lionel Henry) | Notice & license retention |
| **`magrittr`** | 2.0.3 | MIT | CRAN (Stefan Milton Bache) | Notice & license retention |
| **`rlang`** | 1.1.5 | MIT | CRAN (Lionel Henry) | Notice & license retention |
| **`vctrs`** | 0.6.5 | MIT | CRAN (Hadley Wickham) | Notice & license retention |
| **`withr`** | 3.0.2 | MIT | CRAN (Jim Hester) | Notice & license retention |
| **`ggplot2`** | 3.5.1 | MIT | CRAN (Hadley Wickham) | Notice & license retention |
| **`tibble`** | 3.2.1 | MIT | CRAN (Kirill Müller) | Notice & license retention |
| **`pillar`** | 1.10.1 | MIT | CRAN (Kirill Müller) | Notice & license retention |
| **`scales`** | 1.3.0 | MIT | CRAN (Hadley Wickham) | Notice & license retention |
| **`farver`** | 2.1.2 | MIT | CRAN (Thomas Lin Pedersen) | Notice & license retention |
| **`labeling`** | 0.4.3 | MIT | CRAN (Justin Talbot) | Notice & license retention |
| **`munsell`** | 0.5.1 | MIT | CRAN (Charlotte Wickham) | Notice & license retention |
| **`RColorBrewer`** | 1.1-3 | Apache-2.0 | CRAN (Erich Neuwirth) | Notice & license retention |
| **`viridisLite`** | 0.4.2 | MIT | CRAN (Simon Garnier) | Notice & license retention |

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
In accordance with GPL v2 Section 3(a) and GPL v3 Section 6(b), whenever compiled Wasm binaries are hosted and served from `/assets/`:
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
