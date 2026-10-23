import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAtomicVector, validateMatrix, validateSerializedFixture, validateWebrDiagnosticSchema } from './adjudicate.mjs';

const schema = { id: 'schema_fixture', dimensions: [1, 1], columns: ['x'] };

function vector(names, values) {
  return {
    names,
    values,
    decimal17: values.map(value => value === null ? null : String(value))
  };
}

function matrix(rowNames, columnNames, values) {
  return {
    row_names: rowNames,
    column_names: columnNames,
    dimensions: [rowNames.length, columnNames.length],
    values,
    decimal17: values.map(row => row.map(value => value === null ? null : String(value)))
  };
}

function fixture() {
  return {
    id: schema.id,
    input: { row_ids: ['row-1'], row_count: 1, formula: 'treat ~ x', treatment: [1] },
    glm: {
      warnings: [],
      coefficients: vector(['x'], [1.25]),
      summary_coefficients: matrix(['x'], ['Estimate', 'Std. Error', 'z value', 'Pr(>|z|)'], [[1.25, 0.5, 2.5, 0.01]]),
      vcov: matrix(['x'], ['x'], [[0.25]]),
      covariance_unscaled: matrix(['x'], ['x'], [[0.25]]),
      covariance_scaled: matrix(['x'], ['x'], [[0.25]]),
      se_from_vcov: vector(['x'], [0.5]),
      converged: true,
      iter: 1,
      rank: 1,
      deviance: 0.2,
      null_deviance: 0.5,
      linear_predictors: vector(['row-1'], [0.1]),
      fitted_values: vector(['row-1'], [0.52]),
      fitted_probability_range: { minimum: 0.52, maximum: 0.52 },
      working_weights: vector(['row-1'], [0.25]),
      prior_weights: vector(['row-1'], [1]),
      boundary: false,
      aliased: { names: ['x'], values: [false], decimal17: null }
    },
    model_matrix: {
      row_ids: ['row-1'],
      columns: ['x'],
      values: matrix(['row-1'], ['x'], [[1]]),
      response: vector(['row-1'], [1])
    },
    factorization: {
      qr_rank: 1,
      pivot: [1],
      qraux: vector(null, [1]),
      tolerance: 1e-11,
      r_factor: matrix(['sub_0001'], ['x'], [[1]]),
      qr_covariance_reconstruction_from_stored_R: matrix(['x'], ['x'], [[1]]),
      qr_covariance_reconstruction_matches_unscaled: true,
      information_matrix_from_final_working_weights: matrix(['x'], ['x'], [[1]]),
      normal_equation_inverse_diagnostic_only: matrix(['x'], ['x'], [[1]]),
      condition: {
        weighted_model_matrix: { value: 1, singular_values: [1] },
        column_scaled_weighted_model_matrix: { value: 1, singular_values: [1] },
        unscaled_information_matrix_eigenvalue_ratio: 1,
        information_eigenvalues: [1],
        weighted_column_norms: vector(['x'], [1])
      }
    },
    environment: {
      r_version: 'R version 4.6.0',
      r_platform: 'wasm32-unknown-emscripten',
      extSoftVersion: {},
      locale: 'C',
      session_info: 'test fixture',
      timezone: 'UTC'
    }
  };
}

function sizedVector(names, values) {
  return vector(names, values);
}

function sizedMatrix(rowNames, columnNames, value = 0) {
  return matrix(rowNames, columnNames, rowNames.map(() => columnNames.map(() => value)));
}

function schemaFixture(id, dimensions, columns) {
  const [rowCount] = dimensions;
  const rows = Array.from({ length: rowCount }, (_, index) => `row_${String(index + 1).padStart(4, '0')}`);
  const zeroes = columns.map(() => 0);
  const zeroVector = names => sizedVector(names, Array.from({ length: names?.length ?? 0 }, () => 0));
  return {
    id,
    input: { row_ids: rows, row_count: rowCount, formula: `treat ~ ${columns.slice(1).join(' + ')}`, treatment: Array.from({ length: rowCount }, (_, index) => index % 2) },
    glm: {
      warnings: [],
      coefficients: sizedVector(columns, zeroes),
      summary_coefficients: sizedMatrix(columns, ['Estimate', 'Std. Error', 'z value', 'Pr(>|z|)']),
      vcov: sizedMatrix(columns, columns),
      covariance_unscaled: sizedMatrix(columns, columns),
      covariance_scaled: sizedMatrix(columns, columns),
      se_from_vcov: zeroVector(columns),
      converged: true,
      iter: 1,
      rank: columns.length,
      deviance: 1,
      null_deviance: 1,
      linear_predictors: zeroVector(rows),
      fitted_values: sizedVector(rows, Array.from({ length: rowCount }, () => 0.5)),
      fitted_probability_range: { minimum: 0.5, maximum: 0.5 },
      working_weights: sizedVector(rows, Array.from({ length: rowCount }, () => 0.25)),
      prior_weights: sizedVector(rows, Array.from({ length: rowCount }, () => 1)),
      boundary: false,
      aliased: { names: columns, values: columns.map(() => false), decimal17: null }
    },
    model_matrix: {
      row_ids: rows,
      columns,
      values: sizedMatrix(rows, columns),
      response: sizedVector(rows, Array.from({ length: rowCount }, (_, index) => index % 2))
    },
    factorization: {
      qr_rank: columns.length,
      pivot: columns.map((_, index) => index + 1),
      qraux: { names: null, values: columns.map(() => 1), decimal17: columns.map(() => '1') },
      tolerance: 1e-11,
      r_factor: sizedMatrix(columns.map((_, index) => `sub_${String(index + 1).padStart(4, '0')}`), columns),
      qr_covariance_reconstruction_from_stored_R: sizedMatrix(columns, columns),
      qr_covariance_reconstruction_matches_unscaled: true,
      information_matrix_from_final_working_weights: sizedMatrix(columns, columns),
      normal_equation_inverse_diagnostic_only: sizedMatrix(columns, columns),
      condition: {
        weighted_model_matrix: { value: 1, singular_values: columns.map(() => 1) },
        column_scaled_weighted_model_matrix: { value: 1, singular_values: columns.map(() => 1) },
        unscaled_information_matrix_eigenvalue_ratio: 1,
        information_eigenvalues: columns.map(() => 1),
        weighted_column_norms: sizedVector(columns, columns.map(() => 1))
      }
    },
    environment: {
      r_version: 'R version 4.6.0 (2026-04-24)',
      r_platform: 'wasm32-unknown-emscripten',
      extSoftVersion: {},
      locale: 'C',
      session_info: 'test fixture',
      timezone: 'UTC'
    }
  };
}

const webrFixtureSchemas = [
  { id: 'fix_15_quasi_separation', dimensions: [100, 3], columns: ['(Intercept)', 'x_quasi', 'x_norm'] },
  { id: 'fix_16_complete_separation', dimensions: [80, 2], columns: ['(Intercept)', 'x_sep'] }
];

function webrDiagnostics() {
  const sectionFields = {
    glm: ['warnings', 'coefficients', 'summary_coefficients', 'vcov', 'covariance_unscaled', 'covariance_scaled', 'se_from_vcov', 'converged', 'iter', 'rank', 'deviance', 'null_deviance', 'linear_predictors', 'fitted_values', 'fitted_probability_range', 'working_weights', 'prior_weights', 'boundary', 'aliased'],
    model_matrix: ['row_ids', 'columns', 'values', 'response'],
    factorization: ['qr_rank', 'pivot', 'qraux', 'tolerance', 'r_factor', 'qr_covariance_reconstruction_from_stored_R', 'qr_covariance_reconstruction_matches_unscaled', 'information_matrix_from_final_working_weights', 'normal_equation_inverse_diagnostic_only', 'condition']
  };
  const shape = fixtureId => ({
    id: fixtureId,
    root_type: 'list',
    root_fields: ['id', 'input', 'glm', 'model_matrix', 'factorization', 'environment'],
    fixture_id: { type: 'character', names: null, values_length: 1, value: fixtureId },
    sections: Object.fromEntries(Object.entries(sectionFields).map(([name, fields]) => [name, { type: 'list', fields, values_length: fields.length }]))
  });
  const runs = [1, 2].map(replicate => ({
    type: 'RESULT',
    evidence_classification: 'WEBR_DIAGNOSTIC_SHADOW_EXECUTION',
    replicate,
    runtime: {
      webr_version: '0.6.0',
      channel: 'SharedArrayBuffer',
      channel_type_value: 1,
      page_cross_origin_isolated: true,
      worker_cross_origin_isolated: true,
      shared_array_buffer_available: true,
      r_environment: {
        r_version: 'R version 4.6.0 (2026-04-24)',
        r_platform: 'wasm32-unknown-emscripten',
        extSoftVersion: {},
        locale: 'C',
        session_info: 'test fixture'
      }
    },
    serialization_shape: {
      api: 'WebR 0.6.0 RObject.toJs({ depth: 0 })',
      fixture_records: webrFixtureSchemas.map(item => shape(item.id))
    },
    fixtures: webrFixtureSchemas.map(item => schemaFixture(item.id, item.dimensions, item.columns)),
    chromium_user_agent: 'test runner',
    page_cross_origin_isolated: true
  }));
  return {
    schema: 'CP-WEBR-02-CLOSURE-1-E2-webr-shadow-diagnostic-v2',
    evidence_classification: 'RUNTIME_EXECUTION_PASS',
    commit_sha: 'f'.repeat(40),
    webr_distribution_version: '0.6.0',
    locked_r_version: '4.6.0',
    locked_emscripten_version: '3.1.70',
    webr_distribution_lock_sha256: 'a'.repeat(64),
    runtime_asset_sha256: Object.fromEntries(['R.js', 'R.wasm', 'libRblas.so', 'libRlapack.so', 'webr.js', 'webr-worker.js'].map(name => [name, 'b'.repeat(64)])),
    production_dedicated_worker_bundle_sha256: 'c'.repeat(64),
    diagnostic_worker_source_sha256: 'd'.repeat(64),
    runner_source_sha256: 'e'.repeat(64),
    template_sha256: '7989403c7d093031b93a9c971a6d4f055101bab83c0ec4417fc52e4dceee24a4',
    fixture_inputs: [
      { id: 'fix_15_quasi_separation', formula: 'treat ~ x_quasi + x_norm', csv_sha256: 'd81473a891c29084fe15578925df0416106a4b0badd4f1d35a65f3bc12d46a59', config_sha256: '95f621feba15025d657e7e78b6be3d637d800acde633f94a40eb1fe1e5b83423' },
      { id: 'fix_16_complete_separation', formula: 'treat ~ x_sep', csv_sha256: '790e28259d5b7e5967d399848e79a59a61001a38cabbdacacf6e2560808ec26b', config_sha256: 'dc1b024f27a22ba88393bd8b4004821cac224ea18f6fc95bfa5d97ed36259c62' }
    ],
    runs,
    network_observations: { scope: 'test', requests: [], unmeasured: [] },
    browser_console_errors: []
  };
}

test('one-element numeric vectors keep array cardinality', () => {
  const value = vector(['only-term'], [7]);
  validateAtomicVector(value, 'test.vector', { named: true });
  assert.equal(Array.isArray(value.values), true);
  assert.equal(value.values.length, 1);
  assert.deepEqual(value.names, ['only-term']);
});

test('multi-element vectors retain order and names', () => {
  const value = vector(['first', 'second', 'third'], [4, 1, 9]);
  validateAtomicVector(value, 'test.vector', { named: true });
  assert.deepEqual(value.values, [4, 1, 9]);
  assert.deepEqual(value.names, ['first', 'second', 'third']);
});

test('matrix dimensions, row order and column order are preserved', () => {
  const value = matrix(['r1', 'r2'], ['c1', 'c2'], [[1, 2], [3, 4]]);
  validateMatrix(value, 'test.matrix');
  assert.deepEqual(value.dimensions, [2, 2]);
  assert.deepEqual(value.row_names, ['r1', 'r2']);
  assert.deepEqual(value.column_names, ['c1', 'c2']);
  assert.deepEqual(value.values, [[1, 2], [3, 4]]);
});

test('missing coefficient values remain typed nulls, not zeroes', () => {
  const value = vector(['aliased'], [null]);
  validateAtomicVector(value, 'test.vector', { named: true });
  assert.equal(value.values[0], null);
  assert.notEqual(value.values[0], 0);
});

test('serialized fixture rejects a singleton-array ID instead of coercing it', () => {
  const value = fixture();
  value.id = [schema.id];
  assert.throws(() => validateSerializedFixture(value, schema, 'test.fixture'), /test\.fixture\.id: expected string/);
});

test('malformed nested RList/RObject output fails closed', () => {
  const value = fixture();
  value.glm = ['unnamed list'];
  assert.throws(() => validateSerializedFixture(value, schema, 'test.fixture'), /test\.fixture\.glm: expected object/);
});

test('unexpected nested object fields fail closed', () => {
  const value = fixture();
  value.factorization.unexpected = 'coerced object';
  assert.throws(() => validateSerializedFixture(value, schema, 'test.fixture'), /factorization\.keys/);
});

test('matrix dimension mismatch fails closed without flattening values', () => {
  const value = fixture();
  value.glm.vcov.dimensions = [1, 2];
  assert.throws(() => validateSerializedFixture(value, schema, 'test.fixture'), /glm\.vcov\.(dimensions|column_names\.length)/);
});

test('each of two distinct replicate records has exactly the two required fixture records', () => {
  const result = validateWebrDiagnosticSchema(webrDiagnostics());
  assert.equal(result.replicate_count, 2);
  assert.equal(result.fixture_count_per_replicate, 2);
  assert.equal(result.replicate_records_are_distinct, true);
  assert.deepEqual(result.fixture_ids, webrFixtureSchemas.map(item => item.id));
});

test('missing WebR fixture is rejected by exact cardinality', () => {
  const value = webrDiagnostics();
  value.runs[1].fixtures.pop();
  assert.throws(() => validateWebrDiagnosticSchema(value), /e2\.webr\.runs\[1\]\.fixtures\.length: expected 2, received 1/);
});

test('duplicate WebR fixture ID is rejected before lookup', () => {
  const value = webrDiagnostics();
  value.runs[0].fixtures[1].id = value.runs[0].fixtures[0].id;
  assert.throws(() => validateWebrDiagnosticSchema(value), /duplicate fixture ID/);
});

test('altered WebR fixture ID fails deterministically against the pinned identity', () => {
  const value = webrDiagnostics();
  value.runs[0].fixtures[0].id = 'fix_15_altered';
  assert.throws(() => validateWebrDiagnosticSchema(value), /e2\.webr\.runs\[0\]\.fixtures\.ids: expected/);
});

test('replicate labels cannot alias one execution record', () => {
  const value = webrDiagnostics();
  value.runs[1].replicate = 1;
  assert.throws(() => validateWebrDiagnosticSchema(value), /e2\.webr\.runs\[1\]\.replicate: expected 2, received 1/);
});

test('required WebR scientific sections cannot be omitted', () => {
  const value = webrDiagnostics();
  delete value.runs[0].fixtures[0].factorization;
  assert.throws(() => validateWebrDiagnosticSchema(value), /e2\.webr\.runs\[0\]\.fix_15_quasi_separation\.keys: expected/);
});
