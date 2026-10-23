#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateNumericComparisonRows } from '../e3/adjudicate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PINS_FILE = path.join(HERE, 'evidence-pins.json');
const AMENDMENT_FILE = path.join(HERE, 'CP-WEBR-02-SCIENTIFIC-EQUIVALENCE-AMENDMENT-v1.md');
const EXPECTED_PINS_SHA256 = '3f9272da9d7a56ccc1b700d48b84c3b05a01e0fa711b8a4d613a5d92feaebe1c';

const FIXTURE_IDS = [
  'fix_01_well_conditioned', 'fix_02_mixed_types', 'fix_03_ref_level_change',
  'fix_04_input_row_order', 'fix_05_exact_distance_ties', 'fix_06_no_caliper_nearest',
  'fix_07_prob_scale_caliper', 'fix_08_linear_logit_caliper', 'fix_09_standardized_caliper',
  'fix_10_whole_vs_pooled_sd', 'fix_11_pre_match_discard', 'fix_12_caliper_unmatched',
  'fix_13_more_treated_than_control', 'fix_14_more_controls_than_treated',
  'fix_15_quasi_separation', 'fix_16_complete_separation', 'fix_17_rank_deficient',
  'fix_18_zero_variance', 'fix_19_missing_values', 'fix_19b_missing_treatment',
  'fix_20_malformed_category', 'fix_21_extreme_propensities', 'fix_22_small_sample',
  'fix_23_no_eligible_match', 'fix_24_duplicate_ids'
];
const ORDINARY_IDS = [
  ...FIXTURE_IDS.slice(0, 14), 'fix_17_rank_deficient', 'fix_18_zero_variance',
  'fix_21_extreme_propensities', 'fix_22_small_sample'
];
const POLICY_IDS = [
  'fix_19_missing_values', 'fix_19b_missing_treatment', 'fix_20_malformed_category',
  'fix_23_no_eligible_match', 'fix_24_duplicate_ids'
];
const CONTROL_CATEGORIES = {
  fixture_input_hash_changed: 'EVIDENCE_INTEGRITY_FALSIFICATION',
  fixture_missing: 'STRUCTURAL_IDENTITY_FALSIFICATION',
  fixture_duplicated: 'STRUCTURAL_IDENTITY_FALSIFICATION',
  exception_requested_for_unrelated_fixture: 'EXCEPTION_SCOPE_FALSIFICATION',
  nonseparated_fixture_labelled_separated: 'SCIENTIFIC_COMPARATOR_FALSIFICATION',
  lp_provenance_removed: 'EVIDENCE_INTEGRITY_FALSIFICATION',
  unsupported_separation_claim: 'SCIENTIFIC_COMPARATOR_FALSIFICATION',
  fix16_publication_restriction_removed: 'PUBLICATION_SAFETY_FALSIFICATION',
  matched_pair_identity_altered: 'STRUCTURAL_IDENTITY_FALSIFICATION',
  keyed_weight_changed: 'STRUCTURAL_IDENTITY_FALSIFICATION',
  factor_reference_changed: 'STRUCTURAL_IDENTITY_FALSIFICATION',
  ordinary_coefficient_value_changed: 'SCIENTIFIC_COMPARATOR_FALSIFICATION',
  ordinary_cobalt_value_changed: 'SCIENTIFIC_COMPARATOR_FALSIFICATION',
  genuine_runtime_warning_removed_from_fix21_native_ledger: 'SCIENTIFIC_COMPARATOR_FALSIFICATION',
  application_policy_warning_removed_from_fix21: 'PUBLICATION_SAFETY_FALSIFICATION',
  three_fix16_tolerance_failures_concealed: 'SCIENTIFIC_COMPARATOR_FALSIFICATION',
  scientific_evidence_altered_without_reviewed_hash: 'EVIDENCE_INTEGRITY_FALSIFICATION',
  erratum_text_or_evidence_altered_without_reviewed_hash: 'EVIDENCE_INTEGRITY_FALSIFICATION',
  old_fail_renamed_pass_without_justification: 'SCIENTIFIC_COMPARATOR_FALSIFICATION'
};
const REQUIRED_TEST_NAMES = [
  'fixture identity coverage directly rejects missing and duplicated records',
  'versioned fixture mapping preserves E3 history and uses the amended fix16 class',
  'deleted native matching structure fails closed',
  'deleted application payload fails closed',
  'missing application matching subclasses fail closed',
  'missing factor contrast metadata fails closed',
  'pair order, keyed weight and factor reference mutations fail direct structural assertions',
  'exception scope rejects unrelated fixtures and changed frozen inputs directly',
  'ordinary coefficient mutation is detected by direct numeric tolerance arithmetic',
  'cobalt mutation is detected by direct numeric tolerance arithmetic',
  'removing a genuine warning from a warning-required runtime ledger is detected directly',
  'numeric row validation recomputes the three original fix16 FAIL semantics'
];
const CONTROL_TEST_LINKS = {
  fixture_missing: REQUIRED_TEST_NAMES[0],
  fixture_duplicated: REQUIRED_TEST_NAMES[0],
  exception_requested_for_unrelated_fixture: REQUIRED_TEST_NAMES[7],
  matched_pair_identity_altered: REQUIRED_TEST_NAMES[6],
  keyed_weight_changed: REQUIRED_TEST_NAMES[6],
  factor_reference_changed: REQUIRED_TEST_NAMES[6],
  ordinary_coefficient_value_changed: REQUIRED_TEST_NAMES[8],
  ordinary_cobalt_value_changed: REQUIRED_TEST_NAMES[9],
  genuine_runtime_warning_removed_from_fix21_native_ledger: REQUIRED_TEST_NAMES[10],
  three_fix16_tolerance_failures_concealed: REQUIRED_TEST_NAMES[11],
  old_fail_renamed_pass_without_justification: REQUIRED_TEST_NAMES[11]
};

function fail(pathName, message) { throw new Error(`${pathName}: ${message}`); }
function requireValue(value, pathName, message) { if (!value) fail(pathName, message); }
function equal(actual, expected, pathName) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(pathName, `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

export function validateStrictComparison(comparison, run, pins) {
  equal(run.id, Number(pins.original_strict_closure.workflow_run_id), 'strict_run.id');
  equal(run.head_sha, pins.original_strict_closure.commit_sha, 'strict_run.head_sha');
  equal(run.head_branch, pins.original_strict_closure.branch, 'strict_run.head_branch');
  equal(run.status, 'completed', 'strict_run.status');
  equal(run.conclusion, pins.original_strict_closure.conclusion, 'strict_run.conclusion');
  equal(comparison.commit_sha, pins.original_strict_closure.commit_sha, 'strict_comparison.commit_sha');
  equal(comparison.status, 'FAIL', 'strict_comparison.status');
  const summary = comparison.summary;
  for (const [field, expected] of Object.entries({
    manifest_fixture_count: pins.original_failure_counts.fixtures,
    compared_fixture_count: pins.original_failure_counts.fixtures,
    passing_fixture_count: pins.original_failure_counts.fixture_passes,
    failing_fixture_count: pins.original_failure_counts.fixture_failures,
    numerical_comparison_count: pins.original_failure_counts.numeric_comparisons,
    numerical_pass_count: pins.original_failure_counts.numeric_passes,
    numerical_fail_count: pins.original_failure_counts.numeric_failures,
    baseline_failure_count: pins.original_failure_counts.baseline_failures
  })) equal(summary[field], expected, `strict_comparison.summary.${field}`);

  const numericTotals = validateNumericComparisonRows(comparison.numeric_comparisons, 'strict_comparison.numeric_comparisons');
  equal(numericTotals.count, pins.original_failure_counts.numeric_comparisons, 'strict_comparison.numeric_recount');
  equal(numericTotals.pass_count, pins.original_failure_counts.numeric_passes, 'strict_comparison.numeric_pass_recount');
  equal(numericTotals.fail_count, pins.original_failure_counts.numeric_failures, 'strict_comparison.numeric_fail_recount');
  const expectedFailureMessages = [
    pins.original_failure_names[0],
    ...pins.original_numeric_failure_rows.map(row => `${row.name}:difference=${row.absolute_difference}:tolerance=${row.tolerance}`)
  ];
  equal([...comparison.failures].sort(), [...expectedFailureMessages].sort(), 'strict_comparison.failures.exact');
  const numericFailures = comparison.numeric_comparisons.filter(row => row.status === 'FAIL');
  equal(numericFailures.length, pins.original_numeric_failure_rows.length, 'strict_comparison.numeric_failures.length');
  for (const expected of pins.original_numeric_failure_rows) {
    const actual = numericFailures.find(row => row.name === expected.name);
    requireValue(actual, `strict_comparison.numeric_failures.${expected.name}`, 'frozen numeric failure missing');
    for (const field of ['actual', 'reference', 'absolute_difference', 'tolerance', 'status']) {
      equal(actual[field], expected[field], `strict_comparison.numeric_failures.${expected.name}.${field}`);
    }
  }
  const fixtureIds = (comparison.fixtures || []).map(row => row.id);
  equal(fixtureIds, FIXTURE_IDS, 'strict_comparison.fixture_identity_and_order');
  equal(comparison.fixtures.filter(row => row.status === 'FAIL').map(row => row.id), ['fix_15_quasi_separation', 'fix_16_complete_separation'], 'strict_comparison.fixture_failures');
  return { numericTotals, expectedFailureMessages, numericFailures };
}

export function parseTapResults(tap) {
  const tests = Number(/^# tests (\d+)$/m.exec(tap)?.[1]);
  const passed = Number(/^# pass (\d+)$/m.exec(tap)?.[1]);
  const failed = Number(/^# fail (\d+)$/m.exec(tap)?.[1]);
  requireValue(Number.isInteger(tests) && Number.isInteger(passed) && Number.isInteger(failed), 'adjudicator_tests.tap', 'expected Node TAP summary');
  equal(failed, 0, 'adjudicator_tests.failed');
  equal(passed, tests, 'adjudicator_tests.passed');
  for (const name of REQUIRED_TEST_NAMES) {
    requireValue(new RegExp(`^ok \\d+ - ${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'm').test(tap), `adjudicator_tests.${name}`, 'required direct falsification test missing or failed');
  }
  return { tests, passed, failed, required_direct_tests: REQUIRED_TEST_NAMES };
}

export function deriveVersionedFixtureAdjudications(rows) {
  return rows.map(row => ({
    ...row,
    source_e3_outcome: row.outcome,
    outcome: row.fixture_id === 'fix_16_complete_separation' ? row.proposed_status : row.outcome
  }));
}

function validateFixtureAdjudications(report) {
  equal(report.schema, 'CP-WEBR-02-CLOSURE-1-E3-ADJUDICATION-v1', 'e3_report.schema');
  equal(report.fixture_adjudications.length, 25, 'e3_report.fixture_adjudications.length');
  equal(report.fixture_adjudications.map(row => row.fixture_id), FIXTURE_IDS, 'e3_report.fixture_identity_and_order');
  for (const row of report.fixture_adjudications) {
    const id = row.fixture_id;
    const expectedStructural = POLICY_IDS.includes(id) ? 'NOT_APPLICABLE_EXPECTED_ERROR' : 'MATCHING_STRUCTURE_PASS';
    const expectedOutcome = ORDINARY_IDS.includes(id) ? 'NUMERICAL_AND_STRUCTURAL_PARITY_PASS'
      : POLICY_IDS.includes(id) ? 'EXPECTED_ERROR_OR_POLICY_PARITY_PASS'
        : id === 'fix_15_quasi_separation' ? 'HISTORICAL_WARNING_CONTRACT_EXCEPTION'
          : 'NON_IDENTIFIABLE_INFERENCE_RESTRICTED';
    const expectedProposal = id === 'fix_15_quasi_separation' ? 'OBSERVED_SUCCESS_WITHOUT_SEPARATION_WARNING'
      : id === 'fix_16_complete_separation' ? 'INFERENCE_NON_IDENTIFIABLE_OUTPUT_RESTRICTED'
        : expectedOutcome;
    equal(row.structural_outcome?.outcome, expectedStructural, `e3_report.${id}.structural_outcome`);
    if (POLICY_IDS.includes(id)) requireValue(typeof row.structural_outcome.justification === 'string' && row.structural_outcome.justification.length > 0, `e3_report.${id}.structural_outcome`, 'expected error N/A justification missing');
    equal(row.outcome, expectedOutcome, `e3_report.${id}.source_outcome`);
    equal(row.proposed_status, expectedProposal, `e3_report.${id}.proposed_status`);
    equal(row.erratum_dependent, id === 'fix_15_quasi_separation' || id === 'fix_16_complete_separation', `e3_report.${id}.erratum_dependent`);
    equal(row.historical_comparator_status, ['fix_15_quasi_separation', 'fix_16_complete_separation'].includes(id) ? 'FAIL' : 'PASS', `e3_report.${id}.historical_status`);
  }
  const outcomes = report.fixture_adjudications.map(row => row.outcome);
  equal(outcomes.filter(value => value === 'NUMERICAL_AND_STRUCTURAL_PARITY_PASS').length, 18, 'e3_report.ordinary_outcomes');
  equal(outcomes.filter(value => value === 'EXPECTED_ERROR_OR_POLICY_PARITY_PASS').length, 5, 'e3_report.policy_outcomes');
  equal(outcomes.filter(value => ['HISTORICAL_WARNING_CONTRACT_EXCEPTION', 'NON_IDENTIFIABLE_INFERENCE_RESTRICTED'].includes(value)).length, 2, 'e3_report.exception_outcomes');
  equal(report.summary.total_fixtures_evaluated, 25, 'e3_report.summary.total');
  equal(report.summary.ordinary_scientific_parity_passes, 18, 'e3_report.summary.ordinary');
  equal(report.summary.expected_policy_error_passes, 5, 'e3_report.summary.policy');
  equal(report.summary.erratum_dependent_exceptions, 2, 'e3_report.summary.exceptions');
  equal(report.summary.frozen_numerical_failures, 3, 'e3_report.summary.numeric_failures');
  equal(report.summary.aggregate_numerical_parity_pass, false, 'e3_report.summary.aggregate_numerical_parity');
  equal(report.original_numerical_failure_matrix.failures.length, 3, 'e3_report.original_numerical_failure_matrix.length');
  equal(report.fix16.covariance.causal_explanation, 'UNRESOLVED', 'e3_report.fix16.covariance.causal_explanation');
  equal(report.fix16.publication_restriction, 'OUTPUT_GENERATION_RESTRICTED', 'e3_report.fix16.publication_restriction');
  equal(report.fix16.production_worker_anchor.publication_verdict_preserved_as_anchor, 'OUTPUT_GENERATION_RESTRICTED', 'e3_report.fix16.worker_anchor_restriction');
  equal(report.fix15.proposal, 'OBSERVED_SUCCESS_WITHOUT_SEPARATION_WARNING', 'e3_report.fix15.proposal');
}

function auditControls(report, tapResults) {
  const controls = report.negative_controls;
  requireValue(Array.isArray(controls), 'e3_report.negative_controls', 'expected control array');
  equal(controls.length, 19, 'e3_report.negative_controls.length');
  const byName = new Map(controls.map(item => [item.name, item]));
  equal(byName.size, controls.length, 'e3_report.negative_controls.unique');
  equal([...byName.keys()].sort(), Object.keys(CONTROL_CATEGORIES).sort(), 'e3_report.negative_controls.inventory');
  for (const control of controls) {
    equal(control.category, CONTROL_CATEGORIES[control.name], `e3_report.negative_controls.${control.name}.category`);
    equal(control.status, 'PASS_REJECTED', `e3_report.negative_controls.${control.name}.status`);
  }
  const directTests = new Map(tapResults.required_direct_tests.map(name => [name, 'PASS']));
  return controls.map(control => ({
    name: control.name,
    classification: control.category,
    E3_mutation_result: control.status,
    E3_detection_layer: control.detection_layer,
    first_rejection_boundary: control.rejection,
    direct_falsification_test: CONTROL_TEST_LINKS[control.name] || null,
    direct_falsification_status: CONTROL_TEST_LINKS[control.name] ? directTests.get(CONTROL_TEST_LINKS[control.name]) : 'FULL_ARCHIVED_EVIDENCE_VALIDATOR'
  }));
}

function validateArtifactVerification(verification, pins) {
  equal(verification.status, 'PASS', 'artifact_verification.status');
  equal(verification.e3_internal_manifest_verified, true, 'artifact_verification.e3_internal_manifest_verified');
  equal(verification.native_and_e2_archives_verified, true, 'artifact_verification.native_and_e2_archives_verified');
  const expected = [
    ['original_worker_evidence', pins.original_worker_evidence],
    ['e2_evidence', pins.e2_evidence],
    ['e3_evidence', pins.e3_evidence],
    ['original_strict_comparison', pins.original_strict_closure],
    ['original_strict_evidence', pins.original_strict_closure]
  ];
  for (const [key, pin] of expected) {
    const observed = verification.artifacts?.[key];
    requireValue(observed, `artifact_verification.${key}`, 'verified artifact record missing');
    for (const field of ['workflow_run_id', 'artifact_id', 'artifact_name', 'artifact_size_bytes', 'artifact_digest']) {
      const artifactPrefix = key === 'original_strict_comparison' ? 'comparison' : 'evidence';
      const strictRun = key.startsWith('original_strict_');
      const strictPins = strictRun ? {
        workflow_run_id: pin.workflow_run_id,
        artifact_id: pin[`${artifactPrefix}_artifact_id`],
        artifact_name: pin[`${artifactPrefix}_artifact_name`],
        artifact_size_bytes: pin[`${artifactPrefix}_artifact_size_bytes`],
        artifact_digest: pin[`${artifactPrefix}_artifact_digest`]
      } : null;
      const expectedValue = strictRun ? strictPins[field] : pin[field];
      equal(String(observed[field]), String(expectedValue), `artifact_verification.${key}.${field}`);
    }
  }
  equal(verification.strict_comparison_report_sha256, pins.original_strict_closure.comparison_report_sha256, 'artifact_verification.strict_comparison_report_sha256');
  return true;
}

function validateRepositoryPins(pins, amendmentBytes, pinsBytes) {
  equal(sha256(pinsBytes), EXPECTED_PINS_SHA256, 'e4_pins.file_sha256');
  equal(sha256(amendmentBytes), pins.amendment_sha256, 'e4_amendment.sha256');
  const e3PinsBytes = fs.readFileSync(path.join(ROOT, 'experiments/cp-webr-02-closure/e3/evidence-pins.json'));
  equal(sha256(e3PinsBytes), pins.e3_pins_sha256, 'e3_pins.sha256');
  const e3Pins = JSON.parse(e3PinsBytes.toString('utf8'));
  equal(e3Pins.erratum_sha256, pins.e3_candidate_sha256, 'e3_candidate.sha256');
  const filePins = [
    ['docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md', pins.roadmap_sha256],
    ['experiments/cp-webr-02a/fixtures/fixtures_manifest.json', pins.frozen.fixture_manifest_sha256],
    ['experiments/cp-webr-02a/adapter/r_template.R', pins.frozen.template_sha256],
    ['experiments/cp-webr-02a/r1.2a/FIXTURE-ASSERTION-MATRIX.json', pins.frozen.assertion_matrix_sha256],
    ['experiments/cp-webr-02-closure/native_oracle.R', pins.frozen.native_oracle_source_sha256]
  ];
  for (const [relativePath, expected] of filePins) equal(sha256(fs.readFileSync(path.join(ROOT, relativePath))), expected, `repository.${relativePath}.sha256`);
  const packageJson = readJson(path.join(ROOT, 'package.json'));
  const packageLock = readJson(path.join(ROOT, 'package-lock.json'));
  equal(packageJson.dependencies?.next, pins.toolchain.next, 'toolchain.next');
  equal(packageJson.devDependencies?.['eslint-config-next'], pins.toolchain.eslint_config_next, 'toolchain.eslint-config-next');
  equal(packageLock.packages?.['node_modules/next']?.version, pins.toolchain.next, 'toolchain.locked-next');
  equal(packageLock.packages?.['node_modules/eslint-config-next']?.version, pins.toolchain.eslint_config_next, 'toolchain.locked-eslint-config-next');
  const runtimeLock = readJson(path.join(ROOT, 'experiments/cp-webr-00b/dependency-lock.json'));
  equal(runtimeLock.runtime?.webr_npm, pins.toolchain.webr, 'toolchain.webr');
  equal(runtimeLock.runtime?.r_version, pins.toolchain.r, 'toolchain.r');
  return { pins_sha256: sha256(pinsBytes), amendment_sha256: sha256(amendmentBytes), checked_file_count: filePins.length };
}

function renderMarkdown(report) {
  const fixtureRows = report.fixture_adjudications.map(row => `| ${row.fixture_id} | ${row.historical_comparator_status} | ${row.structural_outcome.outcome} | ${row.outcome} | ${row.erratum_dependent ? 'yes' : 'no'} |`).join('\n');
  const rawFailures = report.original_numerical_failure_matrix.failures.map(row => `| ${row.name} | ${row.reference} | ${row.actual} | ${row.absolute_difference} | ${row.tolerance} | FAIL |`).join('\n');
  const controls = report.negative_control_audit.map(row => `| ${row.name} | ${row.classification} | ${row.E3_detection_layer} | ${row.direct_falsification_status} | ${row.first_rejection_boundary} |`).join('\n');
  return `# E4 CP-WEBR-02 Closure Qualification Evidence\n\nStatus: \`${report.final_verdict}\`  \nSelf-declared phase closure: \`${report.self_declared_closure}\`  \nCommit: \`${report.commit_sha}\`  \nWorkflow run: \`${report.workflow_run_id}\`\n\n## Phase interpretation\n\nThe roadmap assigns “25 synthetic fixtures match native R golden results” to CP-WEBR-02 and “100% semantic and numerical tolerance parity” to CP-STAT-02. This candidate amends CP-WEBR-02 only, pending independent acceptance. CP-STAT-02 is unchanged.\n\n## Outcome summary\n\n| Measure | Count/status |\n|---|---:|\n| Total fixtures evaluated | ${report.summary.total_fixtures_evaluated} |\n| Ordinary numerical and structural parity | ${report.summary.ordinary_scientific_parity_passes} |\n| Expected error/product-policy parity | ${report.summary.expected_policy_error_passes} |\n| Exact fixture exceptions | ${report.summary.erratum_dependent_exceptions} |\n| Original numerical failures retained | ${report.summary.frozen_numerical_failures} |\n| Unresolved covariance causes | ${report.summary.unresolved_differences} |\n| Missing/unmeasured in this 25-fixture adjudication | ${report.summary.missing_or_unmeasured_requirements} |\n\n**No 25/25 numerical parity claim is made.** Original strict comparison: ${report.original_numerical_comparison.fixture_passes}/25 fixtures pass; ${report.original_numerical_comparison.numeric_passes}/${report.original_numerical_comparison.numeric_comparisons} numeric rows pass; ${report.original_numerical_comparison.numeric_failures} numeric rows remain FAIL.\n\n## All 25 fixture outcomes\n\n| Fixture | Original strict row | Structural outcome | Proposed scientific outcome | Erratum-dependent |\n|---|---|---|---|---|\n${fixtureRows}\n\n## Original raw numerical failures\n\n| Field | Native reference | Production Worker | Absolute difference | Tolerance | Status |\n|---|---:|---:|---:|---:|---|\n${rawFailures}\n\nThese three standard-error rows remain FAIL at the original tolerance. The fix_15 warning/diagnostic discrepancy also remains in the original strict report.\n\n## fix_15 and fix_16 interpretation\n\n- fix_15: \`${report.fix15.proposed_classification}\`; exact frozen non-separation evidence and warning records remain hash-bound.\n- fix_16: \`${report.fix16.proposed_classification}\`; LP classification is \`${report.fix16.mathematical_classification}\`; output restriction is \`${report.fix16.publication_restriction}\`.\n- Native/WebR covariance discrepancy: \`${report.fix16.covariance_causal_explanation}\`; no BLAS/LAPACK cause is asserted.\n- Complete separation does not certify matching quality or causal inference.\n\n## E3 negative-control audit\n\nAll 19 E3 controls are retained. Hash/provenance rejection is labeled separately from direct numeric or structural assertion testing.\n\n| Control | Classification | E3 detection layer | Direct test | First rejection boundary |\n|---|---|---|---|---|\n${controls}\n\nThe direct E4 tests separately mutate ordinary numeric observations, fixture exception scope, warning ledgers, and matching structures.\n\n## Evidence and publication status\n\n- Original numerical parity: **FAIL**, with the four previously established failure rows.\n- Versioned scientific-equivalence adjudication: **candidate evidence ready for independent review**; no amendment is effective yet.\n- fix_16 publication safety: **PASS**, production Worker restriction remains \`OUTPUT_GENERATION_RESTRICTED\`.\n- CP-PUB-01 and CP-RELEASE requirements: **DEFERRED / NOT APPROVED**.\n- Candidate native reference: recommend independent consideration as an immutable native R observation dataset only; not frozen or WebR parity-certified.\n\n## Recommended disposition\n\nIf independently accepted and ratified, the amendment could meet the intended CP-WEBR-02 integration qualification purpose under the explicit 18/5/1/1 outcomes. It does not satisfy CP-STAT-02 and does not close CP-WEBR-02 by this agent. Independent ChatGPT Red Team review is the next gate.\n`;
}

export function buildQualificationReport({ pins, e3Report, strictComparison, strictRun, testLog, artifactVerification, sourceIdentity, commitSha, workflowRunId }) {
  const testResults = parseTapResults(testLog);
  const strictResult = validateStrictComparison(strictComparison, strictRun, pins);
  validateFixtureAdjudications(e3Report);
  validateArtifactVerification(artifactVerification, pins);
  equal(sourceIdentity.status, 'PASS', 'production_source_identity.status');
  equal(sourceIdentity.production_paths_unchanged, true, 'production_source_identity.production_paths_unchanged');
  equal(sourceIdentity.compared_source_commit, pins.original_worker_evidence.source_commit_sha, 'production_source_identity.compared_source_commit');
  equal(sourceIdentity.main_sha, pins.main_sha, 'production_source_identity.main_sha');
  const controlAudit = auditControls(e3Report, testResults);
  equal(e3Report.original_evidence.native_worker_artifact_id, pins.original_worker_evidence.artifact_id, 'e3_report.original_worker_artifact_id');
  equal(e3Report.original_evidence.native_worker_artifact_sha256, pins.original_worker_evidence.artifact_digest, 'e3_report.original_worker_artifact_digest');
  equal(e3Report.original_evidence.e2_artifact_id, pins.e2_evidence.artifact_id, 'e3_report.e2_artifact_id');
  equal(e3Report.original_evidence.e2_artifact_sha256, pins.e2_evidence.artifact_digest, 'e3_report.e2_artifact_digest');
  equal(e3Report.original_evidence.candidate_reference_sha256, pins.frozen.candidate_native_reference_sha256, 'e3_report.native_reference_sha256');

  const adjudications = deriveVersionedFixtureAdjudications(e3Report.fixture_adjudications);
  const rawFailures = strictResult.numericFailures.map(row => ({
    name: row.name, reference: row.reference, actual: row.actual,
    absolute_difference: row.absolute_difference, tolerance: row.tolerance, status: row.status
  }));
  const report = {
    schema: 'CP-WEBR-02-CLOSURE-1-E4-QUALIFICATION-v1',
    evidence_classification: 'VERSIONED_AMENDMENT_CANDIDATE_NOT_PHASE_CLOSURE',
    final_verdict: 'CLOSURE_E4_READY_FOR_INDEPENDENT_PHASE_CLOSURE',
    self_declared_closure: false,
    amendment_status: pins.review_status,
    commit_sha: commitSha,
    workflow_run_id: workflowRunId,
    phase_contract: {
      original_roadmap_sha256: pins.roadmap_sha256,
      cp_webr_02_original_stop_condition: '25 synthetic fixtures match native R golden results',
      cp_stat_02_original_stop_condition: '100% semantic and numerical tolerance parity',
      corrected_phase_interpretation: true,
      cp_stat_02_changed: false,
      proposed_cp_webr_02_equivalence_counts: { ordinary: 18, expected_error_or_policy: 5, fix15_warning_exception: 1, fix16_non_identifiable_restricted: 1 },
      amendment_precedence: 'Original roadmap remains binding until independent acceptance and ratification; this addendum then interprets CP-WEBR-02 only.'
    },
    evidence: {
      baseline_sha: pins.required_baseline_sha,
      main_sha: pins.main_sha,
      e3_candidate_sha256: pins.e3_candidate_sha256,
      e4_amendment_sha256: pins.amendment_sha256,
      e4_pins_sha256: EXPECTED_PINS_SHA256,
      original_roadmap_sha256: pins.roadmap_sha256,
      fixture_manifest_sha256: pins.frozen.fixture_manifest_sha256,
      template_sha256: pins.frozen.template_sha256,
      assertion_matrix_sha256: pins.frozen.assertion_matrix_sha256,
      native_oracle_source_sha256: pins.frozen.native_oracle_source_sha256,
      candidate_native_reference_sha256: pins.frozen.candidate_native_reference_sha256,
      production_source_identity: sourceIdentity,
      workflow_artifact_verification: artifactVerification,
      toolchain: pins.toolchain
    },
    historical_comparison: {
      workflow_run_id: pins.original_strict_closure.workflow_run_id,
      commit_sha: pins.original_strict_closure.commit_sha,
      run_conclusion: strictRun.conclusion,
      comparison_artifact_id: pins.original_strict_closure.comparison_artifact_id,
      comparison_artifact_digest: pins.original_strict_closure.comparison_artifact_digest,
      comparison_report_sha256: pins.original_strict_closure.comparison_report_sha256,
      strict_status: strictComparison.status,
      fixture_passes: strictComparison.summary.passing_fixture_count,
      fixture_failures: strictComparison.summary.failing_fixture_count,
      numeric_comparisons: strictComparison.summary.numerical_comparison_count,
      numeric_passes: strictComparison.summary.numerical_pass_count,
      numeric_failures: strictComparison.summary.numerical_fail_count,
      baseline_failure_count: strictComparison.summary.baseline_failure_count,
      failures: strictComparison.failures,
      raw_numeric_failure_matrix: rawFailures
    },
    original_numerical_failure_matrix: { failures: rawFailures },
    original_numerical_comparison: {
      fixture_passes: strictComparison.summary.passing_fixture_count,
      numeric_comparisons: strictComparison.summary.numerical_comparison_count,
      numeric_passes: strictComparison.summary.numerical_pass_count,
      numeric_failures: strictComparison.summary.numerical_fail_count
    },
    fixture_adjudications: adjudications,
    summary: {
      total_fixtures_evaluated: adjudications.length,
      ordinary_scientific_parity_passes: 18,
      expected_policy_error_passes: 5,
      erratum_dependent_exceptions: 2,
      frozen_numerical_failures: 3,
      unresolved_differences: 1,
      missing_or_unmeasured_requirements: 0,
      aggregate_numerical_parity_pass: false
    },
    fix15: {
      proposed_classification: 'HISTORICAL_WARNING_CONTRACT_EXCEPTION',
      proposed_observation: 'OBSERVED_SUCCESS_WITHOUT_SEPARATION_WARNING',
      historical_manifest_unchanged: e3Report.fix15.historical_manifest_unchanged,
      historical_assertion_matrix_unchanged: e3Report.fix15.historical_assertion_matrix_unchanged,
      lp: e3Report.fix15.lp,
      warning_capture_control: e3Report.fix15.warning_capture_control
    },
    fix16: {
      proposed_classification: 'NON_IDENTIFIABLE_INFERENCE_RESTRICTED',
      mathematical_classification: e3Report.fix16.mathematical_classification,
      publication_restriction: e3Report.fix16.publication_restriction,
      covariance_causal_explanation: e3Report.fix16.covariance.causal_explanation,
      covariance: e3Report.fix16.covariance,
      native_fit: e3Report.fix16.native_fit,
      webr_fit: e3Report.fix16.webr_fit,
      qr_comparison: e3Report.fix16.qr_comparison,
      conditioning: e3Report.fix16.conditioning,
      repeatability: e3Report.fix16.repeatability,
      production_worker_anchor: e3Report.fix16.production_worker_anchor,
      original_numeric_failures_remain_fail: true
    },
    negative_control_audit: controlAudit,
    direct_falsification_tests: testResults,
    outcomes: {
      original_numerical_parity: 'FAIL',
      proposed_versioned_scientific_equivalence: 'CANDIDATE_READY_PENDING_INDEPENDENT_ACCEPTANCE',
      fix16_publication_safety: 'PASS_RESTRICTION_PRESERVED',
      cp_pub_01_and_cp_release: 'DEFERRED_NOT_APPROVED'
    },
    golden_reference_governance: {
      recommendation: 'CONSIDER_AS_IMMUTABLE_NATIVE_R_OBSERVATION_DATASET',
      candidate_sha256: pins.frozen.candidate_native_reference_sha256,
      native_observation_provenance_validated: true,
      webr_numerical_parity_certified: false,
      frozen_by_this_qualification: false
    },
    stop_condition_recommendation: 'The amended 18/5/1/1 CP-WEBR-02 contract could satisfy its integration qualification purpose only after independent acceptance and ratification. CP-WEBR-02 is not declared closed here; CP-STAT-02 remains unchanged.',
    deferred_requirements: [
      'Independent ChatGPT Red Team review and formal amendment ratification.',
      'CP-STAT-02 validation of separation detection, overlap, estimands, matching quality, treatment effects, and causal claims.',
      'CP-PUB-01 legal, licensing, publication and canonical artifact approval.',
      'CP-RELEASE production security, privacy, browser-channel, deployment and release approvals.',
      'Causal explanation of the native/WebR covariance discrepancy; status remains UNRESOLVED.'
    ]
  };
  return report;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--') || !argv[i + 1] || argv[i + 1].startsWith('--')) fail('arguments', `invalid argument near ${key}`);
    args[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

function cli() {
  const args = parseArgs(process.argv.slice(2));
  for (const required of ['e3-report', 'strict-comparison', 'strict-run', 'test-log', 'artifact-verification', 'source-identity', 'output-dir']) {
    requireValue(args[required], 'arguments', `required --${required}`);
  }
  const pinsBytes = fs.readFileSync(PINS_FILE);
  const pins = JSON.parse(pinsBytes.toString('utf8'));
  const amendmentBytes = fs.readFileSync(AMENDMENT_FILE);
  validateRepositoryPins(pins, amendmentBytes, pinsBytes);
  const strictComparisonBytes = fs.readFileSync(path.resolve(args['strict-comparison']));
  const strictComparison = JSON.parse(strictComparisonBytes.toString('utf8'));
  const strictRun = readJson(path.resolve(args['strict-run']));
  const artifactVerification = readJson(path.resolve(args['artifact-verification']));
  artifactVerification.strict_comparison_report_sha256 = sha256(strictComparisonBytes);
  const report = buildQualificationReport({
    pins,
    e3Report: readJson(path.resolve(args['e3-report'])),
    strictComparison,
    strictRun,
    testLog: fs.readFileSync(path.resolve(args['test-log']), 'utf8'),
    artifactVerification,
    sourceIdentity: readJson(path.resolve(args['source-identity'])),
    commitSha: process.env.GITHUB_SHA || 'LOCAL_OFFLINE_REPLAY',
    workflowRunId: process.env.GITHUB_RUN_ID || null
  });
  const outputDir = path.resolve(args['output-dir']);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'e4-closure-qualification.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'e4-closure-qualification.md'), renderMarkdown(report));
  process.stdout.write(`${JSON.stringify({ final_verdict: report.final_verdict, self_declared_closure: false, summary: report.summary, output: outputDir }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(); } catch (error) {
    process.stderr.write(`E4 qualification rejected: ${error.message}\n`);
    process.exitCode = 1;
  }
}
