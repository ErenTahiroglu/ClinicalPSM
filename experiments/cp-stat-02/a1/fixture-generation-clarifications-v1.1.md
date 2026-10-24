# CP-STAT-02-A1 Fixture Generation Clarifications v1.1

**State:** Registered before any A1 fixture data or candidate-method results were generated.  
**Applies to:** The exact 50 fixture IDs, seeds, hypotheses, expected classes, and comparison rules in `preregistration-matrix-v1.json`.  
**Base generation contract:** `fixture-generation-contract-v1.md`, SHA-256 `f2b1197cdec12900552058b8614a4412bd4fcba0cf80f38b8eeb93b1714d44b9`.  
**Scope:** Deterministic implementation details only. No hypothesis, expected class, seed, or acceptance rule is changed.

## Required ID-specific mapping

- Include `x_cat` whenever the fixture ID or profile names a factor, sparse category, reference level, releveling, or categorical predictor. This explicitly includes `cpstat02a1_04_factor_nested_complete`, `cpstat02a1_08_boundary_scaled_relevelled`, and `cpstat02a1_34_factor_reference_complete`.
- `cpstat02a1_08_boundary_scaled_relevelled` uses factor levels `low`, `mid`, `high`, reference `high`, and scales `x1` by `1e3`.
- `cpstat02a1_03_unequal_classes_complete` uses `floor(n/9)` treated observations and the remainder controls, implementing the row's stated 1:8 treated/control allocation.
- `cpstat02a1_34_factor_reference_complete` uses levels `A`, `B`, `C`; controls receive `A`, treated rows receive `B` and `C` in deterministic alternation, and the reference level is `A`.
- `cpstat02a1_17_scale_and_small_margin` uses the intercept at scale 1, `x1` at scale `1e-4`, and `x2` at scale `1e4`. Its common-anchor `x1` width before scaling is `1e-4`. Do not add an undeclared `x3`.
- `cpstat02a1_25_near_exact_correlation` uses `x2 = x1 + 1e-6 z`; `cpstat02a1_50_weak_information_finite` uses `x2 = x1 + 1e-5 z`.
- `cpstat02a1_31_small_scale_complete` scales `x1` by `1e-6`; `cpstat02a1_32_large_scale_quasi` scales `x1` by `1e6`; `cpstat02a1_33_heterogeneous_scale_overlap` scales `x1` by `1e-5` and `x2` by `1e5`.
- Construct shared overlap anchors and duplicated opposite-label quasi-boundary rows before shifts or scaling. Apply each scale identically to duplicated rows.

These details disambiguate the matrix's construction text for the deterministic generator. If the implemented generator cannot satisfy both this clarification and a row's construction while preserving its independent witness, stop before producing results and report `GENERATOR_SPEC_AMBIGUITY`.
