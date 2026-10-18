# Research Decision Ledger: Synthesis of Three Independent Studies

**Project:** ClinicalPSM
**Date:** 18 October 2026
**Status:** Canonical Product Baseline
**Governing Authority:** Independent Red Team (ChatGPT)

---

## 1. Executive Context & Methodology

Between April and October 2026, three comprehensive research evaluations were conducted to establish the scientific, architectural, and commercial foundation for ClinicalPSM:
1. **Study 1 (Statistical Reference Contract):** Algorithmic audit and mathematical specification comparing ClinicalPSM against canonical implementations in R `stats::glm`, `MatchIt` (v4.8.x), and `cobalt` (v5.0.x).
2. **Study 2 (Clinical Workflow & Competitive Analysis):** Exploration of academic publishing bottlenecks, researcher competencies, and competitor capabilities across R, Stata, SAS, SPSS, EZR, and jamovi.
3. **Study 3 (Product-Market Fit & Red Team Synthesis - Perplexity Deep Research):** Critical evaluation of researcher willingness to pay, institutional procurement hurdles, browser-local data privacy, and publication-oriented value propositions.

This ledger synthesizes findings across all three studies, categorizing requirements into **Accepted Core Requirements**, **Rejected Hypotheses**, and **Unverified Hypotheses Requiring Empirical Testing**.

---

## 2. Synthesis Matrix

### 2.1 Accepted Requirements (Firm Ground Truth)

| Domain | Requirement / Decision | Evidence & Primary Source | Impact on ClinicalPSM Architecture |
| :--- | :--- | :--- | :--- |
| **Privacy Architecture** | **Zero Server Data Ingestion:** Patient-level row data must never touch an application server or database. | HIPAA Privacy Rule (45 CFR § 164.514); GDPR Art. 9; Hospital IRB restrictions. | Computation locked to local browser memory (Web Worker / WebAssembly). No database tables for clinical rows. |
| **Statistical Integrity** | **Dual Estimation/Inference Boundary:** Matching is design (preprocessing); outcome effect estimation is inference. | Ho, Imai, King & Stuart (2007); MatchIt documentation; Austin (2014). | Initial scope restricted to matching and balance diagnostics. Outcome regression and causal effect claims excluded. |
| **Statistical Modeling** | **Exact Logit IRLS Solver:** Logistic regression must enforce relative deviance convergence ($\epsilon = 10^{-8}$) and step-halving. | Nelder & Wedderburn (1972); Albert & Anderson (1984); R `stats::glm`. | Prevents divergence on ill-conditioned clinical matrices; surfaces quasi-complete separation warnings cleanly. |
| **Distance & Caliper** | **Austin Logit Scale Caliper:** Calipers must be evaluated on the linear logit scale, standardizing strictly by unadjusted treated variance. | Austin (2011); Rosenbaum & Rubin (1985); MatchIt `std.caliper=TRUE`. | Prevents caliper compression in high-propensity regions; locks standardization base to unadjusted treated cohort under ATT. |
| **Balance Diagnostics** | **Strict Covariate Balance Standards:** Continuous SMD denominator locked to unadjusted treated cohort SD; raw proportion differences for binary; continuous variance ratios. | Austin (2009); Stuart (2010); Rubin (2001); Greifer (2024, `cobalt`). | Prohibits post-matching pooled variance in SMD denominators. Prohibits post-matching balance p-values. |
| **Sample Accounting** | **STROBE Flow Logging:** Full accounting of imported, eligible, analyzed, matched, and discarded subjects. | STROBE Statement (2007, Item 12); RECORD Statement (2015). | Complete-case exclusion ledger; explicit detection and warning when caliper attrition shifts estimand from ATT to ATM. |
| **Deliverables** | **Publication-Ready Artifacts:** Primary deliverable is an integrated Publication Bundle (Word Table 1, vector Love plot, Methods text, R script, Method Manifest). | Systematic reviews of PSM reporting (Yao et al., 2015; Ali et al., 2015). | Focuses development on producing publication-grade outputs rather than generic analytics dashboards. |
| **Reproducibility** | **Executable R Script & Manifest:** Every run must generate an executable R script and a SHA-256 method manifest. | ICMJE Data Sharing & Reproducibility Guidelines; Open Science Framework. | Enables independent verification by institutional biostatisticians and peer reviewers using native R packages. |

---

### 2.2 Rejected Hypotheses (Refuted Product Concepts)

| Hypothesis | Original Assumption | Refutation Basis | Final Strategic Decision |
| :--- | :--- | :--- | :--- |
| **"PSM Without Coding" Wedge** | Researchers will pay for an automated propensity score matching tool solely because it avoids writing code. | R `MatchIt`, `cobalt`, EZR, and jamovi already offer free, mature matching without licensing fees. | **REJECTED:** Free tools are the benchmark. Value exists only in saving 15–20 hours of manual artifact creation and method reporting. |
| **Monthly Recurring SaaS Subscriptions** | Academic clinical researchers will pay $29–$49/month recurring for a standalone PSM tool. | Observational research projects are episodic (1–3 papers/year). Churn rates exceed 80% after month 1. | **REJECTED:** Eliminate monthly recurring billing. Adopt a per-manuscript "Publication Bundle" model ($49–$99 one-off) or lab license. |
| **Targeting Unassisted Novice Residents** | First-year medical residents can safely perform observational matching without methodological oversight. | Internal medicine resident surveys show severe statistical knowledge deficits (avg. 41.4% correct; 75% misinterpret statistics). | **REJECTED:** Novices face high risk of publishing confounded observational results. Primary target is investigators with biostatistical oversight. |
| **Automated Confounder Selection** | The software can automatically select confounders from column names or statistical significance tests. | Selecting covariates by automated p-values or predictive fit induces collider stratification bias and M-bias. | **REJECTED:** Covariate selection requires causal/clinical knowledge. The UI must enforce explicit user-declared roles. |
| **Universal Balance Thresholds** | SMD $< 0.10$ can be asserted by the software as a universal pass/fail law. | Methodological literature (Stuart 2010; Austin 2009) emphasizes that balance thresholds are heuristics, not mathematical proofs. | **REJECTED:** The UI displays reference guidelines ($0.10$ and $0.05$) with contextual nuance; never issues blanket "study validated" claims. |
| **Inherent Regulatory Compliance** | Executing code locally in a browser automatically constitutes HIPAA or GDPR compliance. | OWASP Client-Side Security standards note that browser memory and storage remain vulnerable to XSS and client-side attacks. | **REJECTED:** Accurately describe verified data flows ("no data leaves your device"); make no unsubstantiated regulatory claims. |
| **Pure TypeScript Engine Parity Assumption** | A custom TypeScript statistical engine can claim to be "publication-ready" without automated R equivalence verification. | Legacy audit revealed five critical numerical defects (unregularized IRLS, dataset-order greedy matching, post-match pooled variance). | **REJECTED:** The TypeScript engine remains classified as UNVALIDATED until it passes containerized R golden fixtures. |

---

### 2.3 Unverified Hypotheses (Requiring Empirical Testing)

| Hypothesis | Description | Required Verification Test | Blocking Status |
| :--- | :--- | :--- | :--- |
| **H-01: Publication Bundle WTP** | Clinician-investigators or departments will pay $49–$99 for an editable Word Table 1, vector Love plot, and R script. | Structured customer discovery interviews and a real payment test with researchers who have completed a trial match. | Non-blocking for research preview; **BLOCKING for commercial rollout**. |
| **H-02: Biostatistician as Endorser** | Institutional biostatisticians will accept ClinicalPSM if it exports a verifiable R script that reproduces the exact run in RStudio. | Expert interviews with 5 academic biostatisticians reviewing the generated script and method manifest. | Non-blocking for MVP; **HIGH PRIORITY for Tier 2**. |
| **H-03: Browser V8 Memory Boundaries** | Client-side memory can reliably match datasets up to 50,000 rows across major browsers (Chrome, Safari, Firefox). | Systematic synthetic memory benchmarking on low-end laptops and mobile devices measuring heap usage. | **BLOCKING for real-data upload release**. |
| **H-04: WebR WASM Feasibility** | Running native R `MatchIt` and `cobalt` inside the browser via WebAssembly (WebR) is fast and stable enough for production. | Experimental evaluation phase `CP-WEBR-00` measuring download size (~30MB), cold start latency, and memory limits. | **ACTIVE EVALUATION (CP-WEBR-00)**. |
| **H-05: Departmental Procurement Feasibility** | Academic departments will reimburse one-off software receipts from discretionary research funds without enterprise IT review. | Validation interviews with departmental administrators and PIs regarding expense reimbursement policies. | Non-blocking for MVP. |

---

## 3. Product Principles Derived from Synthesis

1. **Defensibility Over Completion:** The tool must optimize for scientific defensibility, auditability, and appropriate refusal—not maximum analysis completion.
2. **Decisions Must Be Visible:** Every algorithmic choice (link function, distance metric, matching order, caliper width, variance formula) must be explicitly shown, justified with literature citations, and recorded in the manifest.
3. **No Black Boxes:** Never silently delete rows, adjust models, or impute missing values. All data transformations must be transparently audited.
4. **Separation of Design and Inference:** Emphasize that propensity score matching is a design phase that balances observed covariates, not an automated statistical test of clinical efficacy.
5. **Two-Tier Monetization Architecture:** Maintain a completely free scientific preview to foster academic trust and citations, monetizing exclusively through high-value publication artifacts.
