import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateScientificClassification, validateStrictComparison, validateStrictWorkflowJobs } from './verify_ratification.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pins = JSON.parse(fs.readFileSync(path.join(HERE, 'evidence-pins.json'), 'utf8'));
const policy = new Set(['fix_19_missing_values', 'fix_19b_missing_treatment', 'fix_20_malformed_category', 'fix_23_no_eligible_match', 'fix_24_duplicate_ids']);

function strictReport() {
  const numeric = pins.ratification_strict_numeric_failures.map(row => ({ ...row, semantics: 'numeric' }));
  const failures = [pins.expected_strict_failures[0], ...numeric.map(row => `${row.name}:difference=${row.absolute_difference}:tolerance=${row.tolerance}`)];
  return {
    commit_sha: pins.required_baseline_sha,
    status: 'FAIL',
    summary: {
      manifest_fixture_count: 25, compared_fixture_count: 25, passing_fixture_count: 23, failing_fixture_count: 2,
      numerical_comparison_count: 16047, numerical_pass_count: 16044, numerical_fail_count: 3,
      baseline_failure_count: 4, negative_control_count: 18, negative_control_status: 'PASS'
    },
    fixtures: pins.fixture_ids.map(id => ({ id, status: ['fix_15_quasi_separation', 'fix_16_complete_separation'].includes(id) ? 'FAIL' : 'PASS' })),
    failures,
    numeric_comparisons: numeric,
    negative_controls: {
      status: 'PASS', count: 18,
      controls: pins.current_strict_negative_control_names.map(name => ({ name, status: 'PASS' }))
    },
    warning_diagnostic_distinctions: [{
      id: 'fix_15_quasi_separation', preserved_manifest_classification: 'SUCCESS_WITH_WARNING',
      native_warning_messages: { glm: [], matchit: [], cobalt_raw: [], cobalt_std: [] }
    }]
  };
}

function adjudicationEvidence() {
  const e3 = {
    fixture_adjudications: pins.fixture_ids.map(fixture_id => ({
      fixture_id,
      outcome: fixture_id === 'fix_15_quasi_separation' ? 'HISTORICAL_WARNING_CONTRACT_EXCEPTION'
        : fixture_id === 'fix_16_complete_separation' ? 'NON_IDENTIFIABLE_INFERENCE_RESTRICTED'
          : policy.has(fixture_id) ? 'EXPECTED_ERROR_OR_POLICY_PARITY_PASS' : 'NUMERICAL_AND_STRUCTURAL_PARITY_PASS'
    })),
    negative_controls: pins.e3_negative_control_names.map(name => ({ name, status: 'PASS_REJECTED' })),
    fix15: {
      proposal: 'OBSERVED_SUCCESS_WITHOUT_SEPARATION_WARNING',
      historical_manifest_unchanged: 'SUCCESS_WITH_WARNING / SEPARATION_WARNING',
      historical_assertion_matrix_unchanged: 'OUTPUT_READY',
      lp: {
        positive_and_negative_controls_status: 'PASS',
        warning_capture_positive_control: { capture_status: 'PASS' },
        target: [{ tolerance: 0.0001, overall: 'NO', complete: 'NO', quasi: 'NO' }, { tolerance: 1e-8, overall: 'NO', complete: 'NO', quasi: 'NO' }]
      }
    },
    fix16: {
      mathematical_classification: 'COMPLETE_SEPARATION_NO_FINITE_MLE',
      lp: [{ tolerance: 0.0001, overall: 'YES', complete: 'YES', quasi: 'NO', finite: [{ finite_mle: false }] }, { tolerance: 1e-8, overall: 'YES', complete: 'YES', quasi: 'NO', finite: [{ finite_mle: false }] }],
      publication_restriction: 'OUTPUT_GENERATION_RESTRICTED',
      production_worker_anchor: { status: 'PASS', publication_verdict_preserved_as_anchor: 'OUTPUT_GENERATION_RESTRICTED' },
      covariance: { causal_explanation: 'UNRESOLVED' }
    }
  };
  const e4 = {
    final_verdict: 'CLOSURE_E4_READY_FOR_INDEPENDENT_PHASE_CLOSURE', self_declared_closure: false,
    summary: {
      total_fixtures_evaluated: 25, ordinary_scientific_parity_passes: 18,
      expected_policy_error_passes: 5, erratum_dependent_exceptions: 2,
      frozen_numerical_failures: 3, aggregate_numerical_parity_pass: false
    },
    fix16: { publication_restriction: 'OUTPUT_GENERATION_RESTRICTED', covariance_causal_explanation: 'UNRESOLVED', original_numeric_failures_remain_fail: true },
    original_numerical_comparison: { numeric_failures: 3 },
    outcomes: { original_numerical_parity: 'FAIL', fix16_publication_safety: 'PASS_RESTRICTION_PRESERVED' },
    negative_control_audit: pins.e3_negative_control_names.map((name, i) => ({ name, E3_mutation_result: 'PASS_REJECTED', direct_falsification_status: i === 0 ? 'FULL_ARCHIVED_EVIDENCE_VALIDATOR' : 'PASS' })),
    direct_falsification_tests: { tests: 33, passed: 33, failed: 0 },
    golden_reference_governance: { candidate_sha256: pins.frozen.candidate_native_reference_sha256, webr_numerical_parity_certified: false }
  };
  return { e3, e4 };
}

test('exact baseline strict matrix accepts only the four established failures', () => {
  assert.equal(validateStrictComparison(strictReport(), pins).numeric_failures.length, 3);
});

test('a new strict failure row is rejected instead of being normalized into the known matrix', () => {
  const report = strictReport();
  report.failures.push('fix_01_well_conditioned.coefficient.extra:difference=1:tolerance=0.0001');
  assert.throws(() => validateStrictComparison(report, pins), /strict.failures.length/);
});

test('a changed numeric observation is rejected even when the failing field name is unchanged', () => {
  const report = strictReport();
  report.numeric_comparisons[0].actual += 0.0001;
  assert.throws(() => validateStrictComparison(report, pins), /strict.raw_numeric_failure_matrix/);
});

test('a changed baseline fixture identity or duplicate fixture fails closed', () => {
  const report = strictReport();
  report.fixtures[0].id = report.fixtures[1].id;
  assert.throws(() => validateStrictComparison(report, pins), /strict.fixture_ids/);
});

test('a renamed FAIL to PASS does not satisfy the strict matrix', () => {
  const report = strictReport();
  report.status = 'PASS';
  assert.throws(() => validateStrictComparison(report, pins), /strict.status/);
});

test('the exact 18/5/1/1 adjudication and all 19 E3 controls are required', () => {
  const evidence = adjudicationEvidence();
  const result = validateScientificClassification(evidence.e3, evidence.e4, pins);
  assert.deepEqual(result.counts, {
    NUMERICAL_AND_STRUCTURAL_PARITY_PASS: 18,
    EXPECTED_ERROR_OR_POLICY_PARITY_PASS: 5,
    HISTORICAL_WARNING_CONTRACT_EXCEPTION: 1,
    NON_IDENTIFIABLE_INFERENCE_RESTRICTED: 1
  });
});

test('a fix16 publication restriction removal fails the scientific gate', () => {
  const evidence = adjudicationEvidence();
  evidence.e4.fix16.publication_restriction = 'OUTPUT_READY';
  assert.throws(() => validateScientificClassification(evidence.e3, evidence.e4, pins), /publication_restriction/);
});

test('exception spread to an ordinary fixture fails the exact classification counts', () => {
  const evidence = adjudicationEvidence();
  evidence.e3.fixture_adjudications[0].outcome = 'NON_IDENTIFIABLE_INFERENCE_RESTRICTED';
  assert.throws(() => validateScientificClassification(evidence.e3, evidence.e4, pins), /classification_counts/);
});

test('missing an E3 negative control fails closed', () => {
  const evidence = adjudicationEvidence();
  evidence.e4.negative_control_audit.pop();
  assert.throws(() => validateScientificClassification(evidence.e3, evidence.e4, pins), /negative_controls.length/);
});

test('concealing an original fix16 numerical failure is rejected', () => {
  const evidence = adjudicationEvidence();
  evidence.e4.summary.frozen_numerical_failures = 0;
  assert.throws(() => validateScientificClassification(evidence.e3, evidence.e4, pins), /numeric_failures/);
});

test('the strict workflow failure must remain isolated to the known comparison job and step', () => {
  const jobs = [
    ['Gate A exact native R and package provisioning', 'success'],
    ['Generate and validate native candidate across 25 fixtures', 'success'],
    ['Static build, Chromium Worker, privacy and regressions', 'success'],
    ['Native versus Chromium parity, falsification and evidence package', 'failure'],
    ['Aggregate required gate states', 'success']
  ].map(([name, conclusion]) => ({ name, conclusion, steps: conclusion === 'failure' ? [{ name: 'Compare all fixtures and execute negative controls', conclusion: 'failure' }] : [] }));
  assert.equal(validateStrictWorkflowJobs({ jobs }).filter(row => row.conclusion === 'failure').length, 1);
});

test('an unrelated strict workflow job failure is rejected', () => {
  const jobs = [
    ['Gate A exact native R and package provisioning', 'failure'],
    ['Generate and validate native candidate across 25 fixtures', 'success'],
    ['Static build, Chromium Worker, privacy and regressions', 'success'],
    ['Native versus Chromium parity, falsification and evidence package', 'failure'],
    ['Aggregate required gate states', 'success']
  ].map(([name, conclusion]) => ({ name, conclusion, steps: [] }));
  assert.throws(() => validateStrictWorkflowJobs({ jobs }), /strict_run.jobs.conclusions/);
});
