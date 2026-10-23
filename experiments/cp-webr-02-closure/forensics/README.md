# CP-WEBR-02-CLOSURE-1-E2 forensic diagnostics

This directory contains diagnostic-only tooling for the frozen `fix_15_quasi_separation` and `fix_16_complete_separation` inputs. It does not generate or alter the candidate reference, run the 25-fixture qualification, modify application behavior, or change the comparator/tolerance.

## Reproducible execution

Run `.github/workflows/experiment-cp-webr-02-closure-e2.yml` manually on `development`. The workflow:

1. Verifies the exact E1 baseline is an ancestor, `main` is still pinned, and fixtures, historical assertions, native oracle, comparator, and R template are unchanged.
2. Runs the dependency-free `webr_result_schema.test.mjs` falsification tests before scientific execution.
3. Restores the existing native R provisioning lock, then creates a separate temporary `renv` project for `detectseparation` and its dependencies. Its `fs` build uses the package's documented bundled-libuv option inside this isolated diagnostic provisioner. The bootstrap uses an `renv` full-library snapshot and asserts that the lock contains detectseparation 0.4.0 and jsonlite 2.0.0. The generated diagnostic lock and official CRAN source archive SHA-256 manifest are uploaded. Once independently reviewed, they can be committed here for pinned reruns.
4. Runs native R 4.6.0 `glm` plus QR/covariance diagnostics in two fresh R processes. The separation check uses `detectseparation` 0.4.0, ROI/lpsolve, both its default `1e-4` feasibility tolerance and a prespecified `1e-8` sensitivity tolerance, and known separated/overlap controls. It assesses both fix15 and fix16 and requires an isolated GLM warning-capture positive control.
5. Builds the actual static app and runs two separate Chromium WebR 0.6.0/R 4.6.0 shadow runtimes using the built WebR assets. These are labelled `WEBR_DIAGNOSTIC_SHADOW_EXECUTION`, not production Worker results. Their estimates/standard errors are compared with the separately retained production Worker observations from CI run 39954671878. The pinned Emscripten version is reported from the existing dependency lock.
6. Emits full runtime JSON, a native/WebR comparison matrix, a Markdown interpretation report, source/package provenance, and an evidence archive SHA-256.

The WebR boundary validates the pinned `RObject.toJs({ depth: 0 })` shape before serialization. R list fields are checked by exact names; scalar fields are unwrapped only at declared scalar paths; atomic vectors remain arrays; matrices carry dimensions plus row/column labels and ordered rows. The artifact includes a bounded shape record with no scientific raw values. The comparator also supports v1 captured evidence through a strict, shape-only migration, so offline replay does not rerun either runtime or change numbers.

The diagnostics never adjust GLM fitting controls, inputs, formula, matching configuration, source row order, or tolerance. Independent information-matrix inversions are marked diagnostic-only; they do not replace the covariance derived from the stored GLM QR state.

## fix15 contract erratum proposal (not implemented)

Proposed contract version: `CP-WEBR-02 closure comparator contract vNext / E2-ERRATUM-1`.

- Preserve the original fixture manifest (`SUCCESS_WITH_WARNING` / `SEPARATION_WARNING`) and 02A assertion matrix (`OUTPUT_READY`) unchanged.
- Store the historical expectation and observed runtime outcome separately.
- Supersede only the comparator assertion that requires every `SUCCESS_WITH_WARNING` manifest row to produce an application warning or numerical-instability safeguard.
- If the independent LP result is overlap, reclassify the old warning expectation as an unsupported historical assumption, without rewriting prior records. If it is separation, retain the semantic risk label while distinguishing it from an observed runtime warning.
- Add a negative control that begins with a known genuine runtime warning, removes that warning from the captured ledger, and asserts that the comparator fails.

## fix16 numerical contract proposal (not implemented)

Keep the frozen absolute tolerance `1e-4` and all existing three failure records. Do not introduce a relative-tolerance allowance. If independent Red Team review accepts an erratum, the complete-separation fixture may retain coefficients, covariance values, and standard errors as observable diagnostics while classifying affected inference fields as non-certifying under the non-existent finite-MLE condition. Exact model matrix, row identity, treatment, pair/weight structure, unaffected numeric quantities, and the fail-closed publication restriction remain required. The exception must apply only to the validated separated model and must require independent mathematical evidence.

## Primary methodology sources

- [R `glm`](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/glm.html), [R `vcov`](https://search.r-project.org/R/refmans/stats/html/vcov.html), and [R `summary.glm`](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/summary.glm.html).
- [`detectseparation` reference](https://search.r-project.org/CRAN/refmans/detectseparation/html/detect_separation.html) and [package documentation](https://ikosmidis.r-universe.dev/detectseparation).
- Konis (2007), [linear-programming algorithms for separated data](https://ora.ox.ac.uk/objects/uuid:8f9ee0d0-d78e-4101-9ab4-f9cbceed2a2a); Silvapulle (1981), [existence of binomial-response MLEs](https://www.jstor.org/stable/2984941); Kosmidis and Firth (2021), [finiteness and shrinkage under separation](https://doi.org/10.1093/biomet/asaa052).
