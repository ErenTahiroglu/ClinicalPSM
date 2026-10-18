# ClinicalPSM Product Requirements Document (PRD v0.3)

**Product Name:** ClinicalPSM
**Version:** 0.3.0 (Clean-Slate Baseline)
**Date Context:** 18 October 2026
**Document Owner:** ClinicalPSM Product & Methodological Strategy
**Implementation Authority:** Claude Code & Antigravity
**Independent Red Team:** ChatGPT

---

## 1. Product Identity & Core Mission

### 1.1 What ClinicalPSM Is
ClinicalPSM is a **privacy-preserving, browser-local matching-and-publication workflow** designed for observational clinical research. It enables clinical investigators and research teams to execute a verified propensity score matching design, diagnose covariate balance, and produce publication-ready manuscript artifacts (editable Word Table 1, vector Love plot, STROBE Methods paragraph, and reproducible R script) **without transferring patient-level data to an external server**.

### 1.2 What ClinicalPSM Is Not
To prevent misuse, misleading claims, and regulatory exposure, ClinicalPSM is explicitly defined as:
- **NOT an autonomous causal-inference engine:** It cannot determine study design validity from dataset columns alone.
- **NOT a replacement for a professional biostatistician:** It facilitates methodological implementation and auditing; it does not replace expert statistical review.
- **NOT an outcome-effect inference engine (in initial releases):** It performs observational design (matching and balance diagnostics); it does not calculate clinical efficacy or treatment effect p-values.
- **NOT a medical device or clinical decision-support system:** It is designed exclusively for retrospective academic research.
- **NOT a cloud database or patient registry:** It retains no persistent row-level clinical data by default.

---

## 2. Target Personas & User Hierarchy

```
[Primary Operator / Buyer]
Junior Academic Clinician & Surgical Fellow (with Methodological Oversight)
                       ▲
                       │ (Submits R Script & Manifest for Sign-Off)
                       ▼
[Gatekeeper / Co-User]
Academic Biostatistician / Methodologist (Audits R Parity & Reproducibility)
```

### 2.1 Primary User: Clinician-Investigator with Methodological Oversight
- **Profile:** Junior attending physicians, surgical subspecialists, clinical fellows, and dedicated research assistants conducting retrospective cohort studies on hospital EHR or registry datasets ($n = 200$ to $n = 25,000$).
- **Context:** Has an approved IRB protocol and research question; has defined exposure and baseline confounders with a departmental statistician or senior PI; experiences friction converting raw data into publication-ready tables and defending against statistical peer review.
- **Core Need:** A fast, verified, local tool that reduces manual Table 1 assembly overhead and produces an auditable method package that institutional statisticians can review and approve.

### 2.2 Secondary User: Institutional Biostatistician (The Gatekeeper)
- **Profile:** PhD/MS biostatistician supporting multiple academic observational projects simultaneously across a medical center.
- **Context:** Overwhelmed by repetitive data formatting requests; resistant to black-box web tools; requires transparent formulas, exact package versions, and runnable R code.
- **Core Need:** An auditable Method Manifest and executable R script mirroring R `MatchIt` and `cobalt` that allows them to inspect and verify the clinician's matching configuration.

### 2.3 Explicitly Excluded Initial Segment: Unassisted Novice Residents
- **Policy:** Medical residents working entirely alone without statistical oversight or epidemiological mentorship are excluded from the initial target segment. Observational causal inference is fraught with confounding traps (colliders, unmeasured confounding, immortal time bias); providing a push-button GUI to unassisted novices creates severe risk of publishing invalid medical claims.

---

## 3. Jobs-to-be-Done (JTBD)

> **Core JTBD:**
> *"When my observational clinical study requires propensity-score matching, help our research team execute an approved matching design, rigorously assess whether acceptable covariate balance was achieved, and export an auditable, editable Publication Bundle without transferring patient data to an application server."*

### 3.1 Functional Job Requirements
1. **Validate and Clean:** Ingest de-identified clinical datasets (CSV/XLSX), infer variable types, detect missingness, and log exclusions transparently.
2. **Structure Causal Roles:** Force the explicit assignment of variables (Treatment, Baseline Confounders, Identifiers, Post-Treatment/Excluded); prevent accidental inclusion of mediators or colliders.
3. **Execute Verified Matching:** Perform 1:1 Nearest Neighbor matching using canonical biostatistical specifications (Austin logit-scale caliper, descending priority, deterministic tie-breaking).
4. **Diagnose Balance Rigorously:** Calculate Standardized Mean Differences (using unadjusted treated baseline SD as denominator), raw binary proportion differences, and continuous variance ratios; render interactive Love plots.
5. **Generate Publication Deliverables:** Export an integrated, internally consistent Publication Bundle containing an editable Word Table 1, vector Love plot, STROBE Methods paragraph, reproducible R script, and SHA-256 Method Manifest.

---

## 4. System Architecture & Boundaries

```
[User Browser]
  ├── Ingestion & Validation (Client-Side Parsing via PapaParse / SheetJS)
  ├── Statistical Processing (Isolated Web Worker or WebAssembly WebR)
  └── Deliverable Generation (Client-Side DOCX / SVG / R Script Synthesis)
         ▲
         │ (Zero Row-Level Transmission)
         ▼
[Cloudflare Workers Static Assets (Free Tier)]
  └── Serves Static HTML / CSS / JS / Assets ($0.00 Monthly Cost)
```

### 4.1 Boundary Conditions
1. **L1 Boundary (Zero Row Data Transmission):** The application server must never receive row-level clinical data, parsed CSV rows, individual propensity scores, or patient identifiers.
2. **L2 Boundary (Zero Storage Persistence):** Patient data remains in volatile browser memory (Web Worker heap) during the active session. Closing the browser tab purges all clinical records.
3. **L3 Boundary (Zero Database Dependency):** No database (Supabase, D1, PostgreSQL) is required for core matching, balance assessment, or export generation.
4. **L4 Boundary (Cloudflare Free Infrastructure):** Hosting and asset delivery must operate strictly within the Cloudflare Workers Static Assets Free tier ($0.00/month recurring cost).

---

## 5. Information Architecture & Task Flow

The user interface follows a **6-Step Progressive Disclosure Wizard** structured around scientific dependencies rather than generic analytics dashboard patterns:

```
[1. Study Setup] ──► [2. Ingestion] ──► [3. Variables] ──► [4. Config] ──► [5. Balance] ──► [6. Bundle]
   Target Estimand      CSV / XLSX Parse    Assign Roles       Austin Caliper    Love Plot & SMD     Word Table 1
   Time Zero Rationale  Missingness Audit   Exclude Colliders  1:1 Greedy NN     Variance Ratios     R Script & SHA
```

### Step 1: Study Design & Estimand Declaration
- User declares: Study population, treatment/exposure definition, comparator definition, and target estimand (**Average Treatment Effect on the Treated [ATT]** by default).
- Displays clear guidance on time zero and causal question formulation.

### Step 2: Data Ingestion & Quality Audit
- Drag-and-drop CSV, TSV, or XLSX.
- Immediate client-side parsing; displays green privacy badge: *"Browser-Local: Data remains on your device."*
- Data summary: total rows, total columns, missingness percentage, and duplicate patient ID checks.
- Interactive data dictionary allowing type corrections (Continuous, Binary, Multi-Category, Identifier).

### Step 3: Causal Variable Role Assignment
- Assign columns to mutually exclusive roles:
  - **Exposure / Treatment ($Z$):** Binary indicator.
  - **Baseline Confounders ($X$):** Measured prior to treatment initiation.
  - **Outcomes ($Y$, optional):** Recorded for documentation; blinded during matching design.
  - **Identifiers / Excluded:** Isolated from the design matrix.
- Scientific guardrail: Visual warnings against selecting post-treatment complications or known intermediate variables.

### Step 4: Matching Configuration
- Recommended scientific defaults clearly displayed:
  - Algorithm: Greedy Nearest Neighbor (`method = "nearest"`).
  - Matching Ratio: 1:1 fixed ratio.
  - Replacement: Without replacement (`replace = FALSE`).
  - Matching Order: Descending propensity score (`m.order = "largest"`).
  - Caliper: Default `NULL` (unconstrained) or optional Austin standard profile ($0.20 \times s_{\text{distance, undiscarded}}$).
- Advanced drawer allows parameter tuning (caliper width, random seed for tie-breaking) with explicit notes on methodological implications.

### Step 5: Covariate Balance Inspection
- Interactive **Love Plot** displaying unadjusted vs matched absolute SMDs with vertical reference lines at $0.10$ (standard) and $0.05$ (strict).
- Comprehensive **Balance Table** showing unadjusted and matched means, SDs, SMDs, and variance ratios.
- Rubin's diagnostic metrics: Rubin's B ($< 25\%$) and Rubin's R ($[0.5, 2.0]$).
- STROBE Sample Flowchart detailing imported, complete cases, matched pairs, and discarded subjects.

### Step 6: Publication Deliverable Export
- User reviews Methods draft and acknowledges unmeasured confounding limitations.
- Single-click download of the complete **Publication Bundle**.

---

## 6. Functional Scope: MVP vs Commercial Release

| Functional Capability | MVP (Free Scientific Preview) | Commercial Release (Publication Bundle) | Post-1.0 Future Releases |
| :--- | :--- | :--- | :--- |
| **Statistical Engine** | 1:1 Nearest Neighbor; logit GLM; optional Austin caliper; complete-case filtering. | Same verified engine + Firth's penalized likelihood for quasi-separation. | Optimal full matching; machine learning PS via WebR WASM. |
| **Balance Diagnostics** | Interactive Love plot; pre/post balance table; Rubin B/R summary. | MVP diagnostics + high-resolution SVG/PDF export + variance ratios. | eCDF distribution curves; Kolmogorov-Smirnov statistics. |
| **Data Export** | Download matched CSV with pair IDs and propensity scores. | Matched CSV + complete raw audit log + excluded case ledger. | Electronic data capture (REDCap) integration. |
| **Manuscript Deliverables** | On-screen HTML balance table and basic plain text summary. | **Core Value:** Fully styled, editable `.docx` Table 1 + vector SVG/PDF figures + STROBE Methods prose. | LaTeX / Quarto manuscript notebook templates. |
| **Reproducibility** | Basic parameter list. | **Core Value:** Executable `.R` replication script reproducing run in RStudio + SHA-256 Manifest. | Interactive WebR live re-run in browser. |
| **Monetization** | 100% Free; no accounts; no payment barriers. | **Unestablished Hypothesis:** Potential one-off fee or lab license (payments inactive; pricing unvalidated). | Multi-seat enterprise hospital site licenses. |

---

## 7. Usability & Accessibility Standards (WCAG 2.2 AA)

- **Keyboard Navigation:** 100% of workflows (file selection, variable assignment, matching, table inspection, export) operable without a mouse.
- **Color Independence:** Balance status (balanced vs imbalanced) must never rely on color alone; must include textual indicators and numerical values. Love plot must use colorblind-safe palettes (Viridis or Okabe-Ito).
- **Screen Reader Announcements:** Asynchronous calculation phases (Worker execution) must announce status changes via ARIA-live regions.
- **Responsive Layout:** Interface must render cleanly across viewports from 1280px desktop down to 768px tablet displays.

---

## 8. Release Gates & Compliance

1. **Gate 1 (Algorithmic Parity):** The statistical engine must pass 100% of the independent golden-reference test suite against R `MatchIt` (v4.8.1) and `cobalt` (v5.0.0) before being labeled "validated."
2. **Gate 2 (Zero Cloud Ingestion):** Automated network interceptor tests must verify zero outgoing network bytes containing clinical data sentinels.
3. **Gate 3 (Zero Infrastructure Cost):** Deployment must operate completely within the Cloudflare Workers Static Assets Free tier.
4. **Gate 4 (Copy Truthfulness):** User-facing copy must never claim "100% private," "HIPAA compliant," or "publication-ready" without verified audit substantiation.
