# Statistical Reference Contract (v0.1)

**System:** ClinicalPSM
**Date Context:** 18 October 2026
**Document Status:** Normative Specification (Design Requirements & Governance Standard)
**Governing Standard:** Canonical R `stats::glm`, `MatchIt` (v4.8.x), `cobalt` (v5.0.x)
**Target Release Phase:** CP-01 / CP-02 Baseline

---

## 1. Scope, Purpose & Implementation Status

### 1.1 Purpose
This contract establishes the normative mathematical, algorithmic, and diagnostic requirements for propensity score matching within ClinicalPSM. It defines the exact behavioral contract required for parity with canonical R packages, codifies mandatory scientific guardrails, and specifies the schema of the canonical results object.

### 1.2 Status Notice
> [!IMPORTANT]
> The current pure TypeScript engine in `src/lib/psm/` remains classified as **UNVALIDATED**. The equations and algorithmic rules in this document represent **design requirements and release gates**, not claims of current numerical parity. Public releases must not display "MatchIt-validated" until golden reference test suites pass.

---

## 2. Mathematical & Algorithmic Contract

### 2.1 Propensity Score Estimation

#### Parametric Formulation
The propensity score $e(X_i) = P(Z_i = 1 | X_i)$ is estimated using a binomial Generalized Linear Model (GLM) with a logit link function:
$$\text{logit}(e_i) = \ln\left(\frac{e_i}{1 - e_i}\right) = \eta_i = \beta_0 + \sum_{j=1}^p \beta_j X_{ij} = X_i \beta$$
where $Z_i \in \{0, 1\}$ is the treatment indicator, and $X_i$ is the vector of baseline confounders.

#### Proposed Optimization Standards (Subject to CP-WEBR-00 Benchmark)
The coefficient vector $\beta$ is targeted for estimation via Iteratively Reweighted Least Squares (IRLS) matching `stats::glm` behavior:
- **Target Convergence Criterion (Proposed):** Relative deviance reduction between successive iterations targeted below $10^{-8}$:
  $$\frac{|D^{(t)} - D^{(t-1)}|}{0.1 + |D^{(t)}|} < 1.0 \times 10^{-8}$$
- **Maximum Iterations (Proposed):** 25 iterations by default.
- **Step-Halving Line Search (Proposed):** If an iteration results in deviance increase or extreme parameter explosion ($|\beta_j| > 15$), step-halving is applied to arrest divergence.
- **Separation Detection (Proposed Heuristic):** If complete or quasi-complete separation is detected (e.g., standard error of any coefficient $> 50$ or $|\beta_j| > 10$), the solver emits a `QUASI_COMPLETE_SEPARATION` warning. The engine must not claim automated Firth penalized regression equivalence without version-specific implementation.

#### Design Matrix Construction & Encoding Policy
- **Categorical Contrast Coding (Proposed Policy):** Categorical variables are converted to full-rank dummy matrices following R's default `contr.treatment` standard: factor levels are sorted alphabetically, and the first level is dropped as the reference baseline. This policy is classified as **PROPOSED**: full numerical equivalence with R `model.matrix` requires verification against R's exact NA handling and factor level contrasts in CP-WEBR-00.
- **Zero-Variance Filter:** Covariates with zero variance (identical values across all units) must be rejected prior to model fitting with an explicit explanatory error.

---

### 2.2 Matching Distance & Distance Metric

#### Critical MatchIt Behavioral Correction: Scale Disambiguation
In MatchIt, specifying `distance = "glm", link = "logit"` defines how the propensity score model is estimated, **not necessarily the matching distance scale**:
- **Probability Scale (`distance = "logit"`):** Matching distance is evaluated directly on estimated probabilities:
  $$d(i, j) = |e_i - e_j| \quad \text{where } e \in [0, 1]$$
- **Linear Predictor Scale (`distance = "linear.logit"`):** Matching distance is evaluated on the linear logit scale:
  $$d(i, j) = |\text{logit}(e_i) - \text{logit}(e_j)| = |\eta_i - \eta_j| \quad \text{where } \eta \in (-\infty, +\infty)$$

**Contract Specification:**
1. ClinicalPSM must explicitly expose the distance metric in the configuration schema.
2. The default distance metric for 1:1 Nearest Neighbor matching in ClinicalPSM defaults to **`linear.logit`** (matching on the linear logit scale), as recommended by Rosenbaum & Rubin (1985) and Austin (2011) to avoid variance compression at extreme probabilities.

---

### 2.3 Greedy Nearest Neighbor Matching Mechanics

#### Default Algorithmic Parameters
- **Matching Method:** Greedy Nearest Neighbor (`method = "nearest"`).
- **Matching Ratio:** Fixed 1:1 (`ratio = 1`).
- **Replacement Policy:** Without replacement (`replace = FALSE`). Each control unit is assigned to at most one treated unit.
- **Matching Order (`m.order`):** Descending distance (`m.order = "largest"`). Treated units with the highest linear logit propensity scores are matched first, prioritizing units with the most restricted donor pools.
- **Tie-Breaking Rule (Proposed Behavior):** When candidate control units have identical absolute distance to a treated unit, ties are proposed to be resolved deterministically by choosing the control unit with the lowest original dataset row index. This is classified as **PROPOSED ALGORITHMIC BEHAVIOR**: MatchIt's C++ nearest-neighbor matcher resolves ties based on internal pointer and sorting traversal order, which must be empirically verified for exact parity in CP-WEBR-00.

---

### 2.4 Caliper Specifications & Disambiguation

#### Caliper Defaults & Profiles
- **Canonical Default Caliper:** In canonical MatchIt, the default caliper is **`caliper = NULL`** (no caliper enforced; all treated units within common support are matched). ClinicalPSM maintains `caliper = NULL` as its baseline default.
- **Austin Standard Caliper Profile (Optional Preset):** When the optional Austin profile is explicitly selected by the user, it enforces:
  $$\text{caliper width} = 0.20 \times s_{\text{distance}}$$
  evaluated strictly on the linear logit scale (`distance = "linear.logit"`).

#### Critical Mathematical Disambiguation: Caliper Standardization vs. Cobalt Balance Denominator
A critical distinction must be maintained between how MatchIt standardizes calipers and how cobalt standardizes balance metrics:
1. **MatchIt Caliper Standardization (`process.caliper`, `std.caliper = TRUE`):**
   In canonical MatchIt, when `std.caliper = TRUE`, the caliper width is converted to raw distance units using the sample standard deviation of the distance measure across **all undiscarded units in the dataset (both treated and control pooled)**:
   $$s_{\text{distance, undiscarded}} = \sqrt{\frac{1}{n_{\text{undiscarded}} - 1} \sum_{i \in \text{all undiscarded}} (d_i - \bar{d}_{\text{undiscarded}})^2}$$
   $$\text{caliper width}_{\text{raw}} = \text{caliper} \times s_{\text{distance, undiscarded}}$$
   MatchIt's internal `process.caliper` does NOT scale the caliper by the treated group variance alone.
2. **Cobalt ATT Balance Standardization (`cobalt::bal.tab(..., s.d.denom = "treated")`):**
   In contrast, when reporting baseline covariate balance (Standardized Mean Differences) under the ATT estimand, `cobalt` standardizes continuous covariate differences strictly by the unadjusted sample standard deviation of the **treated cohort** ($s_{1,\text{unadjusted}}$).
3. **Governing Rule:** The software must never equate MatchIt's pooled distance caliper standardization with cobalt's treated-only covariate balance standardization. These are distinct mathematical operations with different target populations.

#### Caliper Attrition & Sample Accounting (No Universal Threshold)
- Any treated unit that has no candidate control unit within distance $\le \text{caliper width}$ remains unmatched and is excluded from the matched cohort.
- **No Automated Estimand Conversion:** The software must **never assert that a universal numerical threshold (such as $> 0$ or $> 10\%$ dropped units) automatically converts the estimand from ATT to ATM**.
- **Methodological Reality:** When treated units are dropped by a caliper or common support restrictions, the matched sample represents an incomplete subpopulation of the original treated cohort. Whether this constitutes an acceptable approximation of the ATT or a distinct matched subpopulation estimand (ATM) is an interpretive methodological judgment requiring epidemiological and clinical context.
- **Reporting Requirement:** ClinicalPSM must report exact, objective sample accounting ($n_{\text{treated, total}}$, $n_{\text{treated, matched}}$, $n_{\text{treated, dropped}}$, percentage retained) accompanied by a neutral methodological advisory explaining the potential generalizability implications of treated-cohort attrition.

---

### 2.5 Covariate Balance Diagnostics

Balance diagnostics evaluate the degree to which matching reduces observed baseline confounding.

#### Continuous Covariates: Standardized Mean Difference (SMD)
Under the ATT estimand, continuous balance must be standardized exclusively by the unadjusted treated baseline sample standard deviation ($s_{1,\text{unadjusted}}$), matching `cobalt::bal.tab(..., s.d.denom = "treated")`:
$$\text{SMD} = \frac{\bar{X}_{1,\text{matched}} - \bar{X}_{0,\text{matched}}}{s_{1,\text{unadjusted}}}$$
where:
$$s_{1,\text{unadjusted}} = \sqrt{\frac{1}{n_{1,\text{unadjusted}} - 1} \sum_{i \in T} (X_i - \bar{X}_{1,\text{unadjusted}})^2}$$
- **Prohibition:** Post-matching pooled sample variance must **never be used in the denominator**. Post-matching pooling creates endogeneity by conditioning on the matching outcome itself (Stuart 2010).

#### Binary Covariates: Raw Difference in Proportions
For binary variables ($0/1$), balance must be reported as the raw prevalence difference:
$$\Delta p = p_{1,\text{matched}} - p_{0,\text{matched}}$$
- **Disambiguation:** Do not assume `cobalt`'s default `binary = "raw"` is equivalent to standardized differences. Standardized differences on binary indicators depend heavily on baseline prevalence; clinical epidemiology mandates raw proportion differences.

#### Continuous Covariates: Variance Ratios (VR)
Variance ratios must be reported for all continuous baseline confounders:
$$\text{VR} = \frac{s^2_{1,\text{matched}}}{s^2_{0,\text{matched}}}$$
- **Proposed Reference Guidelines:** Values close to $1.0$ indicate similar spread. Values outside $[0.5, 2.0]$ indicate residual variance disparity (Rubin 2001). These boundaries are heuristic guidelines, not proof of invalidity.

#### Diagnostic Threshold Governance
- **No Universal Threshold:** The software must never state that an SMD $< 0.10$ "proves balance" or "proves study validity."
- **Reference Guidelines:** The UI may display standard reference threshold guide-lines at $|SMD| = 0.10$ and $|SMD| = 0.05$ accompanied by educational tooltips explaining that thresholds are diagnostic heuristics requiring clinical judgment.

---

### 2.6 Strict Outcome-Blinded Matching Design

#### Separation of Design from Outcome Analysis
In strict accordance with causal inference principles (Rubin 2007, Stuart 2010), matching design must be conducted **entirely blinded to outcome variables**:
1. **Outcome Exclusion from Matching:** Outcome variables must never be included in the propensity score specification, caliper tuning, or balance evaluation.
2. **Outcome-Free Balance Review:** Balance diagnostics must be fully evaluated and locked before any outcome data are inspected or analyzed. Tuning matching algorithms or selecting calipers based on observed outcome effect sizes is scientifically invalid (p-hacking/specification searching).
3. **Downstream Analysis Guidance:** ClinicalPSM produces matched cohorts and balance diagnostics only. Downstream outcome modeling must account for matched-pair clustering using paired tests or cluster-robust standard errors (`vcov = ~subclass`). Independent two-sample tests are methodologically invalid for matched pairs.

---

## 3. Mandatory User-Facing Scientific Warnings & Guardrails

The application must enforce non-bypassable, visible warnings in the following conditions:

```
[Data Input] ──► [Separation Check] ──► [Common Support Check] ──► [Caliper Attrition Check]
                         │                         │                           │
                   Warning Modal             Warning Banner              Warning Banner
                   (Divergence Risk)         (Off-Support Units)         (ATT -> ATM Shift)
```

1. **`WARN_QUASI_SEPARATION`:** Triggered when any $| \beta_j | > 10$ or $SE(\beta_j) > 50$. Requires user acknowledgement.
2. **`WARN_COMMON_SUPPORT_VIOLATION`:** Triggered when treated units exist with propensity scores outside the range of the control pool $[\min(e_{\text{ctrl}}), \max(e_{\text{ctrl}})]$.
3. **`WARN_CALIPER_ATTRITION`:** Triggered when caliper enforcement discards $> 10\%$ of treated subjects, noting the estimand shift from ATT to ATM.
4. **`WARN_MISSING_DATA_EXCLUSION`:** Full disclosure of rows dropped due to complete-case analysis (`na.omit`), with exact counts and percentages per variable.
5. **`PROHIBIT_BALANCE_P_VALUES`:** P-values must **never be displayed** in covariate balance tables. Educational text must cite Imai, King & Stuart (2008) and Austin (2009).
6. **`DISCLAIM_UNMEASURED_CONFOUNDING`:** Permanent footer on all exports stating that propensity score matching adjusts only for observed covariates and cannot remove unmeasured bias.

---

## 4. Canonical Result Object & Metadata Schema

Every matching run must construct an immutable, versioned result object structured as follows:

```typescript
export interface CanonicalPsmResult {
  metadata: {
    runId: string
    parentRunId: string | null
    engineVersion: string
    timestamp: string
    seed: number | null
    inputFingerprint: string // SHA-256 of raw CSV bytes
  }
  studyDeclaration: {
    targetPopulation: string
    treatmentDefinition: string
    comparatorDefinition: string
    targetEstimand: 'ATT' | 'ATM' | 'ATE'
  }
  schema: {
    totalRows: number
    completeCases: number
    excludedRows: number
    covariateRoles: Record<string, 'treatment' | 'confounder' | 'outcome' | 'identifier' | 'excluded'>
  }
  effectiveConfiguration: {
    modelFamily: 'binomial'
    linkFunction: 'logit'
    distanceMetric: 'linear.logit' | 'logit'
    matchingMethod: 'nearest'
    ratio: number
    replace: boolean
    matchingOrder: 'largest'
    caliper: number | null
    caliperScale: 'sd_logit' | 'raw'
    stdCaliper: boolean
  }
  sampleAccounting: {
    importedCount: number
    eligibleCount: number
    treatedTotal: number
    controlTotal: number
    matchedTreatedCount: number
    matchedControlCount: number
    discardedTreatedCount: number
    discardedControlCount: number
  }
  balanceTable: Array<{
    variableName: string
    type: 'continuous' | 'binary' | 'categorical'
    unadjustedTreatedMean: number
    unadjustedTreatedSd: number
    unadjustedControlMean: number
    unadjustedControlSd: number
    unadjustedSmd: number
    matchedTreatedMean: number
    matchedTreatedSd: number
    matchedControlMean: number
    matchedControlSd: number
    matchedSmd: number
    varianceRatio: number | null
    balanceStatus: 'balanced' | 'borderline' | 'imbalanced'
  }>
  diagnostics: {
    maxSmdUnadjusted: number
    maxSmdMatched: number
    rubinB: number
    rubinR: number
  }
  warnings: Array<{
    code: string
    message: string
    severity: 'warning' | 'critical'
    acknowledged: boolean
  }>
}
```

---

## 5. Out-of-Scope Capabilities for Initial Baseline

The following advanced statistical capabilities are explicitly deferred from the initial baseline:
1. **Automated Outcome Regression & Treatment Effect Claims:** Excluded until a certified causal inference module is approved.
2. **Machine Learning Propensity Estimation:** Generalized Boosted Models (GBM), Random Forests, or SuperLearner methods.
3. **Optimal Full Matching & Cardinality Matching:** Complex network-flow algorithms requiring specialized solvers.
4. **Multiple Imputation Integration:** Automatic chained-equation imputation (`MICE` / `MatchThem`).
5. **Automated Variable Selection:** Algorithmic forward/backward stepwise selection or lasso confounder selection.
