import assert from 'node:assert/strict';
import {
  FIXTURE_IDS,
  selectWebRReplicate,
  serializeRFixture,
  serializeRRuntimeEnvironment,
  validateWebRArtifact,
  validateWebRResult
} from './webr_result_schema.mjs';

const atomic = (type, values, names = null) => ({ type, names, values });
const list = (fields, names = Object.keys(fields)) => ({
  type: 'list',
  names,
  values: names === null ? fields : names.map(name => fields[name])
});
const nullObject = () => ({ type: 'null' });
const chars = values => atomic('character', values);
const ints = values => atomic('integer', values);
const doubles = values => atomic('double', values);
const booleans = values => atomic('logical', values);

function valuesRecord(values, names = null, type = 'double') {
  const decimal = type === 'double' || type === 'integer'
    ? atomic('character', values.map(value => value === null ? null : String(value)))
    : nullObject();
  return list({
    names: names === null ? nullObject() : chars(names),
    values: atomic(type, values),
    decimal17: decimal
  });
}

function matrixRecord(rowNames, columnNames, rows) {
  return list({
    row_names: chars(rowNames),
    column_names: chars(columnNames),
    dimensions: ints([rows.length, columnNames.length]),
    values: list(rows.map(row => doubles(row)), null),
    decimal17: list(rows.map(row => chars(row.map(String))), null)
  });
}

function environmentRecord(runtimeOnly = false) {
  const result = {
    r_version: atomic('character', ['R version test']),
    r_platform: atomic('character', ['test-platform']),
    extSoftVersion: list({ BLAS: atomic('character', ['test-blas']), LAPACK: atomic('character', ['test-lapack']) }),
    locale: atomic('character', ['C']),
    session_info: atomic('character', ['session info'])
  };
  if (!runtimeOnly) result.timezone = atomic('character', ['UTC']);
  return list(result);
}

function makeRawFixture(id) {
  const rowIds = ['row-1', 'row-2'];
  const columns = ['(Intercept)', 'x'];
  const coeffNames = columns;
  const smallMatrix = matrixRecord(columns, columns, [[1, 2], [3, 4]]);
  return list({
    id: atomic('character', [id]),
    input: list({
      row_ids: chars(rowIds),
      row_count: ints([2]),
      formula: atomic('character', ['treat ~ x']),
      treatment: doubles([0, 1])
    }),
    glm: list({
      warnings: chars([]),
      coefficients: valuesRecord([null, 7], coeffNames),
      summary_coefficients: matrixRecord(columns, ['Estimate', 'Std. Error', 'z value', 'Pr(>|z|)'], [[null, 2, null, null], [7, 3, 2, 0.1]]),
      vcov: smallMatrix,
      covariance_unscaled: smallMatrix,
      covariance_scaled: smallMatrix,
      se_from_vcov: valuesRecord([null, 3], coeffNames),
      converged: booleans([true]),
      iter: ints([4]),
      rank: ints([2]),
      deviance: doubles([1.25]),
      null_deviance: doubles([2.5]),
      linear_predictors: valuesRecord([-1, 1], rowIds),
      fitted_values: valuesRecord([0.25, 0.75], rowIds),
      fitted_probability_range: list({ minimum: doubles([0.25]), maximum: doubles([0.75]) }),
      working_weights: valuesRecord([0.2, 0.3], rowIds),
      prior_weights: valuesRecord([1, 1], rowIds),
      boundary: booleans([false]),
      aliased: valuesRecord([false, true], coeffNames, 'logical')
    }),
    model_matrix: list({
      row_ids: chars(rowIds),
      columns: chars(columns),
      values: matrixRecord(rowIds, columns, [[1, 2], [3, 4]]),
      response: valuesRecord([0, 1], rowIds)
    }),
    factorization: list({
      qr_rank: ints([2]),
      pivot: ints([2, 1]),
      qraux: valuesRecord([5], ['qraux']),
      tolerance: doubles([1e-11]),
      r_factor: smallMatrix,
      qr_covariance_reconstruction_from_stored_R: smallMatrix,
      qr_covariance_reconstruction_matches_unscaled: booleans([true]),
      information_matrix_from_final_working_weights: smallMatrix,
      normal_equation_inverse_diagnostic_only: nullObject(),
      condition: list({
        weighted_model_matrix: list({ value: doubles([Infinity]), singular_values: doubles([3, 1]) }),
        column_scaled_weighted_model_matrix: list({ value: doubles([3]), singular_values: doubles([1.5, 0.5]) }),
        unscaled_information_matrix_eigenvalue_ratio: doubles([null]),
        information_eigenvalues: doubles([4, 1]),
        weighted_column_norms: valuesRecord([2, 4], columns)
      })
    }),
    environment: environmentRecord()
  });
}

function makeRuntimeEnvironment() {
  return environmentRecord(true);
}

function makeResult(replicate) {
  const fixtures = FIXTURE_IDS.map(id => serializeRFixture(makeRawFixture(id), id));
  return {
    type: 'RESULT',
    evidence_classification: 'WEBR_DIAGNOSTIC_SHADOW_EXECUTION',
    replicate,
    runtime: {
      webr_version: '0.6.0',
      channel: 'PostMessage',
      channel_type_value: 0,
      page_cross_origin_isolated: false,
      worker_cross_origin_isolated: false,
      shared_array_buffer_available: false,
      r_environment: serializeRRuntimeEnvironment(makeRuntimeEnvironment())
    },
    serialization_shape: {
      api: 'WebR 0.6.0 RObject.toJs({ depth: 0 })',
      fixture_records: FIXTURE_IDS.map(id => ({
        id,
        root_type: 'list',
        root_fields: ['id', 'input', 'glm', 'model_matrix', 'factorization', 'environment'],
        fixture_id: { type: 'character', names: null, values_length: 1, value: id },
        sections: {
          glm: { type: 'list', fields: Object.keys(fixtures.find(item => item.id === id).glm), values_length: 19 },
          model_matrix: { type: 'list', fields: ['row_ids', 'columns', 'values', 'response'], values_length: 4 },
          factorization: { type: 'list', fields: Object.keys(fixtures.find(item => item.id === id).factorization), values_length: 10 }
        }
      }))
    },
    fixtures
  };
}

const first = makeResult(1);
const second = makeResult(2);
validateWebRResult(first);
validateWebRResult(second);

const fixture = first.fixtures[0];
assert.equal(fixture.id, 'fix_15_quasi_separation');
assert.equal(typeof fixture.id, 'string');
assert.deepEqual(fixture.glm.coefficients.names, ['(Intercept)', 'x']);
assert.deepEqual(fixture.glm.coefficients.values, [null, 7]);
assert.equal(fixture.glm.coefficients.values[0], null, 'an NA coefficient remains null, never zero');
assert.deepEqual(fixture.factorization.qraux.values, [5], 'a one-element numeric vector remains an array');
assert.deepEqual(fixture.factorization.pivot, [2, 1], 'multi-element vector order is retained');
assert.deepEqual(fixture.model_matrix.values.dimensions, [2, 2]);
assert.deepEqual(fixture.model_matrix.values.values, [[1, 2], [3, 4]], 'matrix row and column order is retained');
assert.equal(fixture.factorization.condition.weighted_model_matrix.value, 'Infinity', 'non-finite numeric values remain distinguishable from NA/null');
assert.equal(fixture.factorization.condition.unscaled_information_matrix_eigenvalue_ratio, null, 'typed NA/null remains null');

assert.throws(
  () => serializeRFixture(makeRawFixture('altered_fixture_id'), FIXTURE_IDS[0]),
  /fixture\.id: expected "fix_15_quasi_separation", received "altered_fixture_id"/
);
const malformed = makeRawFixture(FIXTURE_IDS[0]);
const malformedRoot = { ...malformed, values: [...malformed.values] };
const glmIndex = malformedRoot.names.indexOf('glm');
const malformedGlm = { ...malformedRoot.values[glmIndex], values: [...malformedRoot.values[glmIndex].values] };
const coefficientsIndex = malformedGlm.names.indexOf('coefficients');
malformedGlm.values[coefficientsIndex] = { type: 'list', names: ['names'], values: [] };
malformedRoot.values[glmIndex] = malformedGlm;
assert.throws(() => serializeRFixture(malformedRoot, FIXTURE_IDS[0]), /names must be null or a same-length string array/);

const artifact = { schema: 'CP-WEBR-02-CLOSURE-1-E2-webr-shadow-diagnostic-v2', runs: [first, second] };
validateWebRArtifact(artifact);
assert.notEqual(selectWebRReplicate(artifact, 1), selectWebRReplicate(artifact, 2), 'replicate 1 and 2 must be distinct run records');
assert.equal(selectWebRReplicate(artifact, 1).replicate, 1);
assert.equal(selectWebRReplicate(artifact, 2).replicate, 2);
assert.throws(() => validateWebRArtifact({ ...artifact, runs: [{ ...first, fixtures: [first.fixtures[0], first.fixtures[0]] }, second] }), /duplicate fixture ID/);
assert.throws(() => validateWebRArtifact({ ...artifact, runs: [{ ...first, fixtures: [first.fixtures[0]] }, second] }), /exactly two fixture records/);
assert.throws(() => validateWebRArtifact({ ...artifact, runs: [first, { ...second, replicate: 1 }] }), /replicate 1 and replicate 2 must be distinct executions/);

console.log('WebR result schema falsification tests passed.');
