import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { deriveVersionedFixtureAdjudications, parseTapResults, validateStrictComparison } from './qualify.mjs';

const fixtureIds = [
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
const failureRows = [
  {
    name: 'fix_16_complete_separation.coefficient.(Intercept).standard_error',
    actual: 39815.87849877388, reference: 39815.8764891409,
    absolute_difference: 0.002009632982662879, tolerance: 0.0001, status: 'FAIL'
  },
  {
    name: 'fix_16_complete_separation.coefficient.x_sep.standard_error',
    actual: 3981.587849877386, reference: 3981.58764891409,
    absolute_difference: 0.0002009632958106522, tolerance: 0.0001, status: 'FAIL'
  },
  {
    name: 'fix_16_complete_separation.glm.maximum_standard_error',
    actual: 39815.87849877388, reference: 39815.8764891409,
    absolute_difference: 0.002009632982662879, tolerance: 0.0001, status: 'FAIL'
  }
].map(row => ({ ...row, semantics: 'numeric' }));
const pins = {
  original_strict_closure: {
    workflow_run_id: '40030723201',
    commit_sha: 'ad7de4547b3b131d5d81c046eea035f80aff4ec0',
    branch: 'development',
    conclusion: 'failure'
  },
  original_failure_counts: {
    fixtures: 25, fixture_passes: 23, fixture_failures: 2,
    numeric_comparisons: 3, numeric_passes: 0, numeric_failures: 3,
    baseline_failures: 4, tolerance: 0.0001
  },
  original_failure_names: [
    'fix_15_quasi_separation:warning/diagnostic distinction is absent',
    'fix_16_complete_separation.coefficient.(Intercept).standard_error',
    'fix_16_complete_separation.coefficient.x_sep.standard_error',
    'fix_16_complete_separation.glm.maximum_standard_error'
  ],
  original_numeric_failure_rows: failureRows
};

function comparisonFixture() {
  return {
    commit_sha: pins.original_strict_closure.commit_sha,
    status: 'FAIL',
    summary: {
      manifest_fixture_count: 25,
      compared_fixture_count: 25,
      passing_fixture_count: 23,
      failing_fixture_count: 2,
      numerical_comparison_count: 3,
      numerical_pass_count: 0,
      numerical_fail_count: 3,
      baseline_failure_count: 4
    },
    failures: [
      pins.original_failure_names[0],
      ...failureRows.map(row => `${row.name}:difference=${row.absolute_difference}:tolerance=${row.tolerance}`)
    ],
    numeric_comparisons: structuredClone(failureRows),
    fixtures: fixtureIds.map(id => ({
      id,
      status: ['fix_15_quasi_separation', 'fix_16_complete_separation'].includes(id) ? 'FAIL' : 'PASS'
    }))
  };
}

const run = {
  id: 40030723201,
  head_sha: 'ad7de4547b3b131d5d81c046eea035f80aff4ec0',
  head_branch: 'development',
  status: 'completed',
  conclusion: 'failure'
};

test('strict comparison validator accepts exactly the preserved four-failure matrix', () => {
  const result = validateStrictComparison(comparisonFixture(), run, pins);
  assert.equal(result.numericTotals.count, 3);
  assert.equal(result.numericTotals.fail_count, 3);
  assert.equal(result.expectedFailureMessages.length, 4);
});

test('strict comparison validator rejects a newly introduced failure', () => {
  const value = comparisonFixture();
  value.failures.push('fix_17_rank_deficient:new failure');
  assert.throws(() => validateStrictComparison(value, run, pins), /strict_comparison\.failures\.exact/);
});

test('strict comparison validator rejects concealment or mutation of a frozen numeric failure', () => {
  const concealed = comparisonFixture();
  concealed.numeric_comparisons.pop();
  assert.throws(() => validateStrictComparison(concealed, run, pins), /strict_comparison\.numeric_recount/);

  const changed = comparisonFixture();
  changed.numeric_comparisons[0].actual += 1;
  assert.throws(() => validateStrictComparison(changed, run, pins), /absolute_difference/);
});

test('TAP reader requires passing direct falsification tests', () => {
  const names = [
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
  const tap = `TAP version 13\n${names.map((name, index) => `ok ${index + 1} - ${name}`).join('\n')}\n1..${names.length}\n# tests ${names.length}\n# pass ${names.length}\n# fail 0\n`;
  const parsed = parseTapResults(tap);
  assert.equal(parsed.tests, names.length);
  assert.throws(() => parseTapResults(tap.replace(`ok 1 - ${names[0]}`, `not ok 1 - ${names[0]}`)), /required direct falsification test missing or failed/);
});

test('versioned fixture mapping preserves E3 history and uses the amended fix16 class', () => {
  const rows = [
    { fixture_id: 'fix_15_quasi_separation', outcome: 'HISTORICAL_WARNING_CONTRACT_EXCEPTION', proposed_status: 'OBSERVED_SUCCESS_WITHOUT_SEPARATION_WARNING' },
    { fixture_id: 'fix_16_complete_separation', outcome: 'NON_IDENTIFIABLE_INFERENCE_RESTRICTED', proposed_status: 'INFERENCE_NON_IDENTIFIABLE_OUTPUT_RESTRICTED' }
  ];
  const result = deriveVersionedFixtureAdjudications(rows);
  assert.equal(result[0].source_e3_outcome, 'HISTORICAL_WARNING_CONTRACT_EXCEPTION');
  assert.equal(result[0].outcome, 'HISTORICAL_WARNING_CONTRACT_EXCEPTION');
  assert.equal(result[1].source_e3_outcome, 'NON_IDENTIFIABLE_INFERENCE_RESTRICTED');
  assert.equal(result[1].outcome, 'INFERENCE_NON_IDENTIFIABLE_OUTPUT_RESTRICTED');
});

test('roadmap interpretation keeps CP-WEBR-02 and CP-STAT-02 stop conditions separate', () => {
  const roadmap = fs.readFileSync('docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md', 'utf8');
  const e4 = fs.readFileSync('experiments/cp-webr-02-closure/e4/CP-WEBR-02-SCIENTIFIC-EQUIVALENCE-AMENDMENT-v1.md', 'utf8');
  const webR = roadmap.indexOf('Phase CP-WEBR-02: Dedicated Worker WebR Engine Integration');
  const stat = roadmap.indexOf('Phase CP-STAT-02: Scientific Separation & Golden Test Expansion');
  assert.ok(webR >= 0 && stat > webR);
  assert.match(roadmap.slice(webR, stat), /Stop Condition: 25 synthetic fixtures match native R golden results/);
  assert.match(roadmap.slice(stat), /Stop Condition: 100% semantic and numerical tolerance parity/);
  assert.match(e4, /additive interpretation of the CP-WEBR-02 clause only/);
  assert.match(e4, /CP-STAT-02.*unchanged/);
});
