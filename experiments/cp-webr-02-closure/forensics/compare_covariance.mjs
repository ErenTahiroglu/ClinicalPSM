import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const forensics = path.join(root, 'experiments/cp-webr-02-closure/forensics');

function fail(message) { throw new Error(message); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function parseArgs(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--native-1', '--native-2', '--webr-1', '--webr-2', '--output'].includes(key) || !args[i + 1]) {
      fail('Usage: compare_covariance.mjs --native-1 <json> --native-2 <json> --webr-1 <json> --webr-2 <json> --output <new-json>');
    }
    values[key.slice(2)] = path.resolve(args[i + 1]);
  }
  for (const name of ['native-1', 'native-2', 'webr-1', 'webr-2', 'output']) if (!values[name]) fail(`Missing --${name}`);
  if (fs.existsSync(values.output)) fail(`Refusing to overwrite comparison report: ${values.output}`);
  return values;
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function fixtureFromNative(run, id) { return run.fixtures?.[id] || fail(`Missing native fixture ${id}`); }
function fixtureFromWebR(run, id) { return run.fixtures?.find(item => item.id === id) || fail(`Missing WebR fixture ${id}`); }
function matrixValues(record) { return (record?.values || []).map(row => row.map(Number)); }
function mapNamed(record) {
  const names = record?.names || [];
  const values = record?.values || [];
  return Object.fromEntries(names.map((name, index) => [name, values[index] ?? null]));
}
function absDiff(a, b) { return Math.abs(Number(a) - Number(b)); }
function relativeDiff(a, b) {
  const denominator = Math.abs(Number(a));
  return denominator === 0 ? null : absDiff(a, b) / denominator;
}
function summarizeFit(fixture) {
  return {
    coefficients: mapNamed(fixture.glm.coefficients),
    se_from_vcov: mapNamed(fixture.glm.se_from_vcov),
    vcov: matrixValues(fixture.glm.vcov),
    summary_coefficients: matrixValues(fixture.glm.summary_coefficients),
    covariance_unscaled: matrixValues(fixture.glm.covariance_unscaled),
    covariance_scaled: matrixValues(fixture.glm.covariance_scaled),
    converged: fixture.glm.fit_converged ?? fixture.glm.converged,
    iter: fixture.glm.iter,
    rank: fixture.glm.rank,
    deviance: fixture.glm.deviance,
    null_deviance: fixture.glm.null_deviance,
    fitted_values: fixture.glm.fitted_values?.values,
    fitted_probability_range: fixture.glm.fitted_probability_range,
    linear_predictors: fixture.glm.linear_predictors?.values,
    working_weights: fixture.glm.working_weights?.values,
    prior_weights: fixture.glm.prior_weights?.values,
    warnings: fixture.glm.warnings
  };
}
function stableRunEquality(first, second, engine) {
  const fixtures = ['fix_15_quasi_separation', 'fix_16_complete_separation'];
  const comparisons = fixtures.map(id => {
    const a = engine === 'native' ? fixtureFromNative(first, id) : fixtureFromWebR(first, id);
    const b = engine === 'native' ? fixtureFromNative(second, id) : fixtureFromWebR(second, id);
    const sameFit = JSON.stringify(summarizeFit(a)) === JSON.stringify(summarizeFit(b));
    const sameMatrix = hash(a.model_matrix) === hash(b.model_matrix);
    return { fixture: id, identical_numeric_state: sameFit, identical_model_matrix: sameMatrix, status: sameFit && sameMatrix ? 'PASS' : 'FAIL' };
  });
  return { engine, fresh_runtime_replicates: 2, comparisons, status: comparisons.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL' };
}
function engineComparison(native, webr, id) {
  const n = engineFixture(native, id);
  const w = engineFixture(webr, id);
  const nm = n.model_matrix;
  const wm = w.model_matrix;
  const nValues = matrixValues(nm.values);
  const wValues = matrixValues(wm.values);
  const nResponseNames = nm.response?.names || [];
  const wResponseNames = wm.response?.names || [];
  const nResponseValues = nm.response?.values || [];
  const wResponseValues = wm.response?.values || [];
  const matrixIdentity = {
    native_hash: hash({ row_ids: nm.row_ids || nm.row_names, columns: nm.columns || nm.column_names, values: nValues, response_names: nResponseNames, response: nResponseValues }),
    webr_hash: hash({ row_ids: wm.row_ids || wm.row_names, columns: wm.columns || wm.column_names, values: wValues, response_names: wResponseNames, response: wResponseValues }),
    row_ids_equal: JSON.stringify(nm.row_ids || nm.row_names) === JSON.stringify(wm.row_ids || wm.row_names),
    columns_equal: JSON.stringify(nm.columns || nm.column_names) === JSON.stringify(wm.columns || wm.column_names),
    exact_values_equal: JSON.stringify(nValues) === JSON.stringify(wValues),
    response_names_equal: JSON.stringify(nResponseNames) === JSON.stringify(wResponseNames),
    response_values_equal: JSON.stringify(nResponseValues) === JSON.stringify(wResponseValues)
  };
  const nativeCov = matrixValues(n.glm.vcov);
  const webCov = matrixValues(w.glm.vcov);
  const terms = n.glm.vcov.column_names || nm.columns;
  const covarianceCells = [];
  for (let i = 0; i < Math.min(nativeCov.length, webCov.length); i++) {
    for (let j = 0; j < Math.min(nativeCov[i]?.length || 0, webCov[i]?.length || 0); j++) {
      const nv = nativeCov[i][j], wv = webCov[i][j];
      covarianceCells.push({ row_term: terms?.[i] ?? String(i), column_term: terms?.[j] ?? String(j),
        native: nv, webr: wv, absolute_difference: absDiff(nv, wv), relative_difference: relativeDiff(nv, wv) });
    }
  }
  const nativeSummaryRows = n.glm.summary_coefficients.values || [];
  const webSummaryRows = w.glm.summary_coefficients.values || [];
  const nativeTerms = n.glm.summary_coefficients.row_names || [];
  const webTerms = w.glm.summary_coefficients.row_names || [];
  const nativeColumns = n.glm.summary_coefficients.column_names || [];
  const webColumns = w.glm.summary_coefficients.column_names || [];
  const nativeSeFromVcov = mapNamed(n.glm.se_from_vcov);
  const webSeFromVcov = mapNamed(w.glm.se_from_vcov);
  const table = [];
  for (let i = 0; i < Math.min(nativeSummaryRows.length, webSummaryRows.length); i++) {
    const term = nativeTerms[i] ?? webTerms[i] ?? String(i);
    const ni = nativeSummaryRows[i], wi = webSummaryRows[i];
    const coefficientIndex = nativeColumns.indexOf('Estimate');
    const seIndex = nativeColumns.indexOf('Std. Error');
    const webrCoefficientIndex = webColumns.indexOf('Estimate');
    const webrSeIndex = webColumns.indexOf('Std. Error');
    const nEstimate = ni[coefficientIndex], wEstimate = wi[webrCoefficientIndex];
    const nSe = ni[seIndex], wSe = wi[webrSeIndex];
    const covarianceIndex = (n.glm.vcov.column_names || []).indexOf(term);
    const nativeVariance = nativeCov[covarianceIndex]?.[covarianceIndex];
    const webVariance = webCov[covarianceIndex]?.[covarianceIndex];
    const nativeVcovSe = nativeSeFromVcov[term];
    const webVcovSe = webSeFromVcov[term];
    table.push({ term, native_estimate: nEstimate, webr_estimate: wEstimate,
      estimate_absolute_difference: absDiff(nEstimate, wEstimate), estimate_relative_difference: relativeDiff(nEstimate, wEstimate),
      native_standard_error: nSe, webr_standard_error: wSe,
      native_covariance_diagonal: nativeVariance, webr_covariance_diagonal: webVariance,
      native_se_recomputed_from_vcov: nativeVcovSe, webr_se_recomputed_from_vcov: webVcovSe,
      native_summary_se_matches_vcov_diagonal: Math.abs(nSe - nativeVcovSe) <= 1e-12,
      webr_summary_se_matches_vcov_diagonal: Math.abs(wSe - webVcovSe) <= 1e-12,
      standard_error_absolute_difference: absDiff(nSe, wSe), standard_error_relative_difference: relativeDiff(nSe, wSe),
      frozen_absolute_tolerance: 0.0001,
      frozen_standard_error_result: absDiff(nSe, wSe) <= 0.0001 ? 'PASS' : 'FAIL' });
  }
  const nFac = n.factorization || {};
  const wFac = w.factorization || {};
  return {
    fixture: id,
    model_matrix_identity: matrixIdentity,
    native_environment: n.environment || native.runtime?.r_environment || null,
    webr_environment: w.environment || webr.runtime?.r_environment || null,
    native_fit: summarizeFit(n),
    webr_fit: summarizeFit(w),
    coefficient_and_standard_error_matrix: table,
    covariance_cell_comparison: covarianceCells,
    qr_comparison: {
      native_rank: nFac.qr_rank,
      webr_rank: wFac.qr_rank,
      native_pivot: nFac.pivot,
      webr_pivot: wFac.pivot,
      native_r_factor: nFac.r_factor,
      webr_r_factor: wFac.r_factor,
      native_qr_covariance_matches_summary: nFac.qr_covariance_reconstruction_matches_unscaled,
      webr_qr_covariance_matches_summary: wFac.qr_covariance_reconstruction_matches_unscaled
    },
    conditioning: {
      native: nFac.condition || null,
      webr: wFac.condition || null
    },
    native_association_structure: n.association_structure || null,
    comparison_status: matrixIdentity.row_ids_equal && matrixIdentity.columns_equal && matrixIdentity.exact_values_equal &&
      matrixIdentity.response_names_equal && matrixIdentity.response_values_equal ? 'MODEL_MATRIX_AND_RESPONSE_MATCH' : 'MODEL_MATRIX_MISMATCH'
  };
}
function engineFixture(run, id) {
  return run.fixtures?.[id] || run.fixtures?.find(item => item.id === id) || fail(`Fixture not found: ${id}`);
}
function productionAnchorComparison(webRuns, anchors) {
  return anchors.fixtures.map(anchor => {
    const run = webRuns[0];
    const shadow = fixtureFromWebR(run, anchor.id);
    const shadowCoefficients = mapNamed(shadow.glm.coefficients);
    const shadowSes = mapNamed(shadow.glm.se_from_vcov);
    const terms = anchor.coefficients.map(entry => {
      const estimate = shadowCoefficients[entry.term];
      const se = shadowSes[entry.term];
      return { term: entry.term, production_estimate: entry.estimate, shadow_estimate: estimate,
        estimate_absolute_difference: absDiff(entry.estimate, estimate),
        production_standard_error: entry.standard_error, shadow_standard_error: se,
        standard_error_absolute_difference: absDiff(entry.standard_error, se),
        exact_estimate_match: Object.is(entry.estimate, estimate), exact_standard_error_match: Object.is(entry.standard_error, se) };
    });
    const sameIter = anchor.iterations === shadow.glm.iter;
    const sameConvergence = anchor.converged === (shadow.glm.fit_converged ?? shadow.glm.converged);
    const sameWarnings = JSON.stringify(anchor.glm_runtime_warnings) === JSON.stringify(shadow.glm.warnings);
    return { fixture: anchor.id, source_run: anchor.run_id, terms, same_iterations: sameIter,
      same_convergence: sameConvergence, same_r_runtime_warnings: sameWarnings,
      production_application_policy_warning_codes: anchor.application_policy_warning_codes,
      publication_verdict_preserved_as_anchor: anchor.publication_verdict,
      status: terms.every(term => term.exact_estimate_match && term.exact_standard_error_match) && sameIter && sameConvergence && sameWarnings ? 'PASS' : 'FAIL' };
  });
}
function separationControlStatus(native) {
  const assessments = native.separation_assessment;
  const pick = value => assessments?.[value]?.map(entry => ({ tolerance: entry.detector.feasibility_tolerance,
    overall: entry.overall_separation, complete: entry.complete_separation, quasi: entry.quasi_complete_separation,
    finite: entry.finite_mle_by_coefficient }));
  const target = pick('target');
  const fix16 = pick('fix_16_known_complete_fixture');
  const positive = pick('positive_control_known_complete');
  const negative = pick('negative_control_known_overlap');
  const warningPositive = assessments?.warning_capture_positive_control;
  const controlsPass = positive?.every(item => item.overall === 'YES' && item.complete === 'YES' && item.quasi === 'NO') &&
    negative?.every(item => item.overall === 'NO' && item.complete === 'NO' && item.quasi === 'NO') &&
    warningPositive?.capture_status === 'PASS' && (warningPositive.captured_warnings || []).length > 0;
  const targetConsistent = target?.length === 2 && target.every(item => item.overall !== 'INDETERMINATE') &&
    new Set(target.map(item => `${item.overall}/${item.complete}/${item.quasi}`)).size === 1;
  const fix16CompleteConfirmed = fix16?.length === 2 && fix16.every(item => item.overall === 'YES' && item.complete === 'YES' && item.quasi === 'NO');
  const classification = targetConsistent ? target[0] : { overall: 'INDETERMINATE' };
  const warningExpectationInterpretation = classification.overall === 'NO'
    ? 'PROPOSE_UNSUPPORTED_HISTORICAL_WARNING_EXPECTATION; no separation detected for the exact frozen model at both declared LP tolerances'
    : classification.overall === 'YES'
      ? 'RETAIN_SEMANTIC_RISK_LABEL_BUT_DISTINGUISH_IT_FROM_OBSERVED_RUNTIME_WARNING'
      : 'SCIENTIFICALLY_UNRESOLVED';
  return { target, fix16_known_complete_fixture: fix16, positive_control: positive, negative_control: negative,
    warning_capture_positive_control: warningPositive,
    positive_and_negative_controls_status: controlsPass ? 'PASS' : 'FAIL',
    fix16_complete_separation_confirmation: fix16CompleteConfirmed ? 'PASS' : 'FAIL',
    target_tolerance_stability: targetConsistent ? 'PASS' : 'FAIL',
    scientific_classification: classification,
    warning_expectation_interpretation: warningExpectationInterpretation };
}
function classifyHypotheses(fix16) {
  const n = fix16.native_fit, w = fix16.webr_fit;
  const exactEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const nativeCondition = fix16.conditioning.native?.weighted_model_matrix?.value;
  const webrCondition = fix16.conditioning.webr?.weighted_model_matrix?.value;
  return [
    { hypothesis: 'different_final_IRLS_weights_or_fitted_values', status: exactEqual(n.working_weights, w.working_weights) && exactEqual(n.fitted_values, w.fitted_values) ? 'REFUTED_AS_AN_OBSERVED_DIFFERENCE' : 'SUPPORTED_AS_AN_OBSERVED_DIFFERENCE', causal_attribution: 'UNRESOLVED' },
    { hypothesis: 'weighted_model_matrix_conditioning_is_material', status: Math.max(Number(nativeCondition), Number(webrCondition)) > 1e8 ? 'SUPPORTED_AS_NUMERICAL_RISK' : 'UNRESOLVED', native_condition_number: nativeCondition, webr_condition_number: webrCondition, causal_attribution: 'UNRESOLVED' },
    { hypothesis: 'QR_factorization_states_differ', status: exactEqual(fix16.qr_comparison.native_r_factor, fix16.qr_comparison.webr_r_factor) && exactEqual(fix16.qr_comparison.native_pivot, fix16.qr_comparison.webr_pivot) ? 'REFUTED_AS_AN_OBSERVED_DIFFERENCE' : 'SUPPORTED_AS_AN_OBSERVED_DIFFERENCE', causal_attribution: 'UNRESOLVED' },
    { hypothesis: 'BLAS_LAPACK_or_floating_point_backend_causes_delta', status: 'UNRESOLVED', reason: 'Native/WebR environment identity differs, but this workflow does not isolate a backend intervention.' },
    { hypothesis: 'serialization_causes_delta', status: 'UNRESOLVED', reason: 'Full precision source-runtime quantities are recorded; production payload values are also compared, but no serialization intervention is performed.' },
    { hypothesis: 'complete_separation_removes_finite_MLE_and_certifying_asymptotic_SE', status: 'SUPPORTED_BY_INDEPENDENT_SEPARATION_ASSESSMENT', causal_attribution_for_cross_engine_delta: 'NOT_ESTABLISHED' }
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const native1 = readJson(args['native-1']);
  const native2 = readJson(args['native-2']);
  const webr1 = readJson(args['webr-1']);
  const webr2 = readJson(args['webr-2']);
  const anchors = readJson(path.join(forensics, 'production-worker-observations.json'));
  if (anchors.source?.workflow_run_id !== '39954671878' ||
      anchors.source?.commit_sha !== '1ca14f6ab3c41d1ba366db0adda22102acc90a3c' ||
      anchors.source?.evidence_file_sha256 !== '5521d2b73b223dc9939f97f1547439685f6d0b9052d4113ac0049e2aba3dbeb7' ||
      anchors.native_candidate_observations?.candidate_reference_sha256 !== 'ea05ce912fb03dd86f09cb779b60bd795284372d089a05a9e0124f17e766eedb') {
    fail('Preserved production/native candidate evidence provenance does not match the reviewed E1 anchors');
  }
  if (native1.replicate !== 1 || native2.replicate !== 2 ||
      !webr1.runs?.some(run => run.replicate === 1) || !webr2.runs?.some(run => run.replicate === 2)) fail('Replicate identity mismatch');
  for (const run of [native1, native2]) if (run.evidence_classification !== 'RESEARCH_DIAGNOSTIC_NOT_APPROVED_GOLDEN_REFERENCE') fail('Native evidence classification is invalid');
  for (const run of [webr1, webr2]) if (run.runs?.[0]?.evidence_classification !== 'WEBR_DIAGNOSTIC_SHADOW_EXECUTION') fail('WebR evidence is not labeled as shadow execution');
  const webRunOne = webr1.runs?.find(run => run.replicate === 1) || webr1.runs?.[0];
  const webRunTwo = webr2.runs?.find(run => run.replicate === 2) || webr2.runs?.[1];
  if (!webRunOne || !webRunTwo) fail('Two fresh WebR shadow runs are required');
  const nativeStability = stableRunEquality(native1, native2, 'native');
  const webStability = stableRunEquality(webRunOne, webRunTwo, 'webr');
  const selectedNative = native1;
  const selectedWebR = webRunOne;
  const fix15 = engineComparison(selectedNative, selectedWebR, 'fix_15_quasi_separation');
  const fix16 = engineComparison(selectedNative, selectedWebR, 'fix_16_complete_separation');
  const anchorsComparison = productionAnchorComparison([selectedWebR], anchors);
  const separation = separationControlStatus(selectedNative);
  const results = [fix15, fix16];
  const failures = [];
  if (nativeStability.status !== 'PASS') failures.push('native_runs_not_identical');
  if (webStability.status !== 'PASS') failures.push('webr_runs_not_identical');
  if (results.some(row => row.comparison_status !== 'MODEL_MATRIX_AND_RESPONSE_MATCH')) failures.push('model_matrix_or_response_mismatch');
  if (anchorsComparison.some(row => row.status !== 'PASS')) failures.push('production_worker_shadow_results_differ');
  if (separation.positive_and_negative_controls_status !== 'PASS') failures.push('separation_positive_or_negative_control_failed');
  if (separation.fix16_complete_separation_confirmation !== 'PASS') failures.push('fix16_complete_separation_not_confirmed');
  if (separation.target_tolerance_stability !== 'PASS') failures.push('fix15_separation_classification_unstable_or_indeterminate');
  if (!anchors.native_candidate_observations?.warnings?.every(row =>
    ['fix_15_quasi_separation', 'fix_16_complete_separation'].includes(row.id) &&
    ['glm', 'matchit', 'cobalt_raw', 'cobalt_std'].every(key => Array.isArray(row[key])))) {
    failures.push('archived_native_candidate_warning_ledger_missing_or_incomplete');
  }
  const seByTerm = new Map(fix16.coefficient_and_standard_error_matrix.map(row => [row.term, row]));
  const seFailures = [
    { field: "(Intercept) standard error (also maximum SE)", ...seByTerm.get("(Intercept)") },
    { field: "x_sep standard error", ...seByTerm.get("x_sep") },
    { field: "maximum standard error", ...seByTerm.get("(Intercept)") }
  ].filter(row => row.standard_error_absolute_difference > 0.0001);
  const expectedFailureTerms = ['(Intercept)', 'x_sep', '(Intercept)'];
  const expectedThreeFailuresReproduced = seFailures.length === 3 &&
    JSON.stringify(seFailures.map(row => row.term)) === JSON.stringify(expectedFailureTerms);
  if (!expectedThreeFailuresReproduced) failures.push('the_three_frozen_fix16_standard_error_failures_were_not_reproduced');
  const fix15CurrentWarnings = [
    fixtureFromNative(native1, 'fix_15_quasi_separation').glm.warnings,
    fixtureFromNative(native2, 'fix_15_quasi_separation').glm.warnings
  ];
  const archivedNativeWarnings = anchors.native_candidate_observations?.warnings?.find(row => row.id === 'fix_15_quasi_separation');
  const report = {
    schema: 'CP-WEBR-02-CLOSURE-1-E2-covariance-comparison-v1',
    evidence_classification: 'RESEARCH_DIAGNOSTIC_NOT_APPROVED_GOLDEN_REFERENCE',
    commit_sha: process.env.GITHUB_SHA || native1.commit_sha || null,
    frozen_assets: {
      template_sha256: native1.template_sha256,
      fixture_manifest_sha256: native1.fixture_manifest_sha256,
      candidate_native_reference_sha256: 'ea05ce912fb03dd86f09cb779b60bd795284372d089a05a9e0124f17e766eedb',
      candidate_native_reference_status: 'PRESERVED_CANDIDATE_NOT_REGENERATED_OR_FROZEN'
    },
    repeatability: { native: nativeStability, webr: webStability },
    fix15_separation_assessment: separation,
    fix15_warning_contract_reconciliation: {
      original_manifest: 'SUCCESS_WITH_WARNING / SEPARATION_WARNING',
      historical_02a_assertion_matrix: 'OUTPUT_READY',
      archived_native_candidate_warning_ledger: archivedNativeWarnings || 'UNMEASURED',
      archived_native_candidate_reference_sha256: anchors.native_candidate_observations?.candidate_reference_sha256 || null,
      observed_native_glm_warnings_in_both_fresh_runs: fix15CurrentWarnings,
      observed_production_webr_warnings: anchors.fixtures.find(item => item.id === 'fix_15_quasi_separation').glm_runtime_warnings,
      observed_native_matchit_cobalt_warnings_in_fresh_direct_glm: 'NOT_APPLICABLE; direct stats::glm diagnostic does not execute MatchIt or cobalt',
      native_warning_capture_positive_control: native1.separation_assessment.warning_capture_positive_control,
      suggested_interpretation_from_lp: separation.warning_expectation_interpretation,
      interpretation: 'VERSIONED_ERRATUM_PROPOSED_ONLY; preserve manifest and historical matrix unchanged',
      exact_superseded_comparator_assertion: 'compare_closure.mjs: warning-category gate requires an application warning or numerical-instability safeguard whenever the preserved manifest says SUCCESS_WITH_WARNING',
      required_future_falsification: 'Add a known runtime-warning positive control whose warning ledger is deliberately removed; comparator must fail.'
    },
    native_environment: native1.fixtures.fix_16_complete_separation.environment,
    webr_environment: selectedWebR.runtime?.r_environment,
    production_worker_shadow_comparison: anchorsComparison,
    fix15_native_webr: fix15,
    fix16_native_webr: fix16,
    frozen_tolerance: {
      standard_error_absolute_tolerance: 0.0001,
      fix16_standard_error_failures: seFailures,
      maximum_standard_error_absolute_difference: Math.max(...fix16.coefficient_and_standard_error_matrix.map(row => row.standard_error_absolute_difference)),
      prior_ci_reported_absolute_differences: [
        { term: '(Intercept)', absolute_difference: 0.002009632982662879 },
        { term: 'x_sep', absolute_difference: 0.0002009632958106522 },
        { term: 'maximum standard error (same as intercept)', absolute_difference: 0.002009632982662879 }
      ],
      current_run_reproduced_three_failures: expectedThreeFailuresReproduced,
      all_three_reported_failures_remain_failures: seFailures.length === 3
    },
    hypothesis_assessment: classifyHypotheses(fix16),
    interpretation: {
      finite_iterative_output_is_not_finite_mle: true,
      finite_mle_is_not_well_defined_asymptotic_se_under_complete_separation: true,
      output_restriction_must_remain: 'OUTPUT_GENERATION_RESTRICTED',
      recommended_fix16_contract: 'Keep the existing absolute-tolerance failures. A separate reviewed contract may retain these fields as observable diagnostics while marking separated-model standard errors non-certifying; require independent separation evidence and keep exact structural checks and fail-closed publication policy.'
    },
    workflow_gate_status: failures.length ? 'FAIL' : 'PASS',
    workflow_failures: failures
  };
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`Native/WebR forensic comparison: ${report.workflow_gate_status}; fix16 SE fields above 1e-4: ${seFailures.length}`);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
