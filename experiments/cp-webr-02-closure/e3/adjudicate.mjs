#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PIN_FILE = path.join(HERE, 'evidence-pins.json');
export const ERRATUM_FILE = path.join(HERE, 'CP-WEBR-02-NATIVE-PARITY-ERRATUM-v1.md');
const EXPECTED_PIN_FILE_SHA256 = '603f1720af3ce6d9a02a73a8f3e4dcff337711bd102a4407528d507c3dc6e8e5';
const EXPECTED_FIXTURE_IDS = [
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
const ERROR_POLICY_IDS = new Set([
  'fix_19_missing_values', 'fix_19b_missing_treatment', 'fix_20_malformed_category',
  'fix_23_no_eligible_match', 'fix_24_duplicate_ids'
]);
const EXPECTED_MANIFEST_STATUS = new Map([
  ['fix_01_well_conditioned', 'SUCCESS'], ['fix_02_mixed_types', 'SUCCESS'],
  ['fix_03_ref_level_change', 'SUCCESS'], ['fix_04_input_row_order', 'SUCCESS'],
  ['fix_05_exact_distance_ties', 'SUCCESS'], ['fix_06_no_caliper_nearest', 'SUCCESS'],
  ['fix_07_prob_scale_caliper', 'SUCCESS'], ['fix_08_linear_logit_caliper', 'SUCCESS'],
  ['fix_09_standardized_caliper', 'SUCCESS'], ['fix_10_whole_vs_pooled_sd', 'SUCCESS'],
  ['fix_11_pre_match_discard', 'SUCCESS'], ['fix_12_caliper_unmatched', 'SUCCESS'],
  ['fix_13_more_treated_than_control', 'SUCCESS'], ['fix_14_more_controls_than_treated', 'SUCCESS'],
  ['fix_15_quasi_separation', 'SUCCESS_WITH_WARNING'], ['fix_16_complete_separation', 'SUCCESS_WITH_WARNING'],
  ['fix_17_rank_deficient', 'SUCCESS'], ['fix_18_zero_variance', 'SUCCESS'],
  ['fix_19_missing_values', 'EXPECTED_REFERENCE_ERROR'], ['fix_19b_missing_treatment', 'EXPECTED_REFERENCE_ERROR'],
  ['fix_20_malformed_category', 'SUCCESS'], ['fix_21_extreme_propensities', 'SUCCESS_WITH_WARNING'],
  ['fix_22_small_sample', 'SUCCESS'], ['fix_23_no_eligible_match', 'EXPECTED_ZERO_MATCHES'],
  ['fix_24_duplicate_ids', 'CLINICALPSM_POLICY_REJECT']
]);
const EXPECTED_COMPARATOR_CLASSIFICATION = new Map([
  ...[...EXPECTED_MANIFEST_STATUS.entries()].filter(([id]) => !ERROR_POLICY_IDS.has(id)).map(([id, status]) => [id, status]),
  ['fix_19_missing_values', 'EXPECTED_MISSING_COVARIATE_REJECTION'],
  ['fix_19b_missing_treatment', 'EXPECTED_MISSING_TREATMENT_REJECTION'],
  ['fix_20_malformed_category', 'PRODUCT_POLICY_REJECTION_HISTORICAL_MANIFEST_SUCCESS'],
  ['fix_23_no_eligible_match', 'EXPECTED_ZERO_MATCHES_SAFE_ERROR'],
  ['fix_24_duplicate_ids', 'PRODUCT_POLICY_REJECTION_DUPLICATE_ID']
]);
const EXPECTED_WORKER_ERRORS = new Map([
  ['fix_19_missing_values', 'MISSING_COVARIATE'],
  ['fix_19b_missing_treatment', 'MISSING_TREATMENT'],
  ['fix_20_malformed_category', 'MISSING_COVARIATE'],
  ['fix_23_no_eligible_match', 'WORKER_ERROR'],
  ['fix_24_duplicate_ids', 'DUPLICATE_UNIT_ID_REJECTED']
]);
const FAILURE_ROWS = [
  {
    name: 'fix_16_complete_separation.coefficient.(Intercept).standard_error',
    actual: 39815.87849877388, reference: 39815.8764891409,
    absolute_difference: 0.002009632982662879, tolerance: 0.0001
  },
  {
    name: 'fix_16_complete_separation.coefficient.x_sep.standard_error',
    actual: 3981.587849877386, reference: 3981.58764891409,
    absolute_difference: 0.0002009632958106522, tolerance: 0.0001
  },
  {
    name: 'fix_16_complete_separation.glm.maximum_standard_error',
    actual: 39815.87849877388, reference: 39815.8764891409,
    absolute_difference: 0.002009632982662879, tolerance: 0.0001
  }
];
const FIXTURE_EXCEPTION_IDENTITIES = new Map([
  ['fix_15_quasi_separation', {
    csv: 'd81473a891c29084fe15578925df0416106a4b0badd4f1d35a65f3bc12d46a59',
    config: '95f621feba15025d657e7e78b6be3d637d800acde633f94a40eb1fe1e5b83423'
  }],
  ['fix_16_complete_separation', {
    csv: '790e28259d5b7e5967d399848e79a59a61001a38cabbdacacf6e2560808ec26b',
    config: 'dc1b024f27a22ba88393bd8b4004821cac224ea18f6fc95bfa5d97ed36259c62'
  }]
]);
const NEGATIVE_CONTROL_CATEGORIES = {
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
const FIX21_NATIVE_WARNING_LEDGER = {
  glm: ['glm.fit: algorithm did not converge', 'glm.fit: fitted probabilities numerically 0 or 1 occurred'],
  matchit: [
    '(from `stats::glm()`) glm.fit: algorithm did not converge.',
    '(from `stats::glm()`) glm.fit: fitted probabilities numerically 0 or 1\noccurred.'
  ],
  cobalt_raw: [],
  cobalt_std: []
};

export function fail(pathName, message) {
  throw new Error(`${pathName}: ${message}`);
}

function requireValue(condition, pathName, message) {
  if (!condition) fail(pathName, message);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readBytes(file) {
  return fs.readFileSync(file);
}

function expectEqual(actual, expected, pathName) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(pathName, `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function expectType(value, expected, pathName) {
  requireValue(typeof value === expected, pathName, `expected ${expected}, received ${typeof value}`);
}

function expectArray(value, pathName) {
  requireValue(Array.isArray(value), pathName, 'expected array');
}

function expectKeys(value, expected, pathName) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), pathName, 'expected object');
  expectEqual(Object.keys(value).sort(), [...expected].sort(), `${pathName}.keys`);
}

export function compareNumericObservation(actual, reference, tolerance, pathName = 'numeric') {
  requireValue(typeof tolerance === 'number' && Number.isFinite(tolerance) && tolerance >= 0, `${pathName}.tolerance`, 'expected finite non-negative tolerance');
  const actualNull = actual === null || actual === undefined;
  const referenceNull = reference === null || reference === undefined;
  if (actualNull || referenceNull) {
    const matched = actualNull && referenceNull;
    return { semantics: 'null', absolute_difference: null, status: matched ? 'PASS' : 'FAIL' };
  }
  requireValue(typeof actual === 'number' && Number.isFinite(actual), `${pathName}.actual`, 'expected finite number or typed null');
  requireValue(typeof reference === 'number' && Number.isFinite(reference), `${pathName}.reference`, 'expected finite number or typed null');
  const absoluteDifference = Math.abs(actual - reference);
  return { semantics: 'numeric', absolute_difference: absoluteDifference, status: absoluteDifference <= tolerance ? 'PASS' : 'FAIL' };
}

export function validateNumericComparisonRow(row, pathName = 'comparison.numeric_comparisons[]') {
  expectKeys(row, ['name', 'semantics', 'actual', 'reference', 'tolerance', 'absolute_difference', 'status'], pathName);
  expectType(row.name, 'string', `${pathName}.name`);
  const evaluated = compareNumericObservation(row.actual, row.reference, row.tolerance, pathName);
  expectEqual(row.semantics, evaluated.semantics, `${pathName}.semantics`);
  expectEqual(row.absolute_difference, evaluated.absolute_difference, `${pathName}.absolute_difference`);
  expectEqual(row.status, evaluated.status, `${pathName}.status`);
  return evaluated;
}

export function validateNumericComparisonRows(rows, pathName = 'comparison.numeric_comparisons') {
  expectArray(rows, pathName);
  rows.forEach((row, index) => validateNumericComparisonRow(row, `${pathName}[${index}]`));
  return {
    count: rows.length,
    pass_count: rows.filter(row => row.status === 'PASS').length,
    fail_count: rows.filter(row => row.status === 'FAIL').length
  };
}

export function validateRequiredWarningLedger(warnings, pathName = 'warning_ledger', { allowStructured = false } = {}) {
  expectArray(warnings, pathName);
  requireValue(warnings.length > 0, pathName, 'genuine runtime warning missing');
  warnings.forEach((warning, index) => {
    if (typeof warning === 'string') return;
    requireValue(allowStructured, `${pathName}[${index}]`, 'expected warning string');
    expectKeys(warning, ['code', 'message', 'severity', 'impactDescription'], `${pathName}[${index}]`);
    for (const field of ['code', 'message', 'severity', 'impactDescription']) expectType(warning[field], 'string', `${pathName}[${index}].${field}`);
  });
  return warnings.length;
}

export function validateExceptionScope(fixtureId, candidateIdentity, workerIdentity = null, pathName = 'exception_scope') {
  const expected = FIXTURE_EXCEPTION_IDENTITIES.get(fixtureId);
  requireValue(expected, `${pathName}.${fixtureId}`, 'fixture is outside the exact exception allowlist');
  expectEqual(candidateIdentity?.csv, expected.csv, `${pathName}.${fixtureId}.candidate.csv_sha256`);
  expectEqual(candidateIdentity?.config, expected.config, `${pathName}.${fixtureId}.candidate.config_sha256`);
  if (workerIdentity) {
    expectEqual(workerIdentity.id, fixtureId, `${pathName}.${fixtureId}.worker.id`);
    expectEqual(workerIdentity.csv_sha256, expected.csv, `${pathName}.${fixtureId}.worker.csv_sha256`);
    expectEqual(workerIdentity.config_sha256, expected.config, `${pathName}.${fixtureId}.worker.config_sha256`);
  }
  return true;
}

function uniqueIds(items, pathName) {
  expectArray(items, pathName);
  const ids = items.map((item, index) => {
    expectType(item?.id, 'string', `${pathName}[${index}].id`);
    requireValue(item.id.length > 0, `${pathName}[${index}].id`, 'blank fixture ID');
    return item.id;
  });
  requireValue(new Set(ids).size === ids.length, pathName, 'duplicate fixture ID');
  return ids;
}

export function validateFixtureIdentityCoverage(items, expected, pathName = 'fixtures') {
  const ids = uniqueIds(items, pathName);
  expectEqual([...ids].sort(), [...expected].sort(), pathName);
  return ids;
}

function byId(items, pathName, expectedIds = null) {
  const ids = expectedIds ? validateFixtureIdentityCoverage(items, expectedIds, pathName) : uniqueIds(items, pathName);
  return new Map(ids.map((id, index) => [id, items[index]]));
}

function assertSet(actual, expected, pathName) {
  expectEqual([...actual].sort(), [...expected].sort(), pathName);
}

function validateMatrix(matrix, pathName) {
  requireValue(matrix && typeof matrix === 'object' && !Array.isArray(matrix), pathName, 'expected named matrix envelope');
  expectKeys(matrix, ['row_names', 'column_names', 'dimensions', 'values', 'decimal17'], pathName);
  expectArray(matrix.dimensions, `${pathName}.dimensions`);
  expectEqual(matrix.dimensions.length, 2, `${pathName}.dimensions.length`);
  const [rows, cols] = matrix.dimensions;
  requireValue(Number.isInteger(rows) && rows >= 0 && Number.isInteger(cols) && cols >= 0, `${pathName}.dimensions`, 'invalid dimensions');
  expectArray(matrix.row_names, `${pathName}.row_names`);
  expectArray(matrix.column_names, `${pathName}.column_names`);
  matrix.row_names.forEach((name, index) => expectType(name, 'string', `${pathName}.row_names[${index}]`));
  matrix.column_names.forEach((name, index) => expectType(name, 'string', `${pathName}.column_names[${index}]`));
  expectArray(matrix.values, `${pathName}.values`);
  expectEqual(matrix.row_names.length, rows, `${pathName}.row_names.length`);
  expectEqual(matrix.column_names.length, cols, `${pathName}.column_names.length`);
  expectEqual(matrix.values.length, rows, `${pathName}.values.length`);
  matrix.values.forEach((row, index) => {
    expectArray(row, `${pathName}.values[${index}]`);
    expectEqual(row.length, cols, `${pathName}.values[${index}].length`);
    row.forEach((value, column) => {
      requireValue(value === null || (typeof value === 'number' && Number.isFinite(value)), `${pathName}.values[${index}][${column}]`, 'expected finite number or typed null');
    });
  });
  expectArray(matrix.decimal17, `${pathName}.decimal17`);
  expectEqual(matrix.decimal17.length, rows, `${pathName}.decimal17.length`);
  matrix.decimal17.forEach((row, index) => {
    expectArray(row, `${pathName}.decimal17[${index}]`);
    expectEqual(row.length, cols, `${pathName}.decimal17[${index}].length`);
    row.forEach((value, column) => {
      requireValue(value === null || typeof value === 'string', `${pathName}.decimal17[${index}][${column}]`, 'expected exact decimal string or typed null');
      expectEqual(value === null, matrix.values[index][column] === null, `${pathName}.decimal17[${index}][${column}].null_semantics`);
    });
  });
}

function validateAtomicVector(vector, pathName, { named = false, allowUnnamed = false, allowNull = true } = {}) {
  requireValue(vector && typeof vector === 'object' && !Array.isArray(vector), pathName, 'expected atomic vector envelope');
  expectKeys(vector, ['names', 'values', 'decimal17'], pathName);
  expectArray(vector.values, `${pathName}.values`);
  vector.values.forEach((value, index) => {
    requireValue(value === null ? allowNull : typeof value === 'number' && Number.isFinite(value), `${pathName}.values[${index}]`, 'expected finite numeric value or typed null');
  });
  if (named) {
    if (vector.names === null && allowUnnamed) {
      // R atomic vectors can be unnamed; keep that distinct from an empty names vector.
    } else {
      expectArray(vector.names, `${pathName}.names`);
      expectEqual(vector.names.length, vector.values.length, `${pathName}.names.length`);
      vector.names.forEach((name, index) => expectType(name, 'string', `${pathName}.names[${index}]`));
    }
  } else {
    requireValue(vector.names === null || Array.isArray(vector.names), `${pathName}.names`, 'unexpected names representation');
    if (Array.isArray(vector.names)) expectEqual(vector.names.length, vector.values.length, `${pathName}.names.length`);
  }
  expectArray(vector.decimal17, `${pathName}.decimal17`);
  expectEqual(vector.decimal17.length, vector.values.length, `${pathName}.decimal17.length`);
  vector.decimal17.forEach((value, index) => {
    requireValue(value === null || typeof value === 'string', `${pathName}.decimal17[${index}]`, 'expected exact decimal string or typed null');
    expectEqual(value === null, vector.values[index] === null, `${pathName}.decimal17[${index}].null_semantics`);
  });
}

export { validateAtomicVector, validateMatrix };

export function validateSerializedFixture(fixture, schema, pathName = 'fixture') {
  expectKeys(fixture, ['id', 'input', 'glm', 'model_matrix', 'factorization', 'environment'], pathName);
  expectType(fixture.id, 'string', `${pathName}.id`);
  expectEqual(fixture.id, schema.id, `${pathName}.id`);
  expectKeys(fixture.input, ['row_ids', 'row_count', 'formula', 'treatment'], `${pathName}.input`);
  expectKeys(fixture.glm, ['warnings', 'coefficients', 'summary_coefficients', 'vcov', 'covariance_unscaled', 'covariance_scaled', 'se_from_vcov', 'converged', 'iter', 'rank', 'deviance', 'null_deviance', 'linear_predictors', 'fitted_values', 'fitted_probability_range', 'working_weights', 'prior_weights', 'boundary', 'aliased'], `${pathName}.glm`);
  expectKeys(fixture.model_matrix, ['row_ids', 'columns', 'values', 'response'], `${pathName}.model_matrix`);
  expectKeys(fixture.factorization, ['qr_rank', 'pivot', 'qraux', 'tolerance', 'r_factor', 'qr_covariance_reconstruction_from_stored_R', 'qr_covariance_reconstruction_matches_unscaled', 'information_matrix_from_final_working_weights', 'normal_equation_inverse_diagnostic_only', 'condition'], `${pathName}.factorization`);
  expectKeys(fixture.environment, ['r_version', 'r_platform', 'extSoftVersion', 'locale', 'session_info', 'timezone'], `${pathName}.environment`);
  expectKeys(fixture.glm.fitted_probability_range, ['minimum', 'maximum'], `${pathName}.glm.fitted_probability_range`);
  expectArray(fixture.glm.warnings, `${pathName}.glm.warnings`);
  fixture.glm.warnings.forEach((warning, index) => expectType(warning, 'string', `${pathName}.glm.warnings[${index}]`));
  for (const key of ['formula']) expectType(fixture.input[key], 'string', `${pathName}.input.${key}`);
  for (const [index, rowId] of fixture.input.row_ids.entries()) expectType(rowId, 'string', `${pathName}.input.row_ids[${index}]`);
  requireValue(new Set(fixture.input.row_ids).size === fixture.input.row_ids.length, `${pathName}.input.row_ids`, 'duplicate row ID');
  fixture.input.treatment.forEach((value, index) => requireValue(value === 0 || value === 1, `${pathName}.input.treatment[${index}]`, 'expected numeric binary treatment'));
  expectType(fixture.glm.converged, 'boolean', `${pathName}.glm.converged`);
  expectType(fixture.glm.iter, 'number', `${pathName}.glm.iter`);
  expectType(fixture.glm.rank, 'number', `${pathName}.glm.rank`);
  for (const field of ['deviance', 'null_deviance']) requireValue(typeof fixture.glm[field] === 'number' && Number.isFinite(fixture.glm[field]), `${pathName}.glm.${field}`, 'expected finite scalar');
  expectType(fixture.glm.boundary, 'boolean', `${pathName}.glm.boundary`);
  expectEqual(fixture.id, schema.id, `${pathName}.fixture_id`);
  expectArray(fixture.input.row_ids, `${pathName}.input.row_ids`);
  expectArray(fixture.input.treatment, `${pathName}.input.treatment`);
  expectArray(fixture.factorization.pivot, `${pathName}.factorization.pivot`);
  expectEqual(fixture.input.row_count, schema.dimensions[0], `${pathName}.input.row_count`);
  expectEqual(fixture.input.row_ids.length, schema.dimensions[0], `${pathName}.input.row_ids.length`);
  expectEqual(fixture.input.treatment.length, schema.dimensions[0], `${pathName}.input.treatment.length`);
  expectEqual(fixture.model_matrix.row_ids, fixture.input.row_ids, `${pathName}.model_matrix.row_ids`);
  expectEqual(fixture.model_matrix.columns, schema.columns, `${pathName}.model_matrix.columns`);

  validateAtomicVector(fixture.glm.coefficients, `${pathName}.glm.coefficients`, { named: true });
  expectEqual(fixture.glm.coefficients.names, schema.columns, `${pathName}.glm.coefficients.names`);
  validateAtomicVector(fixture.glm.se_from_vcov, `${pathName}.glm.se_from_vcov`, { named: true });
  expectEqual(fixture.glm.se_from_vcov.names, schema.columns, `${pathName}.glm.se_from_vcov.names`);
  for (const field of ['vcov', 'covariance_unscaled', 'covariance_scaled']) {
    validateMatrix(fixture.glm[field], `${pathName}.glm.${field}`);
    expectEqual(fixture.glm[field].dimensions, [schema.columns.length, schema.columns.length], `${pathName}.glm.${field}.dimensions`);
    expectEqual(fixture.glm[field].row_names, schema.columns, `${pathName}.glm.${field}.row_names`);
    expectEqual(fixture.glm[field].column_names, schema.columns, `${pathName}.glm.${field}.column_names`);
  }
  validateMatrix(fixture.glm.summary_coefficients, `${pathName}.glm.summary_coefficients`);
  expectEqual(fixture.glm.summary_coefficients.dimensions, [schema.columns.length, 4], `${pathName}.glm.summary_coefficients.dimensions`);
  expectEqual(fixture.glm.summary_coefficients.row_names, schema.columns, `${pathName}.glm.summary_coefficients.row_names`);
  expectEqual(fixture.glm.summary_coefficients.column_names, ['Estimate', 'Std. Error', 'z value', 'Pr(>|z|)'], `${pathName}.glm.summary_coefficients.column_names`);
  validateMatrix(fixture.model_matrix.values, `${pathName}.model_matrix.values`);
  expectEqual(fixture.model_matrix.values.dimensions, schema.dimensions, `${pathName}.model_matrix.values.dimensions`);
  expectEqual(fixture.model_matrix.values.row_names, fixture.model_matrix.row_ids, `${pathName}.model_matrix.values.row_names`);
  expectEqual(fixture.model_matrix.values.column_names, schema.columns, `${pathName}.model_matrix.values.column_names`);
  validateAtomicVector(fixture.model_matrix.response, `${pathName}.model_matrix.response`, { named: true, allowNull: false });
  expectEqual(fixture.model_matrix.response.names, fixture.model_matrix.row_ids, `${pathName}.model_matrix.response.names`);
  expectEqual(fixture.model_matrix.response.values.length, schema.dimensions[0], `${pathName}.model_matrix.response.length`);
  for (const field of ['linear_predictors', 'fitted_values', 'working_weights', 'prior_weights', 'se_from_vcov']) {
    validateAtomicVector(fixture.glm[field], `${pathName}.glm.${field}`, { named: true });
  }
  for (const field of ['linear_predictors', 'fitted_values', 'working_weights', 'prior_weights']) {
    expectEqual(fixture.glm[field].values.length, schema.dimensions[0], `${pathName}.glm.${field}.length`);
  }
  validateAtomicVector(fixture.factorization.qraux, `${pathName}.factorization.qraux`, { named: true, allowUnnamed: true });
  expectEqual(fixture.factorization.qraux.values.length, schema.columns.length, `${pathName}.factorization.qraux.length`);
  expectEqual(fixture.factorization.qr_rank, fixture.glm.rank, `${pathName}.factorization.qr_rank`);
  expectEqual(fixture.factorization.pivot.length, schema.columns.length, `${pathName}.factorization.pivot.length`);
  requireValue(fixture.factorization.pivot.every(value => Number.isInteger(value) && value > 0), `${pathName}.factorization.pivot`, 'expected positive integer pivots');
  expectEqual(new Set(fixture.factorization.pivot).size, fixture.factorization.pivot.length, `${pathName}.factorization.pivot.unique`);
  validateMatrix(fixture.factorization.r_factor, `${pathName}.factorization.r_factor`);
  expectEqual(fixture.factorization.r_factor.dimensions, [schema.columns.length, schema.columns.length], `${pathName}.factorization.r_factor.dimensions`);
  expectEqual(fixture.factorization.r_factor.column_names, schema.columns, `${pathName}.factorization.r_factor.column_names`);
  const subRows = schema.columns.map((_, index) => `sub_${String(index + 1).padStart(4, '0')}`);
  expectEqual(fixture.factorization.r_factor.row_names, subRows, `${pathName}.factorization.r_factor.row_names`);
  for (const field of ['qr_covariance_reconstruction_from_stored_R', 'information_matrix_from_final_working_weights', 'normal_equation_inverse_diagnostic_only']) {
    validateMatrix(fixture.factorization[field], `${pathName}.factorization.${field}`);
    expectEqual(fixture.factorization[field].dimensions, [schema.columns.length, schema.columns.length], `${pathName}.factorization.${field}.dimensions`);
    expectEqual(fixture.factorization[field].row_names, schema.columns, `${pathName}.factorization.${field}.row_names`);
    expectEqual(fixture.factorization[field].column_names, schema.columns, `${pathName}.factorization.${field}.column_names`);
  }
  expectType(fixture.factorization.qr_covariance_reconstruction_matches_unscaled, 'boolean', `${pathName}.factorization.qr_covariance_reconstruction_matches_unscaled`);
  expectType(fixture.factorization.tolerance, 'number', `${pathName}.factorization.tolerance`);
  const condition = fixture.factorization.condition;
  expectKeys(condition, ['weighted_model_matrix', 'column_scaled_weighted_model_matrix', 'unscaled_information_matrix_eigenvalue_ratio', 'information_eigenvalues', 'weighted_column_norms'], `${pathName}.factorization.condition`);
  for (const field of ['weighted_model_matrix', 'column_scaled_weighted_model_matrix']) {
    expectKeys(condition[field], ['value', 'singular_values'], `${pathName}.factorization.condition.${field}`);
    requireValue(typeof condition[field].value === 'number' && Number.isFinite(condition[field].value), `${pathName}.factorization.condition.${field}.value`, 'expected finite scalar');
    expectArray(condition[field].singular_values, `${pathName}.factorization.condition.${field}.singular_values`);
    expectEqual(condition[field].singular_values.length, schema.columns.length, `${pathName}.factorization.condition.${field}.singular_values.length`);
    condition[field].singular_values.forEach((value, index) => requireValue(typeof value === 'number' && Number.isFinite(value), `${pathName}.factorization.condition.${field}.singular_values[${index}]`, 'expected finite scalar'));
  }
  requireValue(typeof condition.unscaled_information_matrix_eigenvalue_ratio === 'number' && Number.isFinite(condition.unscaled_information_matrix_eigenvalue_ratio), `${pathName}.factorization.condition.unscaled_information_matrix_eigenvalue_ratio`, 'expected finite scalar');
  expectArray(condition.information_eigenvalues, `${pathName}.factorization.condition.information_eigenvalues`);
  expectEqual(condition.information_eigenvalues.length, schema.columns.length, `${pathName}.factorization.condition.information_eigenvalues.length`);
  condition.information_eigenvalues.forEach((value, index) => requireValue(typeof value === 'number' && Number.isFinite(value), `${pathName}.factorization.condition.information_eigenvalues[${index}]`, 'expected finite scalar'));
  validateAtomicVector(condition.weighted_column_norms, `${pathName}.factorization.condition.weighted_column_norms`, { named: true });
  expectEqual(condition.weighted_column_norms.names, schema.columns, `${pathName}.factorization.condition.weighted_column_norms.names`);
  const aliased = fixture.glm.aliased;
  expectKeys(aliased, ['names', 'values', 'decimal17'], `${pathName}.glm.aliased`);
  expectEqual(aliased.names, schema.columns, `${pathName}.glm.aliased.names`);
  expectArray(aliased.values, `${pathName}.glm.aliased.values`);
  expectEqual(aliased.values.length, schema.columns.length, `${pathName}.glm.aliased.values.length`);
  aliased.values.forEach((value, index) => expectType(value, 'boolean', `${pathName}.glm.aliased.values[${index}]`));
  requireValue(aliased.decimal17 === null, `${pathName}.glm.aliased.decimal17`, 'logical values retain typed null decimal representation');
  expectType(fixture.environment.r_version, 'string', `${pathName}.environment.r_version`);
  expectType(fixture.environment.r_platform, 'string', `${pathName}.environment.r_platform`);
  expectType(fixture.environment.extSoftVersion, 'object', `${pathName}.environment.extSoftVersion`);
  for (const [key, value] of Object.entries(fixture.environment.extSoftVersion)) expectType(value, 'string', `${pathName}.environment.extSoftVersion.${key}`);
  for (const field of ['locale', 'session_info', 'timezone']) expectType(fixture.environment[field], 'string', `${pathName}.environment.${field}`);
  for (const [field, value] of Object.entries(fixture.glm.fitted_probability_range)) {
    requireValue(typeof value === 'number' && Number.isFinite(value), `${pathName}.glm.fitted_probability_range.${field}`, 'expected finite scalar');
  }
  return true;
}

export function validateWebrDiagnosticSchema(webr) {
  expectKeys(webr, ['schema', 'evidence_classification', 'commit_sha', 'webr_distribution_version', 'locked_r_version', 'locked_emscripten_version', 'webr_distribution_lock_sha256', 'runtime_asset_sha256', 'production_dedicated_worker_bundle_sha256', 'diagnostic_worker_source_sha256', 'runner_source_sha256', 'template_sha256', 'fixture_inputs', 'runs', 'network_observations', 'browser_console_errors'], 'e2.webr');
  expectEqual(webr.schema, 'CP-WEBR-02-CLOSURE-1-E2-webr-shadow-diagnostic-v2', 'e2.webr.schema');
  expectEqual(webr.webr_distribution_version, '0.6.0', 'e2.webr.distribution_version');
  expectEqual(webr.locked_r_version, '4.6.0', 'e2.webr.locked_r_version');
  expectEqual(webr.template_sha256, '7989403c7d093031b93a9c971a6d4f055101bab83c0ec4417fc52e4dceee24a4', 'e2.webr.template_sha256');
  for (const field of ['commit_sha', 'evidence_classification', 'locked_emscripten_version']) expectType(webr[field], 'string', `e2.webr.${field}`);
  for (const field of ['webr_distribution_lock_sha256', 'production_dedicated_worker_bundle_sha256', 'diagnostic_worker_source_sha256', 'runner_source_sha256', 'template_sha256']) {
    requireValue(typeof webr[field] === 'string' && /^[a-f0-9]{64}$/.test(webr[field]), `e2.webr.${field}`, 'expected SHA-256 hex string');
  }
  const runtimeAssets = ['R.js', 'R.wasm', 'libRblas.so', 'libRlapack.so', 'webr.js', 'webr-worker.js'];
  expectKeys(webr.runtime_asset_sha256, runtimeAssets, 'e2.webr.runtime_asset_sha256');
  for (const asset of runtimeAssets) requireValue(typeof webr.runtime_asset_sha256[asset] === 'string' && /^[a-f0-9]{64}$/.test(webr.runtime_asset_sha256[asset]), `e2.webr.runtime_asset_sha256.${asset}`, 'expected SHA-256 hex string');
  const fixtureSchema = [
    { id: 'fix_15_quasi_separation', dimensions: [100, 3], columns: ['(Intercept)', 'x_quasi', 'x_norm'], formula: 'treat ~ x_quasi + x_norm', csv: 'd81473a891c29084fe15578925df0416106a4b0badd4f1d35a65f3bc12d46a59', config: '95f621feba15025d657e7e78b6be3d637d800acde633f94a40eb1fe1e5b83423' },
    { id: 'fix_16_complete_separation', dimensions: [80, 2], columns: ['(Intercept)', 'x_sep'], formula: 'treat ~ x_sep', csv: '790e28259d5b7e5967d399848e79a59a61001a38cabbdacacf6e2560808ec26b', config: 'dc1b024f27a22ba88393bd8b4004821cac224ea18f6fc95bfa5d97ed36259c62' }
  ];
  expectArray(webr.fixture_inputs, 'e2.webr.fixture_inputs');
  expectEqual(webr.fixture_inputs.length, fixtureSchema.length, 'e2.webr.fixture_inputs.length');
  const inputMap = byId(webr.fixture_inputs, 'e2.webr.fixture_inputs');
  assertSet(inputMap.keys(), fixtureSchema.map(item => item.id), 'e2.webr.fixture_inputs.ids');
  for (const spec of fixtureSchema) {
    const input = inputMap.get(spec.id);
    expectKeys(input, ['id', 'formula', 'csv_sha256', 'config_sha256'], `e2.webr.fixture_inputs.${spec.id}`);
    expectEqual(input.formula, spec.formula, `e2.webr.fixture_inputs.${spec.id}.formula`);
    expectEqual(input.csv_sha256, spec.csv, `e2.webr.fixture_inputs.${spec.id}.csv_sha256`);
    expectEqual(input.config_sha256, spec.config, `e2.webr.fixture_inputs.${spec.id}.config_sha256`);
  }
  expectKeys(webr.network_observations, ['scope', 'requests', 'unmeasured'], 'e2.webr.network_observations');
  expectType(webr.network_observations.scope, 'string', 'e2.webr.network_observations.scope');
  expectArray(webr.network_observations.requests, 'e2.webr.network_observations.requests');
  for (const [index, request] of webr.network_observations.requests.entries()) {
    expectKeys(request, ['method', 'pathname', 'origin', 'body_present'], `e2.webr.network_observations.requests[${index}]`);
    for (const field of ['method', 'pathname', 'origin']) expectType(request[field], 'string', `e2.webr.network_observations.requests[${index}].${field}`);
    expectType(request.body_present, 'boolean', `e2.webr.network_observations.requests[${index}].body_present`);
  }
  expectArray(webr.network_observations.unmeasured, 'e2.webr.network_observations.unmeasured');
  webr.network_observations.unmeasured.forEach((value, index) => expectType(value, 'string', `e2.webr.network_observations.unmeasured[${index}]`));
  expectArray(webr.browser_console_errors, 'e2.webr.browser_console_errors');
  webr.browser_console_errors.forEach((value, index) => expectType(value, 'string', `e2.webr.browser_console_errors[${index}]`));
  expectArray(webr.runs, 'e2.webr.runs');
  expectEqual(webr.runs.length, 2, 'e2.webr.runs.length');
  const expectedRootFields = ['id', 'input', 'glm', 'model_matrix', 'factorization', 'environment'];
  const expectedSectionFields = {
    glm: ['warnings', 'coefficients', 'summary_coefficients', 'vcov', 'covariance_unscaled', 'covariance_scaled', 'se_from_vcov', 'converged', 'iter', 'rank', 'deviance', 'null_deviance', 'linear_predictors', 'fitted_values', 'fitted_probability_range', 'working_weights', 'prior_weights', 'boundary', 'aliased'],
    model_matrix: ['row_ids', 'columns', 'values', 'response'],
    factorization: ['qr_rank', 'pivot', 'qraux', 'tolerance', 'r_factor', 'qr_covariance_reconstruction_from_stored_R', 'qr_covariance_reconstruction_matches_unscaled', 'information_matrix_from_final_working_weights', 'normal_equation_inverse_diagnostic_only', 'condition']
  };
  const replicateIds = webr.runs.map((run, index) => {
    expectKeys(run, ['type', 'evidence_classification', 'replicate', 'runtime', 'serialization_shape', 'fixtures', 'chromium_user_agent', 'page_cross_origin_isolated'], `e2.webr.runs[${index}]`);
    expectEqual(run.replicate, index + 1, `e2.webr.runs[${index}].replicate`);
    expectEqual(run.type, 'RESULT', `e2.webr.runs[${index}].type`);
    expectType(run.evidence_classification, 'string', `e2.webr.runs[${index}].evidence_classification`);
    expectType(run.chromium_user_agent, 'string', `e2.webr.runs[${index}].chromium_user_agent`);
    expectType(run.page_cross_origin_isolated, 'boolean', `e2.webr.runs[${index}].page_cross_origin_isolated`);
    expectKeys(run.runtime, ['webr_version', 'channel', 'channel_type_value', 'page_cross_origin_isolated', 'worker_cross_origin_isolated', 'shared_array_buffer_available', 'r_environment'], `e2.webr.runs[${index}].runtime`);
    expectEqual(run.runtime?.webr_version, '0.6.0', `e2.webr.runs[${index}].runtime.webr_version`);
    expectEqual(run.runtime?.channel, 'SharedArrayBuffer', `e2.webr.runs[${index}].runtime.channel`);
    expectEqual(run.runtime?.page_cross_origin_isolated, true, `e2.webr.runs[${index}].runtime.page_cross_origin_isolated`);
    expectEqual(run.runtime?.worker_cross_origin_isolated, true, `e2.webr.runs[${index}].runtime.worker_cross_origin_isolated`);
    expectEqual(run.runtime?.shared_array_buffer_available, true, `e2.webr.runs[${index}].runtime.shared_array_buffer_available`);
    expectKeys(run.runtime.r_environment, ['r_version', 'r_platform', 'extSoftVersion', 'locale', 'session_info'], `e2.webr.runs[${index}].runtime.r_environment`);
    for (const field of ['r_version', 'r_platform', 'locale', 'session_info']) expectType(run.runtime.r_environment[field], 'string', `e2.webr.runs[${index}].runtime.r_environment.${field}`);
    expectType(run.runtime.r_environment.extSoftVersion, 'object', `e2.webr.runs[${index}].runtime.r_environment.extSoftVersion`);
    for (const [key, value] of Object.entries(run.runtime.r_environment.extSoftVersion)) expectType(value, 'string', `e2.webr.runs[${index}].runtime.r_environment.extSoftVersion.${key}`);
    expectEqual(run.runtime?.r_environment?.r_version, 'R version 4.6.0 (2026-04-24)', `e2.webr.runs[${index}].runtime.r_environment.r_version`);
    return run.replicate;
  });
  expectEqual(new Set(replicateIds).size, 2, 'e2.webr.runs.replicate');
  for (const [runIndex, run] of webr.runs.entries()) {
    expectKeys(run.serialization_shape, ['api', 'fixture_records'], `e2.webr.runs[${runIndex}].serialization_shape`);
    expectEqual(run.serialization_shape?.api, 'WebR 0.6.0 RObject.toJs({ depth: 0 })', `e2.webr.runs[${runIndex}].serialization_shape.api`);
    expectArray(run.fixtures, `e2.webr.runs[${runIndex}].fixtures`);
    expectEqual(run.fixtures.length, fixtureSchema.length, `e2.webr.runs[${runIndex}].fixtures.length`);
    const fixtureMap = byId(run.fixtures, `e2.webr.runs[${runIndex}].fixtures`);
    assertSet(fixtureMap.keys(), fixtureSchema.map(item => item.id), `e2.webr.runs[${runIndex}].fixtures.ids`);
    const observedShapes = byId(run.serialization_shape.fixture_records, `e2.webr.runs[${runIndex}].serialization_shape.fixture_records`);
    assertSet(observedShapes.keys(), fixtureSchema.map(item => item.id), `e2.webr.runs[${runIndex}].serialization_shape.fixture_records.ids`);
    for (const schema of fixtureSchema) {
      const fixture = fixtureMap.get(schema.id);
      const observed = observedShapes.get(schema.id);
      expectKeys(observed, ['id', 'root_type', 'root_fields', 'fixture_id', 'sections'], `e2.webr.runs[${runIndex}].shape.${schema.id}`);
      expectEqual(observed.root_type, 'list', `e2.webr.runs[${runIndex}].shape.${schema.id}.root_type`);
      expectEqual(observed.root_fields, expectedRootFields, `e2.webr.runs[${runIndex}].shape.${schema.id}.root_fields`);
      expectKeys(observed.sections, Object.keys(expectedSectionFields), `e2.webr.runs[${runIndex}].shape.${schema.id}.sections`);
      for (const [section, fields] of Object.entries(expectedSectionFields)) {
        expectKeys(observed.sections[section], ['type', 'fields', 'values_length'], `e2.webr.runs[${runIndex}].shape.${schema.id}.sections.${section}`);
        expectEqual(observed.sections[section].type, 'list', `e2.webr.runs[${runIndex}].shape.${schema.id}.sections.${section}.type`);
        expectEqual(observed.sections[section].fields, fields, `e2.webr.runs[${runIndex}].shape.${schema.id}.sections.${section}.fields`);
        expectEqual(observed.sections[section].values_length, fields.length, `e2.webr.runs[${runIndex}].shape.${schema.id}.sections.${section}.values_length`);
      }
      expectKeys(observed.fixture_id, ['type', 'names', 'values_length', 'value'], `e2.webr.runs[${runIndex}].shape.${schema.id}.fixture_id`);
      expectEqual(observed.fixture_id.type, 'character', `e2.webr.runs[${runIndex}].shape.${schema.id}.id.type`);
      expectEqual(observed.fixture_id.names, null, `e2.webr.runs[${runIndex}].shape.${schema.id}.id.names`);
      expectEqual(observed.fixture_id.values_length, 1, `e2.webr.runs[${runIndex}].shape.${schema.id}.id.values_length`);
      expectEqual(observed.fixture_id.value, schema.id, `e2.webr.runs[${runIndex}].shape.${schema.id}.id.value`);
      expectType(fixture.id, 'string', `e2.webr.runs[${runIndex}].${schema.id}.id`);
      requireValue(fixture.id === schema.id, `e2.webr.runs[${runIndex}].${schema.id}.id`, 'fixture ID must be an exact scalar string');
      if (schema.id === 'fix_15_quasi_separation') {
        expectEqual(fixture.glm.warnings, [], `e2.webr.runs[${runIndex}].${schema.id}.warnings`);
      }
      validateSerializedFixture(fixture, schema, `e2.webr.runs[${runIndex}].${schema.id}`);
    }
  }
  return {
    replicate_count: 2,
    replicate_records_are_distinct: webr.runs[0] !== webr.runs[1] && replicateIds[0] !== replicateIds[1],
    fixture_ids: fixtureSchema.map(item => item.id),
    fixture_count_per_replicate: 2,
    status: 'PASS'
  };
}

export function validateSemanticContracts({ manifest, candidate, comparison, worker, e2Comparison, e2Observations, nativeDiagnostics }) {
  expectArray(manifest.fixtures, 'manifest.fixtures');
  expectEqual(manifest.fixture_count, 25, 'manifest.fixture_count');
  expectEqual(manifest.fixtures.length, 25, 'manifest.fixtures.length');
  const manifestMap = byId(manifest.fixtures, 'manifest.fixtures', EXPECTED_FIXTURE_IDS);
  for (const id of EXPECTED_FIXTURE_IDS) expectEqual(manifestMap.get(id).expected_status, EXPECTED_MANIFEST_STATUS.get(id), `manifest.${id}.expected_status`);

  expectArray(candidate.fixtures, 'candidate.fixtures');
  expectEqual(candidate.fixture_count, 25, 'candidate.fixture_count');
  const candidateMap = byId(candidate.fixtures, 'candidate.fixtures', EXPECTED_FIXTURE_IDS);
  for (const id of EXPECTED_FIXTURE_IDS) {
    const native = candidateMap.get(id);
    expectEqual(native.manifest_expected_status, manifestMap.get(id).expected_status, `candidate.${id}.manifest_expected_status`);
    if (native.input_identity?.row_count !== undefined) {
      expectEqual(native.input_identity.row_count, manifestMap.get(id).n_total, `candidate.${id}.input_identity.row_count`);
    } else {
      expectEqual(native.native_classification, 'NOT_RUN_PRODUCT_POLICY_REJECTION', `candidate.${id}.not_run_policy_classification`);
    }
  }
  expectEqual(candidate.provenance?.r_version, '4.6.0', 'candidate.provenance.r_version');
  expectEqual(candidate.provenance?.package_versions?.MatchIt, '4.8.1', 'candidate.provenance.MatchIt_version');
  expectEqual(candidate.provenance?.package_versions?.cobalt, '5.0.0', 'candidate.provenance.cobalt_version');

  expectArray(worker.fixtures, 'production_worker.fixtures');
  expectEqual(worker.fixtures.length, 25, 'production_worker.fixtures.length');
  const workerMap = byId(worker.fixtures, 'production_worker.fixtures', EXPECTED_FIXTURE_IDS);
  expectArray(comparison.fixtures, 'comparison.fixtures');
  expectEqual(comparison.fixtures.length, 25, 'comparison.fixtures.length');
  const comparisonMap = byId(comparison.fixtures, 'comparison.fixtures', EXPECTED_FIXTURE_IDS);

  for (const id of EXPECTED_FIXTURE_IDS) {
    const spec = manifestMap.get(id);
    const reference = candidateMap.get(id);
    const actual = workerMap.get(id);
    const row = comparisonMap.get(id);
    expectEqual(actual.manifest_expected_status, spec.expected_status, `production_worker.${id}.manifest_expected_status`);
    expectEqual(actual.input_evidence?.id, id, `production_worker.${id}.input_evidence.id`);
    expectEqual(actual.input_evidence?.csv_sha256, reference.fixture_sha256?.csv, `production_worker.${id}.input_evidence.csv_sha256`);
    expectEqual(actual.input_evidence?.config_sha256, reference.fixture_sha256?.config, `production_worker.${id}.input_evidence.config_sha256`);
    if (FIXTURE_EXCEPTION_IDENTITIES.has(id)) {
      validateExceptionScope(id, reference.fixture_sha256, actual.input_evidence, `exception_scope.${id}`);
    }
    expectEqual(row.classification, EXPECTED_COMPARATOR_CLASSIFICATION.get(id), `comparison.${id}.classification`);
    expectEqual(row.status, id === 'fix_15_quasi_separation' || id === 'fix_16_complete_separation' ? 'FAIL' : 'PASS', `comparison.${id}.status`);
    expectEqual(actual.execution_path, 'chromium-built-static-app-production-dedicated-worker', `production_worker.${id}.execution_path`);
    if (EXPECTED_WORKER_ERRORS.has(id)) {
      expectEqual(actual.worker_message_type, 'ERROR', `production_worker.${id}.message_type`);
      expectEqual(actual.worker_error?.code, EXPECTED_WORKER_ERRORS.get(id), `production_worker.${id}.error_code`);
    } else {
      expectEqual(actual.worker_message_type, 'ANALYSIS_COMPLETE', `production_worker.${id}.message_type`);
    }
  }

  const summary = comparison.summary;
  expectEqual(summary.manifest_fixture_count, 25, 'comparison.summary.manifest_fixture_count');
  expectEqual(summary.compared_fixture_count, 25, 'comparison.summary.compared_fixture_count');
  expectEqual(summary.passing_fixture_count, 23, 'comparison.summary.passing_fixture_count');
  expectEqual(summary.failing_fixture_count, 2, 'comparison.summary.failing_fixture_count');
  expectEqual(summary.numerical_comparison_count, 16047, 'comparison.summary.numerical_comparison_count');
  expectEqual(summary.numerical_pass_count, 16044, 'comparison.summary.numerical_pass_count');
  expectEqual(summary.numerical_fail_count, 3, 'comparison.summary.numerical_fail_count');
  expectEqual(summary.baseline_failure_count, 4, 'comparison.summary.baseline_failure_count');
  expectArray(comparison.numeric_comparisons, 'comparison.numeric_comparisons');
  const checkedNumericRows = validateNumericComparisonRows(comparison.numeric_comparisons);
  expectEqual(checkedNumericRows.count, summary.numerical_comparison_count, 'comparison.recomputed_numeric_count');
  expectEqual(checkedNumericRows.pass_count, summary.numerical_pass_count, 'comparison.recomputed_numeric_pass_count');
  expectEqual(checkedNumericRows.fail_count, summary.numerical_fail_count, 'comparison.recomputed_numeric_fail_count');
  const failures = comparison.numeric_comparisons.filter(item => item.status === 'FAIL');
  expectEqual(comparison.numeric_comparisons.length, 16047, 'comparison.numeric_comparisons.length');
  expectEqual(failures.length, FAILURE_ROWS.length, 'comparison.numeric_comparisons.failures.length');
  for (const expected of FAILURE_ROWS) {
    const actual = failures.find(item => item.name === expected.name);
    requireValue(actual, `comparison.numeric_comparisons.${expected.name}`, 'frozen numeric failure missing');
    expectEqual(actual.status, 'FAIL', `${expected.name}.status`);
    expectEqual(actual.tolerance, expected.tolerance, `${expected.name}.tolerance`);
    expectEqual(actual.actual, expected.actual, `${expected.name}.actual`);
    expectEqual(actual.reference, expected.reference, `${expected.name}.reference`);
    expectEqual(actual.absolute_difference, expected.absolute_difference, `${expected.name}.absolute_difference`);
  }
  const failedNames = comparison.failures;
  expectEqual(failedNames.length, 4, 'comparison.failures.length');
  const expectedFailureMessages = [
    'fix_15_quasi_separation:warning/diagnostic distinction is absent',
    ...FAILURE_ROWS.map(item => `${item.name}:difference=${item.absolute_difference}:tolerance=${item.tolerance}`)
  ];
  expectEqual([...failedNames].sort(), [...expectedFailureMessages].sort(), 'comparison.failures.exact_original_matrix');

  const fixtureWarnings = referenceWarning(candidateMap.get('fix_15_quasi_separation'));
  expectEqual(fixtureWarnings.length, 0, 'candidate.fix_15.warning_ledger');
  const f15Row = comparisonMap.get('fix_15_quasi_separation');
  expectEqual(f15Row.status, 'FAIL', 'comparison.fix_15.status');
  requireValue(f15Row.warning_diagnostic_distinction?.application_warning_messages?.length === 0, 'comparison.fix_15.warning_diagnostic_distinction', 'historical no-warning observation changed');
  expectEqual(f15Row.warning_diagnostic_distinction?.application_publication_verdict, 'OUTPUT_READY', 'comparison.fix_15.publication_verdict');
  requireValue(Array.isArray(e2Comparison.fix15_native_webr.native_fit.warnings) && e2Comparison.fix15_native_webr.native_fit.warnings.length === 0, 'e2.fix15.native_warnings', 'unexpected direct native warning');
  requireValue(Array.isArray(e2Comparison.fix15_native_webr.webr_fit.warnings) && e2Comparison.fix15_native_webr.webr_fit.warnings.length === 0, 'e2.fix15.webr_warnings', 'unexpected WebR warning');

  const f16 = workerMap.get('fix_16_complete_separation');
  expectEqual(f16.envelope?.payload?.publicationStatus?.verdict, 'OUTPUT_GENERATION_RESTRICTED', 'production_worker.fix_16.publication_restriction');
  expectEqual(f16.envelope?.payload?.publicationStatus?.outputGenerationAllowed, false, 'production_worker.fix_16.outputGenerationAllowed');
  expectEqual(f16.envelope?.payload?.numericalInstabilitySafeguard?.triggered, true, 'production_worker.fix_16.safeguard');
  expectEqual(comparisonMap.get('fix_16_complete_separation').status, 'FAIL', 'comparison.fix_16.status');

  const warningFixture = workerMap.get('fix_21_extreme_propensities');
  expectEqual(candidateMap.get('fix_21_extreme_propensities').native_execution.warnings, FIX21_NATIVE_WARNING_LEDGER, 'candidate.fix_21.warning_ledger');
  const warningNative = referenceWarning(candidateMap.get('fix_21_extreme_propensities'));
  validateRequiredWarningLedger(warningNative, 'candidate.fix_21.warning_ledger');
  const warningPayload = warningFixture.envelope?.payload;
  const workerHasWarnings = Array.isArray(warningPayload?.warnings) && warningPayload.warnings.length > 0;
  requireValue(workerHasWarnings || warningPayload?.numericalInstabilitySafeguard?.triggered === true,
    'production_worker.fix_21.warning_ledger', 'genuine runtime warning/safeguard missing');
  if (workerHasWarnings) validateRequiredWarningLedger(warningPayload.warnings, 'production_worker.fix_21.warning_ledger.warnings', { allowStructured: true });

  const structuralOutcomes = validateMatchingStructure(candidateMap, workerMap, manifestMap);
  validateE2ScientificEvidence(e2Comparison, e2Observations, nativeDiagnostics);
  return { manifestMap, candidateMap, comparisonMap, workerMap, structuralOutcomes };
}

function referenceWarning(fixture) {
  const warningGroups = fixture?.native_execution?.warnings;
  if (!warningGroups || typeof warningGroups !== 'object') return [];
  return Object.values(warningGroups).flatMap(value => Array.isArray(value) ? value : []);
}

function expectRecord(value, pathName, message = 'expected object') {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), pathName, message);
}

function validateFactorContrast(name, factor, appFactor, pathName) {
  expectRecord(factor, pathName, 'native factor contrast metadata missing or malformed');
  expectKeys(factor, ['declared_levels', 'effective_factor_levels', 'reference_level', 'contrasts', 'contrast_row_levels', 'contrast_matrix', 'contrast_columns'], pathName);
  for (const field of ['declared_levels', 'effective_factor_levels', 'contrast_row_levels', 'contrast_columns']) {
    expectArray(factor[field], `${pathName}.${field}`);
    factor[field].forEach((level, index) => expectType(level, 'string', `${pathName}.${field}[${index}]`));
  }
  expectType(factor.reference_level, 'string', `${pathName}.reference_level`);
  expectArray(factor.contrasts, `${pathName}.contrasts`);
  factor.contrasts.forEach((value, index) => requireValue(typeof value === 'number' && Number.isFinite(value), `${pathName}.contrasts[${index}]`, 'expected finite contrast value'));
  expectEqual(factor.effective_factor_levels, factor.contrast_row_levels, `${pathName}.contrast_row_levels`);
  requireValue(factor.effective_factor_levels.includes(factor.reference_level), `${pathName}.reference_level`, 'reference level is absent from effective levels');
  expectEqual(appFactor.originalHeader, name, `${pathName}.application.originalHeader`);
  expectEqual(appFactor.inferredType, 'categorical', `${pathName}.application.inferredType`);
  expectArray(appFactor.levels, `${pathName}.application.levels`);
  expectEqual(appFactor.levels, factor.declared_levels, `${pathName}.application.levels`);
  expectEqual(appFactor.referenceLevel, factor.reference_level, `${pathName}.application.referenceLevel`);
  const expectedEffectiveLevels = [factor.reference_level, ...appFactor.levels.filter(level => level !== factor.reference_level)];
  expectEqual(factor.effective_factor_levels, expectedEffectiveLevels, `${pathName}.application_releveled_level_order`);

  const expectedColumns = factor.effective_factor_levels.filter(level => level !== factor.reference_level);
  expectEqual(factor.contrast_columns, expectedColumns, `${pathName}.contrast_columns`);
  expectRecord(factor.contrast_matrix, `${pathName}.contrast_matrix`, 'native contrast matrix missing or malformed');
  expectKeys(factor.contrast_matrix, expectedColumns, `${pathName}.contrast_matrix`);
  expectEqual(Object.keys(factor.contrast_matrix), expectedColumns, `${pathName}.contrast_matrix.column_order`);
  for (const column of expectedColumns) {
    const expectedColumn = factor.effective_factor_levels.map(level => level === column ? 1 : 0);
    expectEqual(factor.contrast_matrix[column], expectedColumn, `${pathName}.contrast_matrix.${column}`);
  }
  const expectedColumnMajor = expectedColumns.flatMap(column => factor.effective_factor_levels.map(level => level === column ? 1 : 0));
  expectEqual(factor.contrasts, expectedColumnMajor, `${pathName}.contrasts.column_major_identity`);
}

export function validateFixtureMatchingStructure({ fixtureId, expectedError = false, nativeFixture, workerFixture, expectedErrorJustification = null }) {
  const base = `structure.${fixtureId}`;
  if (expectedError) {
    requireValue(ERROR_POLICY_IDS.has(fixtureId), `${base}.expected_error`, 'NOT_APPLICABLE is only valid for frozen expected error/product-policy fixtures');
    requireValue(typeof expectedErrorJustification === 'string' && expectedErrorJustification.length > 0, `${base}.justification`, 'expected error/product-policy justification is required');
    return { fixture_id: fixtureId, outcome: 'NOT_APPLICABLE_EXPECTED_ERROR', justification: expectedErrorJustification };
  }

  expectRecord(nativeFixture, `${base}.native_fixture`, 'native matching fixture missing');
  const native = nativeFixture.native_execution;
  expectRecord(native, `${base}.native_execution`, 'native execution record missing');
  expectEqual(native.status, 'SUCCESS', `${base}.native_execution.status`);
  expectRecord(native.matchit, `${base}.native.matchit`, 'native MatchIt structure missing');
  const expectedPairs = native.matchit.ordered_matched_pairs;
  expectRecord(expectedPairs, `${base}.native.ordered_matched_pairs`, 'native ordered matched pairs missing');
  requireValue(Object.keys(expectedPairs).length > 0, `${base}.native.ordered_matched_pairs`, 'successful matching fixture has no matched pairs');

  expectRecord(workerFixture, `${base}.worker_fixture`, 'production Worker fixture missing');
  expectEqual(workerFixture.worker_message_type, 'ANALYSIS_COMPLETE', `${base}.worker_message_type`);
  const app = workerFixture.envelope?.payload;
  expectRecord(app, `${base}.application_payload`, 'successful application payload missing');
  const pairs = app.matchMatrix;
  expectRecord(pairs, `${base}.pairs`, 'application matched-pair structure missing');
  expectKeys(pairs, ['treatedIds', 'matchedControlIds', 'pairDistances'], `${base}.pairs`);
  for (const field of ['treatedIds', 'matchedControlIds', 'pairDistances']) expectArray(pairs[field], `${base}.pairs.${field}`);
  pairs.treatedIds.forEach((value, index) => expectType(value, 'string', `${base}.pairs.treatedIds[${index}]`));
  pairs.matchedControlIds.forEach((value, index) => expectType(value, 'string', `${base}.pairs.matchedControlIds[${index}]`));
  expectEqual(pairs.treatedIds.length, pairs.matchedControlIds.length, `${base}.pair_count`);
  expectEqual(pairs.pairDistances.length, pairs.treatedIds.length, `${base}.pair_distances.length`);
  expectEqual(pairs.treatedIds, Object.keys(expectedPairs), `${base}.treated_pair_identity_and_order`);
  expectEqual(pairs.matchedControlIds, pairs.treatedIds.map(treated => expectedPairs[treated]), `${base}.control_pair_identity_and_order`);

  const nativeWeights = native.matchit.weights;
  expectRecord(nativeWeights, `${base}.native.weights`, 'native keyed MatchIt weights missing or malformed');
  const keyed = app.matchingWeights;
  expectRecord(keyed, `${base}.application.weights`, 'application keyed weights missing or malformed');
  requireValue(Object.hasOwn(keyed, 'subclass'), `${base}.application.subclasses`, 'application matching subclasses missing');
  expectKeys(keyed, ['unitIds', 'weights', 'subclass'], `${base}.application.weights`);
  expectArray(keyed.unitIds, `${base}.application.weights.unitIds`);
  expectArray(keyed.weights, `${base}.application.weights.weights`);
  keyed.unitIds.forEach((unitId, index) => expectType(unitId, 'string', `${base}.application.weights.unitIds[${index}]`));
  requireValue(new Set(keyed.unitIds).size === keyed.unitIds.length, `${base}.application.weights.unitIds`, 'duplicate matching unit identity');
  keyed.weights.forEach((weight, index) => requireValue(typeof weight === 'number' && Number.isFinite(weight), `${base}.application.weights.weights[${index}]`, 'expected finite keyed weight'));
  expectEqual(keyed.unitIds.length, keyed.weights.length, `${base}.application.weights.cardinality`);
  expectEqual(keyed.unitIds, Object.keys(nativeWeights), `${base}.weight_unit_identity_and_order`);
  expectEqual(keyed.weights, keyed.unitIds.map(unitId => nativeWeights[unitId]), `${base}.keyed_weights`);

  const nativeSubclasses = native.matchit.subclasses;
  expectRecord(nativeSubclasses, `${base}.native.subclasses`, 'native subclasses missing or malformed');
  expectEqual(Object.keys(nativeSubclasses), Object.keys(nativeWeights), `${base}.native.subclasses.unit_identity_and_order`);
  expectArray(keyed.subclass, `${base}.application.subclasses`);
  expectEqual(keyed.subclass.length, keyed.unitIds.length, `${base}.application.subclasses.cardinality`);
  expectEqual(keyed.subclass, keyed.unitIds.map(unitId => nativeSubclasses[unitId]), `${base}.keyed_subclasses`);

  const nativeAccounting = native.matchit.sample_accounting;
  const appAccounting = app.sampleAccounting;
  expectRecord(nativeAccounting, `${base}.native.sample_accounting`, 'native sample accounting missing or malformed');
  expectRecord(appAccounting, `${base}.application.sample_accounting`, 'application sample accounting missing or malformed');
  const accountingFields = [
    ['imported_total', 'importedTotal'], ['complete_cases', 'completeCases'],
    ['treated_total', 'treatedTotal'], ['control_total', 'controlTotal'],
    ['matched_pair_count', 'matchedTreatedCount'], ['matched_control_count', 'matchedControlCount'],
    ['unmatched_treated_count', 'unmatchedTreatedCount'], ['unmatched_control_count', 'unmatchedControlCount'],
    ['discarded_treated_count', 'discardedTreatedCount'], ['discarded_control_count', 'discardedControlCount']
  ];
  for (const [nativeField, appField] of accountingFields) {
    requireValue(Object.hasOwn(nativeAccounting, nativeField), `${base}.native.sample_accounting.${nativeField}`, 'required native accounting field missing');
    requireValue(Object.hasOwn(appAccounting, appField), `${base}.application.sample_accounting.${appField}`, 'required application accounting field missing');
    requireValue(Number.isInteger(nativeAccounting[nativeField]) && Number.isInteger(appAccounting[appField]), `${base}.sample_accounting.${nativeField}`, 'expected integer sample-accounting value');
    expectEqual(appAccounting[appField], nativeAccounting[nativeField], `${base}.sample_accounting.${nativeField}`);
  }

  const nativeFactorMetadata = native.factor_reference_and_contrasts;
  const appFactorConfiguration = app.factorConfiguration;
  expectRecord(appFactorConfiguration, `${base}.application.factor_configuration`, 'application factor metadata missing or malformed');
  const appFactors = Object.values(appFactorConfiguration);
  const originalHeaders = appFactors.map((factor, index) => {
    expectRecord(factor, `${base}.application.factor_configuration[${index}]`, 'application factor metadata entry malformed');
    expectType(factor.originalHeader, 'string', `${base}.application.factor_configuration[${index}].originalHeader`);
    return factor.originalHeader;
  });
  requireValue(new Set(originalHeaders).size === originalHeaders.length, `${base}.application.factor_configuration`, 'duplicate factor header');
  const appCategoricalHeaders = appFactors.filter(item => item.inferredType === 'categorical').map(item => item.originalHeader);
  const nativeFactors = nativeFactorMetadata === undefined || nativeFactorMetadata === null
    || (Array.isArray(nativeFactorMetadata) && nativeFactorMetadata.length === 0)
    ? {}
    : nativeFactorMetadata;
  if (Object.keys(nativeFactors).length === 0) requireValue(appCategoricalHeaders.length === 0, `${base}.native.factor_reference_and_contrasts`, 'native factor metadata missing for application categorical factors');
  expectRecord(nativeFactors, `${base}.native.factor_reference_and_contrasts`, 'native factor metadata missing or malformed');
  expectEqual(Object.keys(nativeFactors), appCategoricalHeaders, `${base}.categorical_factor_identity_and_order`);
  for (const [name, factor] of Object.entries(nativeFactors)) {
    const appFactor = appFactors.find(item => item.originalHeader === name);
    requireValue(appFactor, `${base}.factor.${name}`, 'application factor metadata missing');
    validateFactorContrast(name, factor, appFactor, `${base}.factor.${name}`);
  }
  return { fixture_id: fixtureId, outcome: 'MATCHING_STRUCTURE_PASS', pair_count: pairs.treatedIds.length, keyed_unit_count: keyed.unitIds.length, factor_count: Object.keys(nativeFactors).length };
}

function validateMatchingStructure(candidateMap, workerMap, manifestMap) {
  return EXPECTED_FIXTURE_IDS.map(id => {
    if (ERROR_POLICY_IDS.has(id)) {
      return validateFixtureMatchingStructure({
        fixtureId: id,
        expectedError: true,
        nativeFixture: candidateMap.get(id),
        workerFixture: workerMap.get(id),
        expectedErrorJustification: EXPECTED_COMPARATOR_CLASSIFICATION.get(id)
      });
    }
    return validateFixtureMatchingStructure({
      fixtureId: id,
      nativeFixture: candidateMap.get(id),
      workerFixture: workerMap.get(id),
      expectedErrorJustification: manifestMap.get(id).expected_status
    });
  });
}

function validateE2ScientificEvidence(report, observations, nativeDiagnostics) {
  expectEqual(report.schema, 'CP-WEBR-02-CLOSURE-1-E2-covariance-comparison-v1', 'e2.covariance.schema');
  expectEqual(report.workflow_gate_status, 'PASS', 'e2.covariance.workflow_gate_status');
  expectEqual(report.fix15_warning_contract_reconciliation.original_manifest, 'SUCCESS_WITH_WARNING / SEPARATION_WARNING', 'e2.fix15.original_manifest');
  expectEqual(report.fix15_warning_contract_reconciliation.historical_02a_assertion_matrix, 'OUTPUT_READY', 'e2.fix15.historical_assertion_matrix');
  expectEqual(report.fix15_separation_assessment.positive_and_negative_controls_status, 'PASS', 'e2.fix15.lp_controls');
  expectEqual(report.fix15_separation_assessment.warning_capture_positive_control.capture_status, 'PASS', 'e2.fix15.warning_capture_positive_control');
  expectEqual(report.fix15_separation_assessment.warning_capture_positive_control.captured_warnings, 'glm.fit: algorithm did not converge', 'e2.fix15.warning_capture_positive_control.warning');
  expectEqual(report.native_environment.package_versions.detectseparation, '0.4.0', 'e2.detectseparation.version');
  const targetLp = report.fix15_separation_assessment.target;
  expectEqual(targetLp.length, 2, 'e2.fix15.lp_tolerances.length');
  expectEqual(targetLp.map(item => item.tolerance), [0.0001, 1e-8], 'e2.fix15.lp_tolerances');
  for (const [index, lp] of targetLp.entries()) {
    expectEqual(lp.overall, 'NO', `e2.fix15.lp[${index}].overall`);
    expectEqual(lp.complete, 'NO', `e2.fix15.lp[${index}].complete`);
    expectEqual(lp.quasi, 'NO', `e2.fix15.lp[${index}].quasi`);
  }
  expectEqual(report.fix15_separation_assessment.positive_control.length, 2, 'e2.fix15.positive_control.length');
  expectEqual(report.fix15_separation_assessment.negative_control.length, 2, 'e2.fix15.negative_control.length');
  for (const [index, lp] of report.fix15_separation_assessment.positive_control.entries()) {
    expectEqual(lp.tolerance, targetLp[index].tolerance, `e2.fix15.positive_control[${index}].tolerance`);
    expectEqual(lp.overall, 'YES', `e2.fix15.positive_control[${index}].overall`);
  }
  for (const [index, lp] of report.fix15_separation_assessment.negative_control.entries()) {
    expectEqual(lp.tolerance, targetLp[index].tolerance, `e2.fix15.negative_control[${index}].tolerance`);
    expectEqual(lp.overall, 'NO', `e2.fix15.negative_control[${index}].overall`);
  }
  const completeLp = report.fix15_separation_assessment.fix16_known_complete_fixture;
  expectEqual(completeLp.length, 2, 'e2.fix16.lp_tolerances.length');
  for (const [index, lp] of completeLp.entries()) {
    expectEqual(lp.tolerance, targetLp[index].tolerance, `e2.fix16.lp[${index}].tolerance`);
    expectEqual(lp.overall, 'YES', `e2.fix16.lp[${index}].overall`);
    expectEqual(lp.complete, 'YES', `e2.fix16.lp[${index}].complete`);
    expectEqual(lp.quasi, 'NO', `e2.fix16.lp[${index}].quasi`);
    requireValue(lp.finite.some(term => term.finite_mle === false), `e2.fix16.lp[${index}].finite_mle`, 'non-finite MLE direction not evidenced');
  }
  expectEqual(report.fix16_native_webr.model_matrix_identity.exact_values_equal, true, 'e2.fix16.model_matrix_identity');
  expectEqual(report.fix16_native_webr.model_matrix_identity.row_ids_equal, true, 'e2.fix16.row_identity');
  expectEqual(report.repeatability.native.status, 'PASS', 'e2.native.repeatability');
  expectEqual(report.repeatability.native.fresh_runtime_replicates, 2, 'e2.native.replicate_count');
  expectEqual(report.repeatability.webr.status, 'PASS', 'e2.webr.repeatability');
  expectEqual(report.repeatability.webr.fresh_runtime_replicates, 2, 'e2.webr.replicate_count');
  for (const fixture of ['fix_15_quasi_separation', 'fix_16_complete_separation']) {
    expectEqual(report.repeatability.native.comparisons.find(item => item.fixture === fixture)?.status, 'PASS', `e2.native.${fixture}.repeatability`);
    expectEqual(report.repeatability.webr.comparisons.find(item => item.fixture === fixture)?.status, 'PASS', `e2.webr.${fixture}.repeatability`);
    expectEqual(report.production_worker_shadow_comparison.find(item => item.fixture === fixture)?.status, 'PASS', `e2.production_worker_anchor.${fixture}`);
  }
  expectEqual(report.fix16_native_webr.native_fit.vcov.length, 2, 'e2.fix16.native_covariance.rows');
  expectEqual(report.fix16_native_webr.webr_fit.vcov.length, 2, 'e2.fix16.webr_covariance.rows');
  expectEqual(report.frozen_tolerance.standard_error_absolute_tolerance, 0.0001, 'e2.fix16.frozen_tolerance');
  expectEqual(report.frozen_tolerance.current_run_reproduced_three_failures, true, 'e2.fix16.original_failures_reproduced');
  expectEqual(report.frozen_tolerance.all_three_reported_failures_remain_failures, true, 'e2.fix16.original_failures_retained');
  expectEqual(observations.classification, 'OBSERVED_PRODUCTION_WORKER_VALUES_NOT_A_GOLDEN_REFERENCE', 'e2.production_worker_anchor.classification');
  expectEqual(observations.source.workflow_run_id, '39954671878', 'e2.production_worker_anchor.run_id');
  expectEqual(observations.source.evidence_file_sha256, '5521d2b73b223dc9939f97f1547439685f6d0b9052d4113ac0049e2aba3dbeb7', 'e2.production_worker_anchor.results_hash');
  expectEqual(observations.fixtures.length, 2, 'e2.production_worker_anchor.fixtures.length');
  for (const fixture of observations.fixtures) expectEqual(fixture.webr_version, '0.6.0', `e2.production_worker_anchor.${fixture.id}.webr_version`);
  expectEqual(report.interpretation.output_restriction_must_remain, 'OUTPUT_GENERATION_RESTRICTED', 'e2.fix16.interpretation.restriction');
  expectEqual(report.native_environment.r_version, 'R version 4.6.0 (2026-04-24)', 'e2.native.r_version');
  expectEqual(report.webr_environment.r_version, 'R version 4.6.0 (2026-04-24)', 'e2.webr.r_version');
  expectArray(nativeDiagnostics, 'e2.native_diagnostic_runs');
  expectEqual(nativeDiagnostics.length, 2, 'e2.native_diagnostic_runs.length');
  for (const [index, diagnostic] of nativeDiagnostics.entries()) {
    expectEqual(diagnostic.schema, 'CP-WEBR-02-CLOSURE-1-E2-native-diagnostic-v1', `e2.native_diagnostic_runs[${index}].schema`);
    expectEqual(diagnostic.evidence_classification, 'RESEARCH_DIAGNOSTIC_NOT_APPROVED_GOLDEN_REFERENCE', `e2.native_diagnostic_runs[${index}].classification`);
    expectEqual(diagnostic.replicate, index + 1, `e2.native_diagnostic_runs[${index}].replicate`);
    expectEqual(diagnostic.template_sha256, '7989403c7d093031b93a9c971a6d4f055101bab83c0ec4417fc52e4dceee24a4', `e2.native_diagnostic_runs[${index}].template_sha256`);
    const diagnosticFixtures = diagnostic.fixtures;
    expectEqual(Object.keys(diagnosticFixtures).sort(), ['fix_15_quasi_separation', 'fix_16_complete_separation'], `e2.native_diagnostic_runs[${index}].fixtures.ids`);
    expectEqual(diagnosticFixtures.fix_15_quasi_separation.fixture, 'fix_15_quasi_separation', `e2.native_diagnostic_runs[${index}].fix15.id`);
    expectEqual(diagnosticFixtures.fix_16_complete_separation.fixture, 'fix_16_complete_separation', `e2.native_diagnostic_runs[${index}].fix16.id`);
    expectEqual(diagnosticFixtures.fix_15_quasi_separation.glm.warnings, [], `e2.native_diagnostic_runs[${index}].fix15.warnings`);
  }
}

function validatePins({ pins, manifestBytes, templateBytes, packageJson, pinBytes, erratumBytes, legacyDir, legacyArchivePath, legacyArchive, e2Dir, e2Archive, root }) {
  expectEqual(pins.schema, 'CP-WEBR-02-CLOSURE-1-E3-EVIDENCE-PINS-v1', 'pins.schema');
  expectEqual(pins.review_status, 'CANDIDATE_ERRATUM_PENDING_INDEPENDENT_APPROVAL', 'pins.review_status');
  expectEqual(sha256(pinBytes), EXPECTED_PIN_FILE_SHA256, 'pins.file_sha256');
  expectEqual(sha256(erratumBytes), pins.erratum_sha256, 'pins.erratum_sha256');
  expectEqual(sha256(manifestBytes), pins.frozen.fixture_manifest_sha256, 'frozen.fixture_manifest_sha256');
  expectEqual(sha256(templateBytes), pins.frozen.template_sha256, 'frozen.template_sha256');
  expectEqual(sha256(readBytes(path.join(root, 'experiments/cp-webr-02a/r1.2a/FIXTURE-ASSERTION-MATRIX.json'))), pins.frozen.assertion_matrix_sha256, 'frozen.assertion_matrix_sha256');
  expectEqual(sha256(readBytes(path.join(root, 'experiments/cp-webr-02-closure/native_oracle.R'))), pins.frozen.native_oracle_source_sha256, 'frozen.native_oracle_source_sha256');
  expectEqual(sha256(readBytes(path.join(root, 'experiments/cp-webr-02a/CP-WEBR-02A-EXPERIMENT-CONTRACT.md'))), pins.frozen.original_02a_contract_sha256, 'frozen.original_02a_contract_sha256');
  expectEqual(sha256(readBytes(path.join(root, 'experiments/cp-webr-02a/CP-WEBR-02A-R1.2a-TEST-CONTRACT.md'))), pins.frozen.original_02a_test_contract_sha256, 'frozen.original_02a_test_contract_sha256');
  expectEqual(sha256(readBytes(path.join(root, 'docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md'))), pins.frozen.original_roadmap_sha256, 'frozen.original_roadmap_sha256');
  expectEqual(packageJson.dependencies?.next, pins.toolchain.next, 'toolchain.next');
  expectEqual(packageJson.devDependencies?.['eslint-config-next'], pins.toolchain.eslint_config_next, 'toolchain.eslint-config-next');
  const packageLock = readJson(path.join(root, 'package-lock.json'));
  expectEqual(packageLock.packages?.['node_modules/next']?.version, pins.toolchain.next, 'toolchain.package-lock.next');
  expectEqual(packageLock.packages?.['node_modules/eslint-config-next']?.version, pins.toolchain.eslint_config_next, 'toolchain.package-lock.eslint-config-next');
  expectEqual(packageLock.packages?.['']?.dependencies?.next, pins.toolchain.next, 'toolchain.package-lock.root.next');
  expectEqual(packageLock.packages?.['']?.devDependencies?.['eslint-config-next'], pins.toolchain.eslint_config_next, 'toolchain.package-lock.root.eslint-config-next');
  expectEqual(sha256(legacyArchive), pins.original_25_fixture_evidence.evidence_archive_sha256, 'legacy.evidence_archive_sha256');
  expectEqual(sha256(e2Archive), pins.e2_scientific_evidence.evidence_archive_sha256, 'e2.evidence_archive_sha256');

  const legacyIndex = readJson(path.join(legacyDir, 'evidence-index.json'));
  expectEqual(legacyIndex.github_actions_run_id, pins.original_25_fixture_evidence.workflow_run_id, 'legacy.evidence_index.run_id');
  expectEqual(legacyIndex.commit_sha, pins.original_25_fixture_evidence.source_commit_sha, 'legacy.evidence_index.source_commit');
  expectEqual(legacyIndex.files_sha256['native-reference-candidate.json'], pins.frozen.candidate_native_reference_sha256, 'legacy.index.reference_sha256');
  const oldIndexBytes = readBytes(path.join(legacyDir, 'evidence-index.json'));
  const oldMetadata = readJson(`${legacyArchivePath}.metadata.json`);
  expectEqual(sha256(oldIndexBytes), oldMetadata.evidence_index_sha256, 'legacy.evidence_index.sha256');
  expectEqual(oldMetadata.archive_sha256, pins.original_25_fixture_evidence.evidence_archive_sha256, 'legacy.archive.metadata.sha256');
  for (const [name, expected] of Object.entries(legacyIndex.files_sha256)) {
    const file = path.join(legacyDir, name);
    requireValue(fs.existsSync(file), `legacy.files.${name}`, 'indexed file missing');
    expectEqual(sha256(readBytes(file)), expected, `legacy.files.${name}.sha256`);
  }
  for (const [name, expected] of Object.entries(pins.original_25_fixture_evidence.evidence_files)) {
    expectEqual(legacyIndex.files_sha256[name], expected, `legacy.files.${name}.pinned_sha256`);
  }
  expectEqual(sha256(readBytes(path.join(legacyDir, 'comparison-report.json'))), pins.frozen.historical_report_sha256, 'frozen.historical_report_sha256');
  expectEqual(sha256(readBytes(path.join(legacyDir, 'production-worker-results.json'))), pins.frozen.production_worker_results_sha256, 'frozen.production_worker_results_sha256');

  const e2IndexPath = path.join(e2Dir, 'evidence-index.json');
  expectEqual(sha256(readBytes(e2IndexPath)), pins.e2_scientific_evidence.evidence_index_sha256, 'e2.evidence_index.sha256');
  const e2Index = readJson(e2IndexPath);
  expectEqual(e2Index.commit_sha, pins.e2_scientific_evidence.commit_sha, 'e2.evidence_index.commit_sha');
  assertSet(e2Index.files.map(item => item.name), Object.keys(pins.e2_scientific_evidence.files), 'e2.evidence_index.files');
  for (const [name, expected] of Object.entries(pins.e2_scientific_evidence.files)) {
    const file = path.join(e2Dir, name);
    requireValue(fs.existsSync(file), `e2.files.${name}`, 'indexed evidence missing');
    const bytes = readBytes(file);
    expectEqual(bytes.length, e2Index.files.find(item => item.name === name)?.bytes, `e2.files.${name}.bytes`);
    expectEqual(sha256(bytes), expected, `e2.files.${name}.sha256`);
  }
  expectEqual(fs.readFileSync(path.join(e2Dir, 'commit-sha.txt'), 'utf8').trim(), pins.e2_scientific_evidence.commit_sha, 'e2.commit_sha');
  expectEqual(fs.readFileSync(path.join(e2Dir, 'main-sha.txt'), 'utf8').trim(), pins.e2_scientific_evidence.main_sha, 'e2.main_sha');
  const webrLock = readJson(path.join(e2Dir, 'webr-dependency-lock.json'));
  expectEqual(webrLock.runtime?.webr_npm, pins.toolchain.webr, 'e2.webr_lock.version');
  expectEqual(webrLock.runtime?.r_version, pins.toolchain.r, 'e2.webr_lock.r_version');
  for (const [packageName, version] of [['MatchIt', pins.toolchain.MatchIt], ['cobalt', pins.toolchain.cobalt]]) {
    expectEqual(webrLock.packages.find(item => item.package === packageName)?.version, version, `e2.webr_lock.${packageName}`);
  }
  const internalArchiveHash = fs.readFileSync(path.join(e2Dir, 'evidence-archive.sha256'), 'utf8').trim().split(/\s+/)[0];
  expectEqual(internalArchiveHash, pins.e2_scientific_evidence.evidence_archive_sha256, 'e2.internal_archive_sha256');
  const fixtureIntegrityPath = path.join(root, 'experiments/cp-webr-02-closure/fixture-integrity.json');
  expectEqual(sha256(readBytes(fixtureIntegrityPath)), pins.original_25_fixture_evidence.evidence_files['fixture-integrity.json'], 'current.fixture_integrity.sha256');
  const fixtureIntegrity = readJson(fixtureIntegrityPath);
  expectEqual(fixtureIntegrity.manifest_sha256, pins.frozen.fixture_manifest_sha256, 'current.fixture_integrity.manifest_sha256');
  expectEqual(fixtureIntegrity.fixtures.length, 25, 'current.fixture_integrity.fixture_count');
  for (const item of fixtureIntegrity.fixtures) {
    const csv = readBytes(path.join(root, 'experiments/cp-webr-02a/fixtures', `${item.id}.csv`));
    const config = readBytes(path.join(root, 'experiments/cp-webr-02a/fixtures', `${item.id}.json`));
    expectEqual(sha256(csv), item.csv_sha256, `current.fixture.${item.id}.csv_sha256`);
    expectEqual(sha256(config), item.config_sha256, `current.fixture.${item.id}.config_sha256`);
  }
  return { legacyIndex, e2Index };
}

function validateObjectFingerprints(inputs, pins) {
  for (const [name, expected] of Object.entries(pins.scientific_canonical_sha256)) {
    requireValue(inputs[name], `scientific.${name}`, 'pinned evidence object missing');
    expectEqual(sha256(canonicalJson(inputs[name])), expected, `scientific.${name}.canonical_sha256`);
  }
}

function classifyFixture(id, historicalStatus, failures) {
  if (id === 'fix_15_quasi_separation') {
    return { outcome: 'HISTORICAL_WARNING_CONTRACT_EXCEPTION', proposed_status: 'OBSERVED_SUCCESS_WITHOUT_SEPARATION_WARNING', erratum_dependent: true, preserved_original_status: historicalStatus, original_failures: failures };
  }
  if (id === 'fix_16_complete_separation') {
    return { outcome: 'NON_IDENTIFIABLE_INFERENCE_RESTRICTED', proposed_status: 'INFERENCE_NON_IDENTIFIABLE_OUTPUT_RESTRICTED', erratum_dependent: true, preserved_original_status: historicalStatus, original_failures: failures, frozen_numeric_failures_retained: failures.length };
  }
  if (ERROR_POLICY_IDS.has(id)) {
    return { outcome: 'EXPECTED_ERROR_OR_POLICY_PARITY_PASS', proposed_status: 'EXPECTED_ERROR_OR_POLICY_PARITY_PASS', erratum_dependent: false, preserved_original_status: historicalStatus, original_failures: failures };
  }
  return { outcome: historicalStatus === 'PASS' ? 'NUMERICAL_AND_STRUCTURAL_PARITY_PASS' : 'FAIL', proposed_status: historicalStatus === 'PASS' ? 'NUMERICAL_AND_STRUCTURAL_PARITY_PASS' : 'FAIL', erratum_dependent: false, preserved_original_status: historicalStatus, original_failures: failures };
}

export function adjudicate(inputs, metadata = {}) {
  validateObjectFingerprints(inputs, inputs.pins);
  const { manifestMap, candidateMap, comparisonMap, structuralOutcomes } = validateSemanticContracts(inputs);
  const structuralById = new Map(structuralOutcomes.map(item => [item.fixture_id, item]));
  const rows = EXPECTED_FIXTURE_IDS.map(id => {
    const row = comparisonMap.get(id);
    const failures = row.failures || [];
    const classified = classifyFixture(id, row.status, failures);
    return {
      fixture_id: id,
      frozen_manifest_status: manifestMap.get(id).expected_status,
      historical_comparator_status: row.status,
      structural_outcome: structuralById.get(id),
      native_classification: candidateMap.get(id).native_classification,
      ...classified
    };
  });
  const categories = new Map(rows.map(row => [row.fixture_id, row.outcome]));
  const count = outcome => rows.filter(row => row.outcome === outcome).length;
  const originalNumericFailures = inputs.comparison.numeric_comparisons.filter(row => row.status === 'FAIL');
  const e2F16 = inputs.e2Comparison.fix16_native_webr;
  const nativeCov = e2F16.native_fit.vcov;
  const webrCov = e2F16.webr_fit.vcov;
  const covarianceAbsoluteDifference = nativeCov.map((row, i) => row.map((value, j) => Math.abs(value - webrCov[i][j])));
  const matrixMax = matrix => Math.max(...matrix.flat());

  return {
    schema: 'CP-WEBR-02-CLOSURE-1-E3-ADJUDICATION-v1',
    qualification_status: 'CANDIDATE_ERRATUM_PENDING_INDEPENDENT_APPROVAL',
    final_verdict: 'CLOSURE_E3_ERRATUM_CANDIDATE_READY_FOR_RED_TEAM',
    commit_sha: metadata.commit_sha || null,
    workflow_run_id: metadata.workflow_run_id || null,
    original_evidence: {
      native_worker_run_id: inputs.pins.original_25_fixture_evidence.workflow_run_id,
      native_worker_artifact_id: inputs.pins.original_25_fixture_evidence.artifact_id,
      native_worker_artifact_sha256: inputs.pins.original_25_fixture_evidence.artifact_digest,
      e2_run_id: inputs.pins.e2_scientific_evidence.workflow_run_id,
      e2_artifact_id: inputs.pins.e2_scientific_evidence.artifact_id,
      e2_artifact_sha256: inputs.pins.e2_scientific_evidence.artifact_digest,
      candidate_reference_sha256: inputs.pins.frozen.candidate_native_reference_sha256,
      historical_comparison_sha256: inputs.pins.frozen.historical_report_sha256,
      erratum_sha256: inputs.pins.erratum_sha256,
      evidence_pins_sha256: EXPECTED_PIN_FILE_SHA256,
      e2_archive_sha256: inputs.pins.e2_scientific_evidence.evidence_archive_sha256,
      legacy_evidence_archive_sha256: inputs.pins.original_25_fixture_evidence.evidence_archive_sha256
    },
    toolchain: inputs.pins.toolchain,
    roadmap: {
      original_stop_condition_remains_binding: true,
      proposed_amendment_requires_independent_approval: true,
      conclusion_if_approved: 'The equivalence contract could serve the stop-condition purpose only with ordinary parity, policy parity, exact restricted non-identifiability exceptions, preserved failures, and separate remaining release/legal gates.'
    },
    fixture_adjudications: rows,
    original_historical_comparison_summary: inputs.comparison.summary,
    summary: {
      counter_scope: 'The 25-fixture E3 evidence set; downstream CP-STAT-02 and CP-RELEASE reviews are listed separately as deferred.',
      total_fixtures_evaluated: rows.length,
      ordinary_scientific_parity_passes: count('NUMERICAL_AND_STRUCTURAL_PARITY_PASS'),
      expected_policy_error_passes: count('EXPECTED_ERROR_OR_POLICY_PARITY_PASS'),
      erratum_dependent_exceptions: rows.filter(row => row.erratum_dependent).length,
      frozen_numerical_failures: originalNumericFailures.length,
      unresolved_differences: 1,
      missing_or_unmeasured_requirements: 0,
      original_historical_fixture_passes: inputs.comparison.summary.passing_fixture_count,
      original_historical_fixture_failures: inputs.comparison.summary.failing_fixture_count,
      aggregate_numerical_parity_pass: false
    },
    original_numerical_failure_matrix: {
      tolerance: 0.0001,
      count: originalNumericFailures.length,
      failures: originalNumericFailures
    },
    fix15: {
      classification: categories.get('fix_15_quasi_separation'),
      historical_manifest_unchanged: 'SUCCESS_WITH_WARNING / SEPARATION_WARNING',
      historical_assertion_matrix_unchanged: 'OUTPUT_READY',
      proposal: 'OBSERVED_SUCCESS_WITHOUT_SEPARATION_WARNING',
      lp: inputs.e2Comparison.fix15_separation_assessment,
      archived_native_warning_ledger: inputs.candidate.fixtures.find(item => item.id === 'fix_15_quasi_separation').native_execution.warnings,
      native_fresh_run_warnings: inputs.nativeDiagnostics.map(diagnostic => ({ replicate: diagnostic.replicate, warnings: diagnostic.fixtures.fix_15_quasi_separation.glm.warnings })),
      webr_shadow_run_warnings: inputs.webr.runs.map(run => ({ replicate: run.replicate, warnings: run.fixtures.find(item => item.id === 'fix_15_quasi_separation').glm.warnings })),
      native_webr_comparison_warnings: {
        native: inputs.e2Comparison.fix15_native_webr.native_fit.warnings,
        webr: inputs.e2Comparison.fix15_native_webr.webr_fit.warnings
      },
      production_worker_anchor: inputs.e2Observations.fixtures.find(item => item.id === 'fix_15_quasi_separation'),
      warning_capture_control: inputs.e2Comparison.fix15_separation_assessment.warning_capture_positive_control
    },
    fix16: {
      classification: categories.get('fix_16_complete_separation'),
      mathematical_classification: 'COMPLETE_SEPARATION_NO_FINITE_MLE',
      lp: inputs.e2Comparison.fix15_separation_assessment.fix16_known_complete_fixture,
      publication_restriction: 'OUTPUT_GENERATION_RESTRICTED',
      inference_fields_non_certifying_if_approved: ['coefficients', 'covariance', 'standard_errors'],
      covariance: {
        native: { vcov: e2F16.native_fit.vcov, covariance_unscaled: e2F16.native_fit.covariance_unscaled, covariance_scaled: e2F16.native_fit.covariance_scaled },
        webr: { vcov: e2F16.webr_fit.vcov, covariance_unscaled: e2F16.webr_fit.covariance_unscaled, covariance_scaled: e2F16.webr_fit.covariance_scaled },
        absolute_cell_difference: covarianceAbsoluteDifference,
        maximum_absolute_cell_difference: matrixMax(covarianceAbsoluteDifference),
        causal_explanation: 'UNRESOLVED'
      },
      native_fit: e2F16.native_fit,
      webr_fit: e2F16.webr_fit,
      qr_comparison: e2F16.qr_comparison,
      conditioning: e2F16.conditioning,
      repeatability: inputs.e2Comparison.repeatability,
      production_worker_anchor: inputs.e2Comparison.production_worker_shadow_comparison.find(item => item.fixture === 'fix_16_complete_separation'),
      frozen_failures: originalNumericFailures
    },
    e2_serialization_schema: inputs.webrSchemaValidation,
    negative_controls: metadata.negative_controls || [],
    negative_control_audit_categories: NEGATIVE_CONTROL_CATEGORIES,
    deferred_requirements: [
      'Independent Red Team approval of this erratum and stop-condition amendment.',
      'CP-WEBR-02 original binding stop condition remains unresolved pending that approval.',
      'CP-STAT-02: estimand, treatment-effect, overlap, matching quality, and causal validation were not performed.',
      'CP-RELEASE: production readiness, privacy/security, browser-channel, deployment, and release approvals remain deferred.',
      'CP-PUB-01: publication and legal/licensing review remain deferred.'
    ]
  };
}

export function validateInputs(inputs) {
  expectEqual(sha256(inputs.pinBytes), EXPECTED_PIN_FILE_SHA256, 'pins.file_sha256');
  expectEqual(sha256(inputs.erratumBytes), inputs.pins.erratum_sha256, 'erratum.sha256');
  const webrSchemaValidation = validateWebrDiagnosticSchema(inputs.webr);
  inputs.webrSchemaValidation = webrSchemaValidation;
  validateSemanticContracts(inputs);
  validateObjectFingerprints(inputs, inputs.pins);
  return true;
}

export function runNegativeControls(baseInputs) {
  const controls = [];
  const check = (name, mutate, pathNeedle) => {
    const target = structuredClone(baseInputs);
    mutate(target);
    let rejected = false;
    let message = '';
    try { validateInputs(target); } catch (error) { rejected = true; message = String(error.message); }
    if (!rejected) fail(`negative_controls.${name}`, 'mutation was accepted');
    if (pathNeedle) requireValue(message.includes(pathNeedle), `negative_controls.${name}`, `rejected at unexpected boundary: ${message}`);
    const category = NEGATIVE_CONTROL_CATEGORIES[name];
    requireValue(category, `negative_controls.${name}.category`, 'negative control lacks a scientific classification');
    const detailDigest = sha256(Buffer.from(message));
    const detectionLayer = /sha256|canonical_sha256/i.test(message) ? 'PINNED_HASH_OR_PROVENANCE' : 'DIRECT_SEMANTIC_OR_STRUCTURAL_ASSERTION';
    const rejection = message.length <= 240 ? message : `${message.slice(0, message.indexOf(':'))}: rejected at ${detectionLayer.toLowerCase().replaceAll('_', ' ')} boundary (full diagnostic sha256 ${detailDigest})`;
    controls.push({
      name,
      category,
      detection_layer: detectionLayer,
      status: 'PASS_REJECTED',
      rejection,
      detail_sha256: detailDigest
    });
  };
  check('fixture_input_hash_changed', x => { x.worker.fixtures.find(item => item.id === 'fix_01_well_conditioned').input_evidence.csv_sha256 = '0'.repeat(64); }, 'production_worker.fix_01_well_conditioned.input_evidence.csv_sha256');
  check('fixture_missing', x => { x.worker.fixtures.pop(); }, 'production_worker.fixtures.length');
  check('fixture_duplicated', x => { x.worker.fixtures[1].id = x.worker.fixtures[0].id; }, 'production_worker.fixtures');
  check('exception_requested_for_unrelated_fixture', x => { x.comparison.fixtures.find(item => item.id === 'fix_01_well_conditioned').proposed_outcome = 'NON_IDENTIFIABLE_INFERENCE_RESTRICTED'; }, 'scientific.comparison.canonical_sha256');
  check('nonseparated_fixture_labelled_separated', x => { x.e2Comparison.fix15_separation_assessment.target[0].overall = 'YES'; }, 'e2.fix15.lp[0].overall');
  check('lp_provenance_removed', x => { x.e2Comparison.fix15_separation_assessment.provenance = null; }, 'scientific.e2Comparison.canonical_sha256');
  check('unsupported_separation_claim', x => { x.e2Comparison.fix15_separation_assessment.fix16_known_complete_fixture[0].complete = 'UNSUPPORTED'; }, 'e2.fix16.lp[0].complete');
  check('fix16_publication_restriction_removed', x => { x.worker.fixtures.find(item => item.id === 'fix_16_complete_separation').envelope.payload.publicationStatus.verdict = 'OUTPUT_READY'; }, 'production_worker.fix_16.publication_restriction');
  check('matched_pair_identity_altered', x => { x.worker.fixtures.find(item => item.id === 'fix_01_well_conditioned').envelope.payload.matchMatrix.matchedControlIds[0] = 'tampered-control'; }, 'structure.fix_01_well_conditioned.control_pair_identity');
  check('keyed_weight_changed', x => { x.worker.fixtures.find(item => item.id === 'fix_01_well_conditioned').envelope.payload.matchingWeights.weights[0] += 1; }, 'structure.fix_01_well_conditioned.keyed_weights');
  check('factor_reference_changed', x => { x.worker.fixtures.find(item => item.id === 'fix_03_ref_level_change').envelope.payload.factorConfiguration.cov_02.referenceLevel = 'low'; }, 'structure.fix_03_ref_level_change.factor.x_cat.application.referenceLevel');
  check('ordinary_coefficient_value_changed', x => { x.candidate.fixtures.find(item => item.id === 'fix_01_well_conditioned').native_execution.glm.coefficients['(Intercept)'].estimate += 1; }, 'scientific.candidate.canonical_sha256');
  check('ordinary_cobalt_value_changed', x => { const row = x.comparison.numeric_comparisons.find(item => item.name.startsWith('fix_01_well_conditioned.cobalt.') && item.semantics === 'numeric'); row.actual += 1; }, 'comparison.numeric_comparisons');
  check('genuine_runtime_warning_removed_from_fix21_native_ledger', x => { x.candidate.fixtures.find(item => item.id === 'fix_21_extreme_propensities').native_execution.warnings.glm.shift(); }, 'candidate.fix_21.warning_ledger');
  check('application_policy_warning_removed_from_fix21', x => { const p = x.worker.fixtures.find(item => item.id === 'fix_21_extreme_propensities').envelope.payload; p.warnings = []; p.numericalInstabilitySafeguard.triggered = false; }, 'production_worker.fix_21.warning_ledger');
  check('three_fix16_tolerance_failures_concealed', x => { x.comparison.numeric_comparisons = x.comparison.numeric_comparisons.filter(item => item.status !== 'FAIL'); }, 'comparison.recomputed_numeric_count');
  check('scientific_evidence_altered_without_reviewed_hash', x => { x.e2Comparison.fix16_native_webr.native_fit.vcov[0][0] += 1; }, 'scientific.e2Comparison.canonical_sha256');
  check('erratum_text_or_evidence_altered_without_reviewed_hash', x => { x.erratumBytes = Buffer.from(String(x.erratumBytes) + '\nmodified'); }, 'erratum.sha256');
  check('old_fail_renamed_pass_without_justification', x => { x.comparison.fixtures.find(item => item.id === 'fix_16_complete_separation').status = 'PASS'; }, 'comparison.fix_16_complete_separation.status');
  expectEqual(controls.length, 19, 'negative_controls.count');
  return controls;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) fail('arguments', `unexpected argument ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail('arguments', `value missing for ${key}`);
    result[key.slice(2)] = value;
    index += 1;
  }
  return result;
}

function markdownReport(report) {
  const rows = report.fixture_adjudications.map(row => `| ${row.fixture_id} | ${row.frozen_manifest_status} | ${row.historical_comparator_status} | ${row.outcome} | ${row.erratum_dependent ? 'yes' : 'no'} |`).join('\n');
  const failures = report.original_numerical_failure_matrix.failures.map(row => `| ${row.name} | ${row.reference} | ${row.actual} | ${row.absolute_difference} | ${row.tolerance} | FAIL |`).join('\n');
  const controls = report.negative_controls.map(item => `| ${item.name} | ${item.status} | ${item.rejection} |`).join('\n');
  const termRows = ['(Intercept)', 'x_sep'].map(term => {
    const native = report.fix16.native_fit;
    const webr = report.fix16.webr_fit;
    return `| ${term} | ${native.coefficients[term]} | ${webr.coefficients[term]} | ${native.se_from_vcov[term]} | ${webr.se_from_vcov[term]} |`;
  }).join('\n');
  const summaryRows = ['(Intercept)', 'x_sep'].map((term, index) => {
    const native = report.fix16.native_fit.summary_coefficients[index];
    const webr = report.fix16.webr_fit.summary_coefficients[index];
    return `| ${term} | ${JSON.stringify(native)} | ${JSON.stringify(webr)} |`;
  }).join('\n');
  const covariance = report.fix16.covariance;
  const formatMatrix = matrix => matrix.map(row => `[${row.join(', ')}]`).join('<br>');
  const fmtRange = range => `[${range.minimum}, ${range.maximum}]`;
  const e2 = report.original_evidence;
  const lpTarget = report.fix15.lp.target.map(item => `| ${item.tolerance} | ${item.overall} | ${item.complete} | ${item.quasi} |`).join('\n');
  const lpFix16 = report.fix16.lp.map(item => `| ${item.tolerance} | ${item.overall} | ${item.complete} | ${item.quasi} |`).join('\n');
  const repeatRows = ['native', 'webr'].map(engine => `| ${engine} | ${report.fix16.repeatability[engine].fresh_runtime_replicates} | ${report.fix16.repeatability[engine].status} | ${report.fix16.repeatability[engine].comparisons.every(item => item.identical_numeric_state && item.identical_model_matrix) ? 'yes' : 'no'} |`).join('\n');
  const anchorRows = report.fix16.production_worker_anchor.terms.map(item => `| ${item.term} | ${item.production_estimate} | ${item.shadow_estimate} | ${item.production_standard_error} | ${item.shadow_standard_error} | ${item.exact_estimate_match && item.exact_standard_error_match ? 'exact' : 'different'} |`).join('\n');
  const fix15WarningLines = report.fix15.archived_native_warning_ledger;
  return `# E3 Candidate Scientific Adjudication\n\nStatus: \`${report.final_verdict}\`  \nQualification status: \`${report.qualification_status}\`\n\nCommit: \`${report.commit_sha}\`  \nWorkflow run: \`${report.workflow_run_id ?? 'LOCAL_OFFLINE_REPLAY'}\`\n\n## Evidence provenance\n\n| Evidence | Run | Artifact | SHA-256 |\n|---|---|---|---|\n| Original 25-fixture production Worker evidence | ${e2.native_worker_run_id} | ${e2.native_worker_artifact_id} | \`${e2.native_worker_artifact_sha256}\` |\n| E2 WebR forensic evidence | ${e2.e2_run_id} | ${e2.e2_artifact_id} | \`${e2.e2_artifact_sha256}\` |\n| Candidate native reference | — | — | \`${e2.candidate_reference_sha256}\` |\n| Historical 25-fixture comparison | — | — | \`${e2.historical_comparison_sha256}\` |\n| Candidate erratum | — | — | \`${e2.erratum_sha256}\` |\n| E2 nested evidence archive | — | — | \`${e2.e2_archive_sha256}\` |\n| Original nested evidence archive | — | — | \`${e2.legacy_evidence_archive_sha256}\` |\n\nPinned toolchain: Next.js ${report.toolchain.next}, eslint-config-next ${report.toolchain.eslint_config_next}, WebR ${report.toolchain.webr}, R ${report.toolchain.r}, MatchIt ${report.toolchain.MatchIt}, cobalt ${report.toolchain.cobalt}.\n\n## Summary\n\n| Counter | Count |\n|---|---:|\n| Total fixtures evaluated | ${report.summary.total_fixtures_evaluated} |\n| Ordinary scientific parity passes | ${report.summary.ordinary_scientific_parity_passes} |\n| Expected policy/error passes | ${report.summary.expected_policy_error_passes} |\n| Erratum-dependent exceptions | ${report.summary.erratum_dependent_exceptions} |\n| Frozen numerical failures retained | ${report.summary.frozen_numerical_failures} |\n| Unresolved differences | ${report.summary.unresolved_differences} |\n| Missing or unmeasured requirements | ${report.summary.missing_or_unmeasured_requirements} |\n| Historical fixture passes / failures | ${report.summary.original_historical_fixture_passes} / ${report.summary.original_historical_fixture_failures} |\n\n**Aggregate numerical parity: ${report.summary.aggregate_numerical_parity_pass ? 'PASS' : 'NOT ESTABLISHED'}.** No aggregate numerical-pass claim is made. The original stop condition remains binding pending independent approval.\n\n## Fixture adjudications\n\n| Fixture | Frozen manifest | Historical comparator | Proposed additive outcome | Erratum-dependent |\n|---|---|---|---|---|\n${rows}\n\n## Original frozen numerical failure matrix\n\n| Field | Native reference | Production Worker | Absolute difference | Tolerance | Status |\n|---|---:|---:|---:|---:|---|\n${failures}\n\nAll three fix_16 standard-error failures remain \`FAIL\`; the additive non-identifiability classification does not convert them to pass.\n\n## fix_15 historical warning-contract proposal\n\nProposed interpretation: \`${report.fix15.proposal}\`. Historical manifest remains \`${report.fix15.historical_manifest_unchanged}\`; archived assertion matrix remains \`${report.fix15.historical_assertion_matrix_unchanged}\`. The exact frozen input/model was classified by independent LP as follows:\n\n| Tolerance | Overall separation | Complete | Quasi-complete |\n|---:|---|---|---|\n${lpTarget}\n\nThe positive and negative LP controls are \`${report.fix15.lp.positive_and_negative_controls_status}\`; fix_16 complete-separation control and tolerance stability are \`${report.fix15.lp.fix16_complete_separation_confirmation}\` / \`${report.fix15.lp.target_tolerance_stability}\`. Runtime warning-capture positive control is \`${report.fix15.warning_capture_control.capture_status}\`, capturing: \`${report.fix15.warning_capture_control.captured_warnings}\`. Archived native warning ledger: \`${JSON.stringify(fix15WarningLines)}\`. Two fresh native R warning ledgers: \`${JSON.stringify(report.fix15.native_fresh_run_warnings)}\`. Two WebR shadow warning ledgers: \`${JSON.stringify(report.fix15.webr_shadow_run_warnings)}\`. Native/WebR diagnostic comparison warning ledgers: \`${JSON.stringify(report.fix15.native_webr_comparison_warnings)}\`. The anchored production Worker emitted ${report.fix15.production_worker_anchor.glm_runtime_warnings.length} GLM runtime warnings and ${report.fix15.production_worker_anchor.application_policy_warning_codes.length} application policy warnings. This is an exact-hash historical assertion correction; it does not suppress warnings for other fixtures or add a production separation detector.\n\n## fix_16 complete separation and restricted inference\n\nClassification proposal: \`${report.fix16.classification}\`; mathematical evidence: \`${report.fix16.mathematical_classification}\`. Independent LP results:\n\n| Tolerance | Overall separation | Complete | Quasi-complete |\n|---:|---|---|---|\n${lpFix16}\n\nThese results establish no finite MLE for this exact original logistic model. Publication remains \`${report.fix16.publication_restriction}\`. Coefficients, covariance and standard errors are non-certifying inferential diagnostics only if this narrowly scoped exception receives independent approval. This does not validate propensity-score matching or causal inference.\n\n### Coefficients and standard errors\n\n| Term | Native coefficient | WebR coefficient | Native SE | WebR SE |\n|---|---:|---:|---:|---:|\n${termRows}\n\n### stats::summary.glm coefficient rows\n\nColumns preserve the archived summary order: estimate, standard error, test statistic, p-value.\n\n| Term | Native | WebR |\n|---|---|---|\n${summaryRows}\n\n### Covariance matrices\n\nNative \`stats::vcov()\` / unscaled / scaled:  \n${formatMatrix(report.fix16.native_fit.vcov)}\n\nWebR \`stats::vcov()\` / unscaled / scaled:  \n${formatMatrix(report.fix16.webr_fit.vcov)}\n\nAbsolute cell differences:  \n${formatMatrix(covariance.absolute_cell_difference)}\n\nMaximum absolute covariance-cell difference: ${covariance.maximum_absolute_cell_difference}. Covariance-level causal explanation: \`${covariance.causal_explanation}\`.\n\n### QR, conditioning, final iterates, and repeatability\n\nBoth ranks are ${report.fix16.qr_comparison.native_rank}; native pivot ${JSON.stringify(report.fix16.qr_comparison.native_pivot)}, WebR pivot ${JSON.stringify(report.fix16.qr_comparison.webr_pivot)}. Native QR R factor: \`${JSON.stringify(report.fix16.qr_comparison.native_r_factor.values)}\`; WebR QR R factor: \`${JSON.stringify(report.fix16.qr_comparison.webr_r_factor.values)}\`. QR covariance matches summary within each runtime: native ${report.fix16.qr_comparison.native_qr_covariance_matches_summary}, WebR ${report.fix16.qr_comparison.webr_qr_covariance_matches_summary}.\n\n| Runtime | Weighted model matrix condition number | Column-scaled condition number | Information eigenvalue ratio | Working weights | Fitted values | Fitted probability range |\n|---|---:|---:|---:|---:|---:|---|\n| Native | ${report.fix16.conditioning.native.weighted_model_matrix.value} | ${report.fix16.conditioning.native.column_scaled_weighted_model_matrix.value} | ${report.fix16.conditioning.native.unscaled_information_matrix_eigenvalue_ratio} | ${report.fix16.native_fit.working_weights.length} | ${report.fix16.native_fit.fitted_values.length} | ${fmtRange(report.fix16.native_fit.fitted_probability_range)} |\n| WebR | ${report.fix16.conditioning.webr.weighted_model_matrix.value} | ${report.fix16.conditioning.webr.column_scaled_weighted_model_matrix.value} | ${report.fix16.conditioning.webr.unscaled_information_matrix_eigenvalue_ratio} | ${report.fix16.webr_fit.working_weights.length} | ${report.fix16.webr_fit.fitted_values.length} | ${fmtRange(report.fix16.webr_fit.fitted_probability_range)} |\n\nBoth runtimes report convergence=${report.fix16.native_fit.converged}/${report.fix16.webr_fit.converged} after ${report.fix16.native_fit.iter}/${report.fix16.webr_fit.iter} iterations. The final 80 working weights and all 80 fitted values per runtime are preserved in the machine-readable report, with their summary range above. Native repeatability: ${report.fix16.repeatability.native.status}; WebR repeatability: ${report.fix16.repeatability.webr.status}.\n\n| Runtime | Fresh runtime replicates | Repeatability status | Numeric state and model matrix identical within each replicate pair |\n|---|---:|---|---|\n${repeatRows}\n\nThe WebR artifact contains two separately labelled runtime result records (replicate 1 and replicate 2), each validated for exact fixture membership and runtime metadata.\n\n### Production Worker anchor\n\n| Term | Worker coefficient | WebR shadow coefficient | Worker SE | WebR shadow SE | Match |\n|---|---:|---:|---:|---:|---|\n${anchorRows}\n\nAnchor status ${report.fix16.production_worker_anchor.status}; publication restriction \`${report.fix16.production_worker_anchor.publication_verdict_preserved_as_anchor}\`; policy warning codes ${JSON.stringify(report.fix16.production_worker_anchor.production_application_policy_warning_codes)}.\n\n## Negative controls\n\n| Control | Result | Rejection boundary |\n|---|---|---|\n${controls}\n\nAll ${report.negative_controls.length} required controls must reject the altered fixture, evidence, schema, or assertion at the stated boundary.\n\n## Proposed roadmap disposition\n\n${report.roadmap.conclusion_if_approved} The original stop condition remains binding: \`${report.roadmap.original_stop_condition_remains_binding}\`; independent approval required: \`${report.roadmap.proposed_amendment_requires_independent_approval}\`.\n\n## Deferred review\n\n${report.deferred_requirements.map(item => `- ${item}`).join('\n')}\n`;
}

function cli() {
  const args = parseArgs(process.argv.slice(2));
  const required = ['legacy-dir', 'legacy-archive', 'e2-dir', 'e2-archive', 'output-dir'];
  for (const key of required) if (!args[key]) fail('arguments', `required --${key}`);
  const root = process.cwd();
  const manifestPath = path.join(root, 'experiments/cp-webr-02a/fixtures/fixtures_manifest.json');
  const templatePath = path.join(root, 'experiments/cp-webr-02a/adapter/r_template.R');
  const packagePath = path.join(root, 'package.json');
  const pinBytes = readBytes(PIN_FILE);
  const pins = JSON.parse(pinBytes.toString('utf8'));
  const erratumBytes = readBytes(ERRATUM_FILE);
  const legacyDir = path.resolve(args['legacy-dir']);
  const e2Dir = path.resolve(args['e2-dir']);
  const legacyArchivePath = path.resolve(args['legacy-archive']);
  const e2ArchivePath = path.resolve(args['e2-archive']);
  const legacyArchive = readBytes(legacyArchivePath);
  const e2Archive = readBytes(e2ArchivePath);
  const manifestBytes = readBytes(manifestPath);
  const templateBytes = readBytes(templatePath);
  const packageJson = readJson(packagePath);
  validatePins({ pins, manifestBytes, templateBytes, packageJson, pinBytes, erratumBytes, legacyDir, legacyArchivePath, legacyArchive, e2Dir, e2Archive, root });

  const inputs = {
    pins,
    pinBytes,
    erratumBytes,
    manifest: JSON.parse(manifestBytes.toString('utf8')),
    candidate: readJson(path.join(legacyDir, 'native-reference-candidate.json')),
    comparison: readJson(path.join(legacyDir, 'comparison-report.json')),
    worker: readJson(path.join(legacyDir, 'production-worker-results.json')),
    e2Comparison: readJson(path.join(e2Dir, 'covariance-comparison.json')),
    e2Observations: readJson(path.join(e2Dir, 'production-worker-observations.json')),
    nativeDiagnostic1: readJson(path.join(e2Dir, 'native-diagnostic-1.json')),
    nativeDiagnostic2: readJson(path.join(e2Dir, 'native-diagnostic-2.json')),
    webr: readJson(path.join(e2Dir, 'webr-shadow-diagnostics.json'))
  };
  inputs.nativeDiagnostics = [inputs.nativeDiagnostic1, inputs.nativeDiagnostic2];
  inputs.webrSchemaValidation = validateWebrDiagnosticSchema(inputs.webr);
  inputs.erratum_sha256 = sha256(erratumBytes);
  validateInputs(inputs);
  const controls = runNegativeControls(inputs);
  const report = adjudicate(inputs, {
    commit_sha: process.env.GITHUB_SHA || process.env.E3_COMMIT_SHA || 'LOCAL_OFFLINE_REPLAY',
    workflow_run_id: process.env.GITHUB_RUN_ID || null,
    negative_controls: controls
  });
  const out = path.resolve(args['output-dir']);
  fs.mkdirSync(out, { recursive: true });
  const jsonPath = path.join(out, 'e3-adjudication-report.json');
  const mdPath = path.join(out, 'e3-adjudication-report.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, markdownReport(report));
  fs.writeFileSync(path.join(out, 'e3-adjudication.sha256'), `${sha256(readBytes(jsonPath))}  e3-adjudication-report.json\n${sha256(readBytes(mdPath))}  e3-adjudication-report.md\n`);
  process.stdout.write(`${JSON.stringify({ status: report.final_verdict, summary: report.summary, output: out }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(); } catch (error) {
    process.stderr.write(`E3 adjudication rejected: ${error.message}\n`);
    process.exitCode = 1;
  }
}
