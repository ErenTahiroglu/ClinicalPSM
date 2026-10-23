import fs from 'node:fs';
import path from 'node:path';

function parseArgs(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--comparison', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: render_report.mjs --comparison <json> --output <new-md>');
    values[args[i].slice(2)] = path.resolve(args[i + 1]);
  }
  if (!values.comparison || !values.output) throw new Error('Usage: render_report.mjs --comparison <json> --output <new-md>');
  if (fs.existsSync(values.output)) throw new Error(`Refusing to overwrite report: ${values.output}`);
  return values;
}
function fmt(value) {
  if (value === null || value === undefined) return '`UNMEASURED`';
  if (typeof value === 'number') return '`' + value.toPrecision(17) + '`';
  if (typeof value === 'boolean') return '`' + value + '`';
  return '`' + String(value).replaceAll('`', '\\`') + '`';
}
function seRows(report) {
  const rows = report.fix16_native_webr.coefficient_and_standard_error_matrix;
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    seen.add(row.term);
    out.push({ field: `${row.term} standard error`, native: row.native_standard_error, webr: row.webr_standard_error,
      native_variance: row.native_covariance_diagonal, webr_variance: row.webr_covariance_diagonal,
      native_vcov_se: row.native_se_recomputed_from_vcov, webr_vcov_se: row.webr_se_recomputed_from_vcov,
      absolute: row.standard_error_absolute_difference, relative: row.standard_error_relative_difference, status: row.frozen_standard_error_result });
  }
  const intercept = rows.find(row => row.term === '(Intercept)');
  out.push({ field: 'Maximum standard error (same as intercept)', native: intercept?.native_standard_error,
    webr: intercept?.webr_standard_error, absolute: intercept?.standard_error_absolute_difference,
    relative: intercept?.standard_error_relative_difference, status: intercept?.frozen_standard_error_result });
  return out;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const r = JSON.parse(fs.readFileSync(args.comparison, 'utf8'));
  const sep = r.fix15_separation_assessment;
  const classification = sep.scientific_classification || {};
  const se = seRows(r);
  const covariance = r.fix16_native_webr.covariance_cell_comparison;
  const hypotheses = r.hypothesis_assessment;
  const nativeEnv = r.native_environment || {};
  const webEnv = r.webr_environment || {};
  const lines = [
    '# CP-WEBR-02-CLOSURE-1-E2 diagnostic report',
    '',
    `Evidence class: **${r.evidence_classification}**`,
    'Commit: `' + r.commit_sha + '`',
    `Workflow gate: **${r.workflow_gate_status}**`,
    'Candidate native reference: `' + r.frozen_assets.candidate_native_reference_sha256 + '` — ' + r.frozen_assets.candidate_native_reference_status + '.',
    '',
    '## fix15 separation assessment',
    '',
    `The diagnostic result is **overall separation ${classification.overall || 'INDETERMINATE'}; complete ${classification.complete || 'INDETERMINATE'}; quasi-complete ${classification.quasi || 'INDETERMINATE'}**. Controls: LP positive/negative ${sep.positive_and_negative_controls_status}; fix16 complete-separation control ${sep.fix16_complete_separation_confirmation}; target tolerance stability ${sep.target_tolerance_stability}; warning-capture positive control ${sep.warning_capture_positive_control?.capture_status || 'UNMEASURED'}.`,
    '',
    '| LP feasibility tolerance | Overall | Complete | Quasi-complete |',
    '|---:|---|---|---|',
    ...(sep.target || []).map(row => `| ${fmt(row.tolerance)} | ${row.overall} | ${row.complete} | ${row.quasi} |`),
    '',
    'The official `detectseparation` 0.4.0 assessment uses Konis linear programming through ROI/lpsolve and requests its documented additional LP for distinguishing complete from quasi-complete separation. A finite coefficient from ordinary `glm` is not used as a separation test. Package version, solver, tolerance, model-matrix columns, rows, response and solver output are in the accompanying native JSON.',
    '',
    '| Treatment by x_quasi | x_quasi=0 | x_quasi=1 |',
    '|---|---:|---:|',
    ...(r.fix15_native_webr.native_association_structure?.treatment_by_x_quasi?.values || []).map((values, index) => `| treat=${r.fix15_native_webr.native_association_structure.treatment_by_x_quasi.row_names[index]} | ${values[0]} | ${values[1]} |`),
    '',
    'The accompanying native record gives the exact model-matrix row identities and x_norm ranges within each x_quasi level. These observed summaries do not themselves prove or disprove separation.',
    '',
    `Warning-contract reconciliation: **${r.fix15_warning_contract_reconciliation.interpretation}**. The frozen manifest expects \`${r.fix15_warning_contract_reconciliation.original_manifest}\`; the archived 02A matrix records \`${r.fix15_warning_contract_reconciliation.historical_02a_assertion_matrix}\`. The LP-based proposed interpretation is **${r.fix15_warning_contract_reconciliation.suggested_interpretation_from_lp}**. The archived candidate native warning ledger, fresh direct native GLM warnings, and production Worker runtime warnings are recorded separately; MatchIt/cobalt were not invoked in the direct GLM diagnostic.`,
    '',
    `Proposed future falsification: ${r.fix15_warning_contract_reconciliation.required_future_falsification}`,
    '',
    'No manifest, historical matrix or comparator assertion is changed by this diagnostic.',
    '',
    '## fix16 covariance and standard errors',
    '',
    `Native R: ${fmt(nativeEnv.r_version)}; BLAS/LAPACK evidence is in the full diagnostic. WebR: ${fmt(webEnv.r_version)}; its available numerical libraries are recorded separately. Repeated-run checks: native ${r.repeatability.native.status}; WebR ${r.repeatability.webr.status}. Production Worker shadow comparison: ${r.production_worker_shadow_comparison.map(x => `${x.fixture} ${x.status}`).join('; ')}.`,
    '',
    '| Field | Native R | WebR shadow | Native covariance diagonal | WebR covariance diagonal | Native SE from vcov | WebR SE from vcov | Absolute difference | Relative difference | Frozen 1e-4 result |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|',
    ...se.map(row => `| ${row.field} | ${fmt(row.native)} | ${fmt(row.webr)} | ${fmt(row.native_variance)} | ${fmt(row.webr_variance)} | ${fmt(row.native_vcov_se)} | ${fmt(row.webr_vcov_se)} | ${fmt(row.absolute)} | ${fmt(row.relative)} | **${row.status}** |`),
    '',
    'Full 2×2 `vcov()` cell comparisons, `summary.glm()` covariance matrices, QR factors, pivots, weights, fitted probabilities, and both raw and column-scaled conditioning metrics are in `covariance-comparison.json` and the two runtime JSON files.',
    '',
    '| Covariance cell | Native R | WebR shadow | Absolute difference | Relative difference |',
    '|---|---:|---:|---:|---:|',
    ...covariance.map(row => `| ${row.row_term} × ${row.column_term} | ${fmt(row.native)} | ${fmt(row.webr)} | ${fmt(row.absolute_difference)} | ${fmt(row.relative_difference)} |`),
    '',
    'The frozen contract remains absolute difference ≤ 0.0001. No relative-tolerance exception or PASS conversion is applied. Complete separation means the likelihood has no finite maximum; numerical termination of IWLS does not establish a finite MLE or certifying asymptotic standard errors. The existing application publication restriction remains required.',
    '',
    '## Hypothesis status',
    '',
    '| Hypothesis | Evidence status |',
    '|---|---|',
    ...hypotheses.map(item => `| ${item.hypothesis} | ${item.status}; causal attribution ${item.causal_attribution || item.causal_attribution_for_cross_engine_delta || 'not established'} |`),
    '',
    'Backend causality is not claimed without an intervention. Native R reports its actual BLAS/LAPACK. WebR reports what the WebAssembly runtime exposes; unavailable items remain `UNMEASURED`. The two WebR shadow runs do not substitute for the already recorded actual production Dedicated Worker evidence.',
    '',
    '## Scope and retained evidence',
    '',
    '- Diagnostic outputs are research evidence, not approved golden reference data.',
    '- The existing candidate reference was not regenerated, overwritten or frozen.',
    '- The existing comparator, 25-fixture results and frozen tolerance were not changed.',
    '- The WebR diagnostics are explicitly `WEBR_DIAGNOSTIC_SHADOW_EXECUTION`; production Worker observations are separately anchored to CI run 39954671878.',
    '- No production statistical semantics, frozen fixture, manifest, assertion matrix, or authoritative template changed.',
    '',
    '## Primary methods references',
    '',
    '- [R `glm` documentation](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/glm.html)',
    '- [R `vcov` documentation](https://search.r-project.org/R/refmans/stats/html/vcov.html)',
    '- [`detectseparation` linear-programming definitions and controls](https://search.r-project.org/CRAN/refmans/detectseparation/html/detect_separation.html)',
    '- [`detectseparation` package documentation and references](https://ikosmidis.r-universe.dev/detectseparation)',
    '- [Konis (2007), linear programming algorithms for detecting separated data](https://ora.ox.ac.uk/objects/uuid:8f9ee0d0-d78e-4101-9ab4-f9cbceed2a2a)',
    '- [Silvapulle (1981), existence of maximum likelihood estimators for binomial response models](https://www.jstor.org/stable/2984941)',
    '- [Kosmidis and Firth (2021), finiteness under separation](https://doi.org/10.1093/biomet/asaa052)',
    ''
  ];
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${lines.join('\n')}\n`, { flag: 'wx' });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
