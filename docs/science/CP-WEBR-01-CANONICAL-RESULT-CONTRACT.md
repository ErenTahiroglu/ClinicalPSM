# CP-WEBR-01 — Canonical Scientific Result Contract & Data Model

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Phase:** `CP-WEBR-01A — Scientific Data Model`
**Governing Standard:** Canonical R `stats::glm`, `MatchIt` 4.8.1, `cobalt` 5.0.0
**Status:** Normative Specification (Design Contract — Zero Algorithmic Modifications in Current Phase)

---

## 1. Scientific Mission & Scope Boundaries

### 1.1 Canonical Profile: Initial Baseline
The initial supported scientific profile for ClinicalPSM is strictly bounded to the most widely accepted, methodologically robust clinical standard:
- **Treatment Structure:** Binary treatment indicator ($Z_i \in \{0, 1\}$) with explicit user-defined treatment ($Z = 1$) and control ($Z = 0$) designations.
- **Confounder Selection:** User-selected pretreatment baseline covariates ($X_i$). Strict exclusion of all post-baseline and outcome variables.
- **Propensity Score Estimator:** Parametric logistic regression via Generalized Linear Models (`stats::glm(formula, family = binomial(link = "logit"))`).
- **Matching Algorithm:** Greedy 1:1 Nearest-Neighbor matching without replacement (`MatchIt::matchit(method = "nearest", ratio = 1, replace = FALSE)`).
- **Target Estimand:** Average Treatment Effect on the Treated (ATT).
- **Matching Order:** Descending linear logit distance (`m.order = "largest"`).
- **Distance Metric:** Linear logit propensity score (`distance = "glm", link = "linear.logit"`). Probability scale (`link = "logit"`) supported as explicit alternative.
- **Caliper Support:** Canonical default is **`caliper = NULL`** (no caliper enforced). Optional standardized distance caliper (`caliper = 0.20, std.caliper = TRUE`) available as an explicit user setting.
- **Covariate Balance Diagnostics:** Handled exclusively via `cobalt::bal.tab` under the ATT estimand (`s.d.denom = "treated"`).

### 1.2 Prohibited & Out-of-Scope Methods (Initial Profile)
The following advanced or experimental methods are strictly excluded from the initial production profile:
- Continuous, multi-valued, or time-varying treatments.
- Optimal matching, full matching, genetic matching, or cardinality matching.
- Automated outcome modeling, treatment effect estimation, or survival curves.
- Automated Firth penalized likelihood fallback without explicit user consent.
- Automated variable selection (stepwise, LASSO, or machine learning algorithms).

---

## 2. Mathematical Semantics: MatchIt & cobalt Parity

### 2.1 MatchIt Mathematical Semantics

#### A. Propensity Score Formulation
The propensity score $e(X_i) = P(Z_i = 1 | X_i)$ is estimated using IRLS:
$$\text{logit}(e_i) = \ln\left(\frac{e_i}{1 - e_i}\right) = \eta_i = \beta_0 + \sum_{j=1}^p \beta_j X_{ij}$$

Matching distance between treated unit $i$ and control candidate $j$ is evaluated on the linear logit scale:
$$d(i, j) = |\eta_i - \eta_j| \quad \text{where } \eta \in (-\infty, +\infty)$$

#### B. Caliper Standardization Semantics
When an optional standardized caliper is configured (`std.caliper = TRUE`), the caliper width is converted to raw distance units using the pooled standard deviation across **all undiscarded units (treated and control combined)**:
$$s_{\text{distance, undiscarded}} = \sqrt{\frac{1}{n_{\text{undiscarded}} - 1} \sum_{k \in \text{all undiscarded}} (d_k - \bar{d}_{\text{undiscarded}})^2}$$
$$\text{caliper width}_{\text{raw}} = \text{caliper} \times s_{\text{distance, undiscarded}}$$

MatchIt does **not** standardize the caliper by the treated group variance alone.

#### C. Sample Accounting & Prohibition of Automated Estimand Conversion
When units are discarded or unmatched due to caliper enforcement or common support restrictions:
1. The matched cohort represents an eligible subpopulation of the original treated sample.
2. The application must **never** assert that an arbitrary attrition threshold (e.g., $> 10\%$ dropped treated units) automatically converts the estimand from ATT to Average Treatment Effect on the Matched (ATM).
3. The software reports objective sample accounting:
   - $n_{\text{treated, total}}$
   - $n_{\text{treated, matched}}$
   - $n_{\text{treated, dropped}}$
   - Percentage retained
4. Accompanied by a neutral methodological advisory explaining the generalizability implications of treated-cohort attrition.

---

### 2.2 cobalt Mathematical Semantics

#### A. Continuous Baseline Balance (Standardized Mean Difference - SMD)
Under the ATT estimand, continuous covariate differences must be standardized strictly by the unadjusted baseline sample standard deviation of the **treated cohort** ($s_{1,\text{unadjusted}}$), matching `cobalt::bal.tab(..., s.d.denom = "treated")`:
$$\text{SMD} = \frac{\bar{X}_{1,\text{matched}} - \bar{X}_{0,\text{matched}}}{s_{1,\text{unadjusted}}}$$
where:
$$s_{1,\text{unadjusted}} = \sqrt{\frac{1}{n_{1,\text{unadjusted}} - 1} \sum_{i \in T} (X_i - \bar{X}_{1,\text{unadjusted}})^2}$$

**Strict Mathematical Rule:** The denominator must **never** use post-matching pooled sample variance, as conditioning on the matching outcome creates endogeneity and distorts balance evaluation (Stuart 2010).

#### B. Binary Baseline Balance (Raw Proportion Difference)
For binary variables ($0/1$), balance must be reported as the raw prevalence difference:
$$\Delta p = p_{1,\text{matched}} - p_{0,\text{matched}}$$
Standardized differences for binary variables depend heavily on baseline prevalence and distort clinical interpretation.

#### C. Continuous Covariate Variance Ratios (VR)
Variance ratios are evaluated as:
$$\text{VR} = \frac{s^2_{1,\text{matched}}}{s^2_{0,\text{matched}}}$$
Values within $[0.5, 2.0]$ represent acceptable heuristic spread; values outside this interval are flagged as residual variance disparity.

#### D. Prohibition on P-Values in Balance Tables
In accordance with modern clinical epidemiology (Imai, King & Stuart 2008; Austin 2009), **hypothesis test p-values (e.g., t-tests, chi-square tests) must never be displayed in covariate balance tables**. Propensity score matching is a sample-adjustment procedure, not a randomized hypothesis test; p-values conflate balance with sample size.

---

## 3. Separation, Convergence & Scientific Fail-Closed Policy

### 3.1 Empirical Root Cause: Complete Separation in `glm()`
As verified in `CP-WEBR-00B R2.1`, R's `stats::glm()` uses relative deviance reduction as its stopping criterion:
$$\frac{|D^{(t)} - D^{(t-1)}|}{|D^{(t)}| + 0.1} < 10^{-8}$$

Under complete separation (e.g., fixture `fix_16`), a linear combination of covariates perfectly separates treatment from control. Consequently:
1. The estimated coefficients diverge toward $\pm\infty$.
2. The log-likelihood reaches a finite asymptote, and consecutive deviance changes drop below $10^{-8}$.
3. `glm()` exits its loop and flags `converged = TRUE`.
4. However, the standard errors of the coefficients explode ($SE > 39,000$), and fitted propensity scores collapse to 0.0 or 1.0.

### 3.2 Five-Tier Scientific Diagnostic Policy

To protect clinical research integrity without making unsupported claims, ClinicalPSM enforces a five-tier diagnostic hierarchy:

```
[ Model Fitting (stats::glm) ]
              │
              ├── 1. Optimizer Failure (max iterations reached without convergence)
              │      └── Status: NUMERICAL_FAILURE (Fail Closed)
              │
              ├── 2. Suspected Separation (Observable Symptoms — NOT definitive heuristics)
              │      Symptoms (any combination):
              │        - glm() converged == TRUE yet fitted probs collapse to 0.0 or 1.0
              │        - One or more coefficient SEs exceed ~1,000 (experiment: SE > 39,000)
              │        - Coefficient estimates diverging across IRLS iterations
              │      Classification: WARN_QUASI_SEPARATION advisory
              │      Gate: REJECT_FOR_PUBLICATION (Fail Closed)
              │      NOTE: No universal numeric threshold (|beta|>10, SE>50) is validated.
              │            Definitive detection requires Phase CP-STAT-02 implementation.
              │
              ├── 3. Rank Deficiency / Collinearity
              │      Condition: rank(X) < ncol(X) OR any NA coefficient
              │      └── Status: REJECT_FOR_PUBLICATION (Fail Closed)
              │
              ├── 4. Zero Eligible Matches / Off-Support
              │      Condition: Caliper too tight OR zero overlap
              │      └── Status: EXPECTED_REFERENCE_ERROR (Fail Closed)
              │
              └── 5. Valid Model Estimation
                     └── Status: PUBLICATION_ELIGIBLE
```

### 3.3 Explicit Blocker Disclosure
- **SEPARATION_DETECTOR = NOT_IMPLEMENTED:** The feasibility experiment (`CP-WEBR-00B`) relied on fixture metadata for the `REJECT_FOR_PUBLICATION` classification of `fix_16`. No runtime separation detector exists.
- **Numeric Threshold Prohibition:** The candidate heuristics `|beta_j| > 10.0` and `SE(beta_j) > 50.0` are **not validated universal separation diagnostics** and must not be embedded as definitive classification criteria in production code. They have been removed from this contract.
- **AUTOMATED_SEPARATION_SAFETY = BLOCKED:** A general-purpose runtime separation detector (evaluating observable symptoms: boundary probabilities, SE magnitude relative to coefficient scale, and IRLS iteration divergence) must be implemented and independently validated against the 25 golden fixtures during Phase `CP-STAT-02` before any claim of automated separation safety can be made.

---

## 4. Canonical Scientific Result TypeScript Schema

Every execution of the matching engine produces an **immutable** result snapshot adhering strictly to the following TypeScript interface. The result object is immediately frozen with `Object.freeze()` upon creation; no downstream consumer may mutate any field. All publication artifacts must reference the frozen snapshot directly.

```typescript
/**
 * CanonicalPsmResult — The single authoritative scientific snapshot for ClinicalPSM.
 * Produced by Dedicated Worker via WebR; frozen with Object.freeze().
 * All downstream publication artifacts (DOCX, SVG, CSV, Methods) must reference this snapshot.
 */
export interface CanonicalPsmResult {
  // 1. Run Identification & Provenance
  metadata: {
    runId: string;
    parentRunId: string | null;
    timestamp: string; // ISO 8601 UTC
    seed: number | null;
    executionDurationMs: number;
    platform: {
      userAgent: string;
      cores: number;
    };
  };

  // 2. Input Schema Fingerprint
  inputFingerprint: {
    datasetSha256: string;
    totalRows: number;
    completeCases: number;
    excludedRows: number;
    exclusionReasonSummary: Record<string, number>;
  };

  // 3. Runtime & Package Versions
  toolchain: {
    webrVersion: string; // '0.6.0'
    rVersion: string; // '4.6.0'
    emscriptenVersion: string; // '5.0.7'
    matchItVersion: string; // '4.8.1'
    cobaltVersion: string; // '5.0.0'
    dependencySha256s: Record<string, string>;
  };

  // 4. Effective MatchIt Configuration
  matchingConfiguration: {
    treatmentVariable: string;
    covariates: string[];
    distanceMetric: 'linear.logit' | 'logit';
    method: 'nearest';
    ratio: number; // 1
    replace: boolean; // false
    matchingOrder: 'largest';
    caliper: number | null;
    stdCaliper: boolean;
    effectiveCaliperWidthRaw: number | null;
    caliperScaleDescription: string;
  };

  // 5. Factor & Reference-Level Configuration
  factorConfiguration: Record<string, {
    inferredType: 'continuous' | 'binary' | 'categorical';
    levels: string[];
    referenceLevel: string;
    droppedLevel: string;
  }>;

  // 6. Unit-Level Propensity Score Output
  propensityScores: {
    unitIds: string[];
    treatment: Uint8Array; // 1 = treated, 0 = control
    propensityScores: Float64Array; // Probability scale [0, 1]
    linearLogits: Float64Array; // Linear scale (-Inf, +Inf)
  };

  // 7. Match Matrix & Matched Unit Identities
  matchMatrix: {
    treatedIds: string[];
    matchedControlIds: (string | null)[]; // null if discarded by caliper
    pairDistances: (number | null)[];
  };

  // 8. Weights & Subclass Assignments
  matchingWeights: {
    unitIds: string[];
    weights: Float64Array; // 1.0 for matched treated & matched control, 0.0 for unmatched
    subclass: (number | null)[]; // 1..N for matched pairs, null for unmatched
  };

  // 9. Discarded & Unmatched Unit Ledgers
  sampleAccounting: {
    importedTotal: number;
    completeCases: number;
    treatedTotal: number;
    controlTotal: number;
    matchedTreatedCount: number;
    matchedControlCount: number;
    unmatchedTreatedCount: number;
    unmatchedControlCount: number;
    discardedTreatedCount: number;
    discardedControlCount: number;
    treatedRetentionRate: number; // matchedTreatedCount / treatedTotal
  };

  // 10. cobalt Baseline Balance Statistics
  balanceTable: Array<{
    covariateName: string;
    displayName: string;
    type: 'continuous' | 'binary' | 'categorical_level';
    // Baseline (Unadjusted)
    unadjustedTreatedMean: number;
    unadjustedTreatedSd: number;
    unadjustedControlMean: number;
    unadjustedControlSd: number;
    unadjustedSmd: number;
    // Matched (Adjusted)
    matchedTreatedMean: number;
    matchedTreatedSd: number;
    matchedControlMean: number;
    matchedControlSd: number;
    matchedSmd: number;
    smdReductionPercent: number;
    // Variance Diagnostics
    unadjustedVarianceRatio: number | null;
    matchedVarianceRatio: number | null;
    // Heuristic Threshold Status
    heuristicStatus: 'balanced_smd_and_vr' | 'borderline_smd' | 'imbalanced_smd' | 'residual_variance_disparity';
  }>;

  // 11. Convergence & Numerical Diagnostics
  numericalDiagnostics: {
    glmConvergence: boolean;
    glmIterations: number;
    glmNullDeviance: number;
    glmResidualDeviance: number;
    maxAbsoluteCoefficient: number;
    maxCoefficientStandardError: number;
    coefficientTable: Array<{
      term: string;
      estimate: number;
      standardError: number;
      zValue: number;
      pValue: number;
    }>;
    rubinB: number;
    // Rubin's B: absolute standardized difference of propensity score MEANS
    // between matched treated and matched control, standardized by the pooled
    // unadjusted (pre-match) propensity score standard deviation.
    // Rubin (2001) heuristic guidance: B < 25 suggests adequate balance (informational only).
    rubinR: number;
    // Rubin's R: ratio of matched treated propensity score variance to
    // matched control propensity score variance.
    // Rubin (2001) heuristic guidance: 0.5 < R < 2 suggests adequate variance overlap (informational only).
    // Both B and R are reported as informational diagnostics; they do not override SMD-based balance.
  };

  // 12. Warnings & Scientific Advisory Ledger
  warnings: Array<{
    code: 'WARN_SUSPECTED_SEPARATION' | 'WARN_OFF_SUPPORT' | 'WARN_CALIPER_ATTRITION' | 'WARN_RANK_DEFICIENT' | 'WARN_MISSING_EXCLUSION';
    // WARN_SUSPECTED_SEPARATION: one or more observable symptoms of complete or quasi-complete
    // separation detected (boundary probabilities, extreme SE, or IRLS divergence).
    // Definitive classification blocked pending CP-STAT-02 automated detector.
    message: string;
    severity: 'informational' | 'warning' | 'fatal';
    impactDescription: string;
  }>;

  // 13. Method Metadata for Reproduction
  methodProvenance: {
    rCallMatchIt: string;
    rCallCobalt: string;
    citationBibtexMatchIt: string;
    citationBibtexCobalt: string;
  };

  // 14. Publication Output Eligibility Gate
  publicationStatus: {
    verdict: 'PUBLICATION_ELIGIBLE' | 'REJECT_FOR_PUBLICATION' | 'NUMERICAL_FAILURE';
    reasons: string[];
    exportArtifactsAllowed: boolean;
  };
}
```

---

## 5. Outcome Blindness & Downstream Statistical Requirements

### 5.1 Strict Outcome Blindness
1. In accordance with Rubin (2007) and Stuart (2010), the matching protocol must be established and locked **blinded to all outcome data**.
2. Outcome variables must **never** be uploaded to the propensity model or balance evaluator.
3. Iterating on caliper widths or covariate specifications to optimize downstream treatment effect estimates is scientifically invalid (p-hacking).

### 5.2 Mandatory Downstream Outcome Analysis Guidance
All exports must include standard epidemiological guidance:
- Propensity score matching creates matched pairs; units within pairs are correlated.
- Downstream statistical modeling must account for pairing using paired tests (e.g., paired t-test, McNemar's test) or cluster-robust standard errors (`vcov = ~subclass` in R).
- Standard independent two-sample t-tests or unadjusted linear regression on the matched sample produce artificially deflated standard errors and invalid p-values.
