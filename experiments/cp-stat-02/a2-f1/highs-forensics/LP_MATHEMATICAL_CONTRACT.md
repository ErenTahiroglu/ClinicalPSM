# Preregistered LP Mathematical Contract

**Version:** 1
**Status:** pending independent review; no solver execution.
**Applies only to:** the archived full-precision fixture 31 and 33 matrices identified in `HIGHS_PREREGISTRATION-v1.md`.

## Input notation and integrity conditions

Let the exact archived matrix be (X\in\mathbb{Q}^{n\times p}), in the recorded row and column order, including the intercept column, and let (y_i\in\{0,1\}) be its paired archived treatment response. The exact decimal strings define the rational source values for certificate checking. The SciPy solve will use their one-time binary64 parse; it will not recreate values from the lower-precision fixture CSV or a random seed.

Define (s_i=2y_i-1\in\{-1,+1\}) and the signed design (Z=\operatorname{diag}(s)X). A coefficient direction includes the intercept coefficient and every archived model-matrix column. The expected class is not an input to either LP.

Before any solver call, require exact hashes for the source artifact and members, exact row IDs and order, exact response linkage, exact column names/order, the factor/reference/contrast metadata in the proof manifest, and the two matrix hashes. A failed identity or shape check is an integrity rejection before numerical classification.

## Mathematical states

- **Complete separation:** there exists (\beta\ne0) such that (Z\beta\) is strictly positive in every row.
- **Weak separation:** there exists (\beta\ne0) such that (Z\beta\ge0) in every row and at least one component is strictly positive. This category includes complete separation; quasi-complete separation is weak separation without complete separation.
- **No separation:** there is no weak separating direction. For a full-column-rank design this implies a finite, unique logistic MLE under the standard finite-dimensional binomial logistic model. If (X) is rank deficient, coefficient identifiability and uniqueness must be reported separately; no-separation alone does not cure rank deficiency.
- **Numerical uncertainty:** solver termination, residuals, or returned margins do not meet the preregistered verification conditions. It is not a mathematical class and is never coerced to “overlap.”

Separation of this treatment-assignment model is not a test of causal population positivity, adequate matching balance, matched-pair availability, or publishability.

## Problem A — complete-separation margin

The future implementation maximizes the common signed margin:

\[
\begin{aligned}
\max_{\beta,t}\quad & t\\
\text{subject to}\quad & Z\beta\ge t\mathbf 1,\\
& -1\le\beta_j\le1\quad(j=1,\ldots,p),\\
& t\ge0.
\end{aligned}
\]

For SciPy's minimization API, minimize (-t), encode (-Z\beta+t\mathbf1\le0), use bounds ([-1,1]) for each coefficient and ([0,+\infty)) for (t). The intercept is included in (\beta); no separate or implicit intercept is added.

The coefficient bound is an existence-preserving normalization, not a restriction on the mathematical model. If an unbounded nonzero direction (\beta_0) has all signed margins positive, (c=\|\beta_0\|_\infty>0) and (\beta=\beta_0/c) lies in the box while every margin remains positive. Choosing (t=\min_i(Z_i\beta)>0) is feasible. Conversely, any feasible solution with (t>0) is a complete-separation witness. The coefficient cube is compact and (Z\) is finite, so the maximum (t\) is finite. Thus the exact mathematical optimum is positive if and only if complete separation exists.

The zero vector makes (t=0) feasible. Therefore an optimum at zero does not represent a separating direction. A numerical objective near zero is not proof that the exact optimum is zero.

## Problem B — weak-separation objective

The future implementation maximizes total signed margin subject to nonnegative margins:

\[
\begin{aligned}
\max_{\beta}\quad & \mathbf1^T Z\beta\\
\text{subject to}\quad & Z\beta\ge0,\\
& -1\le\beta_j\le1\quad(j=1,\ldots,p).
\end{aligned}
\]

For SciPy, minimize (-\mathbf1^TZ\beta), encode (-Z\beta\le0), and bound every coefficient to ([-1,1]). The zero vector is feasible with objective zero, so the optimum cannot be negative in exact arithmetic.

This objective distinguishes a meaningful weak separator from a nonzero null-space vector. If a weak separator (\beta_0\) exists, scale it by (c=\|\beta_0\|_\infty>0); its scaled direction stays in the box, keeps all margins nonnegative, and retains at least one positive margin. Its objective is positive. Conversely, a feasible direction with a positive objective and all margins nonnegative has at least one positive margin and cannot be zero, so it is a weak separator. If the maximum is exactly zero, no weak separator exists. A rank-deficient null direction may be nonzero but has zero margins and objective; it is not a weak separator.

## Preregistered fixed column scaling

The primary representation is the unmodified archived matrix. A second representation divides each column (j) by (d_j=\max_i|X_{ij}|>0), without centering or reordering: (X'=XD^{-1}), (D=\operatorname{diag}(d_j)). If (\gamma=D\beta), then (X'\gamma=X\beta). Since (D) is invertible, every direction in either parameterization maps to a direction in the other; subsequent positive scaling puts the mapped direction in the coefficient box. Exact separation existence is unchanged. A zero (d_j) fails identity/rank preflight and is not replaced with a fabricated value.

More generally, an invertible positive diagonal column transformation only reparameterizes (\beta). Multiplication of each row by any strictly positive scalar preserves the sign of that row's signed margin. Therefore positive diagonal row scaling also preserves exact separation existence. Neither transformation preserves a finite-precision solver's residual sizes or a package's decision threshold. The experiment has no row scaling; it has only the fixed raw and column-max representations above.

## Classification and evidence boundary

The mathematical relationships are:

| Exact property | Problem A | Problem B | Required separate check |
| --- | --- | --- | --- |
| Complete separation | optimum (>0) | optimum (>0) | positive signed-margin witness |
| Quasi-complete separation | optimum (=0) | optimum (>0) | weak witness and no-complete certificate |
| No weak separation | optimum (=0) | optimum (=0) | full-rank/identifiability assessment for uniqueness |
| Rank deficient | may have a null direction | null directions alone have objective 0 | exact or preregistered rank check; report nonuniqueness separately |
| LP numerical uncertainty | no decisive exact value | no decisive exact value | `NUMERICAL_RESULT_INCONCLUSIVE` |

The exact equivalences above concern the mathematical LP over the archived matrix. HiGHS operates in finite precision. In the next stage, a positive returned solution is only a certificate after its coefficients are independently checked against original decimal tokens (the binary64 coefficients are represented exactly via their integer ratios). A returned objective of zero or near zero, solver `success`, or agreement between `highs-ds` and `highs-ipm` cannot alone prove absence of a separator. Such a negative claim requires validated optimality/dual information and must remain consistent with the accepted #6 exact proof. A failed or ambiguous dual check leaves the solver-level result inconclusive.

For fixture 31, the accepted exact proof already verifies all signed margins for the preregistered direction (\beta=(0,1,0)) as strictly positive on the archived column order. For fixture 33, the accepted exact proof verifies three opposite-response common-anchor pairs whose matrix spans the full model-matrix column space; each pair forces its anchor-row inner product to zero for any weak separator, excluding any positive signed margin. Those historical proofs are evidence references, not solver inputs or altered expectations.

## Limits

These LPs adjudicate separation existence in the exact archived design. They do not establish causal positivity in a target population, estimand validity, balance adequacy, or product safety. They do not qualify a general-purpose detector. The original A1 failure matrix and package thresholds remain untouched.
