// Schema boundary for the pinned WebR 0.6.0 `toJs({ depth: 0 })` result.
// R vectors stay vectors; scalar meaning is supplied only by these field schemas.

export const WEBR_DIAGNOSTIC_V2 = 'CP-WEBR-02-CLOSURE-1-E2-webr-shadow-diagnostic-v2';
export const WEBR_DIAGNOSTIC_V1 = 'CP-WEBR-02-CLOSURE-1-E2-webr-shadow-diagnostic-v1';
export const FIXTURE_IDS = Object.freeze(['fix_15_quasi_separation', 'fix_16_complete_separation']);

const ATOMIC_TYPES = new Set(['character', 'logical', 'integer', 'double']);
const FIXTURE_FIELDS = ['id', 'input', 'glm', 'model_matrix', 'factorization', 'environment'];
const INPUT_FIELDS = ['row_ids', 'row_count', 'formula', 'treatment'];
const GLM_FIELDS = [
  'warnings', 'coefficients', 'summary_coefficients', 'vcov', 'covariance_unscaled',
  'covariance_scaled', 'se_from_vcov', 'converged', 'iter', 'rank', 'deviance',
  'null_deviance', 'linear_predictors', 'fitted_values', 'fitted_probability_range',
  'working_weights', 'prior_weights', 'boundary', 'aliased'
];
const MODEL_MATRIX_FIELDS = ['row_ids', 'columns', 'values', 'response'];
const FACTORIZATION_FIELDS = [
  'qr_rank', 'pivot', 'qraux', 'tolerance', 'r_factor',
  'qr_covariance_reconstruction_from_stored_R',
  'qr_covariance_reconstruction_matches_unscaled',
  'information_matrix_from_final_working_weights',
  'normal_equation_inverse_diagnostic_only', 'condition'
];
const CONDITION_FIELDS = [
  'weighted_model_matrix', 'column_scaled_weighted_model_matrix',
  'unscaled_information_matrix_eigenvalue_ratio', 'information_eigenvalues',
  'weighted_column_norms'
];
const ENVIRONMENT_FIELDS = ['r_version', 'r_platform', 'locale', 'timezone', 'extSoftVersion', 'session_info'];
const RUNTIME_ENVIRONMENT_FIELDS = ['r_version', 'r_platform', 'extSoftVersion', 'locale', 'session_info'];

function fail(path, reason) {
  throw new Error(`WebR schema violation at ${path}: ${reason}`);
}
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkKeys(value, expected, path) {
  if (!isObject(value)) fail(path, 'expected an object');
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(path, `expected keys [${wanted.join(', ')}], received [${actual.join(', ')}]`);
  }
}

function checkNames(names, length, path) {
  if (names === null) return;
  if (!Array.isArray(names) || names.length !== length || names.some(name => typeof name !== 'string')) {
    fail(path, 'names must be null or a same-length string array');
  }
}

function finiteJsonNumber(value, path) {
  if (value === null) return null;
  if (typeof value !== 'number') fail(path, 'expected a numeric value or typed null');
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  return value;
}

function readRNode(node, path) {
  if (!isObject(node) || typeof node.type !== 'string') fail(path, 'expected a WebR toJs object with a type tag');
  if (node.type === 'null') {
    checkKeys(node, ['type'], path);
    return { kind: 'null' };
  }
  if (node.type === 'list' || node.type === 'pairlist') {
    checkKeys(node, ['type', 'names', 'values'], path);
    if (!Array.isArray(node.values)) fail(`${path}.values`, 'expected an array');
    checkNames(node.names, node.values.length, `${path}.names`);
    return {
      kind: 'list',
      names: node.names,
      values: node.values.map((value, index) => readRNode(value, `${path}.values[${index}]`))
    };
  }
  if (!ATOMIC_TYPES.has(node.type)) fail(`${path}.type`, `unsupported WebR RObject type ${JSON.stringify(node.type)}`);
  checkKeys(node, ['type', 'names', 'values'], path);
  if (!Array.isArray(node.values)) fail(`${path}.values`, 'expected an array');
  checkNames(node.names, node.values.length, `${path}.names`);
  const values = node.values.map((value, index) => {
    const valuePath = `${path}.values[${index}]`;
    if (value === null) return null;
    if (node.type === 'character') {
      if (typeof value !== 'string') fail(valuePath, 'expected a character value or NA/null');
      return value;
    }
    if (node.type === 'logical') {
      if (typeof value !== 'boolean') fail(valuePath, 'expected a logical value or NA/null');
      return value;
    }
    return finiteJsonNumber(value, valuePath);
  });
  return { kind: 'atomic', type: node.type, names: node.names, values };
}

function listMap(node, expectedFields, path) {
  if (node?.kind !== 'list' || node.names === null) fail(path, 'expected a named R list');
  if (node.names.some(name => name.length === 0) || new Set(node.names).size !== node.names.length) {
    fail(`${path}.names`, 'named R list fields must be non-empty and unique');
  }
  if (expectedFields) {
    const actual = [...node.names].sort();
    const expected = [...expectedFields].sort();
    if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
      fail(path, `unexpected R list fields; expected [${expected.join(', ')}], received [${actual.join(', ')}]`);
    }
  }
  return Object.fromEntries(node.names.map((name, index) => [name, node.values[index]]));
}

function atomic(node, allowedTypes, path, { allowNames = false, allowNullObject = false } = {}) {
  if (node?.kind === 'null' && allowNullObject) return null;
  if (node?.kind !== 'atomic' || !allowedTypes.includes(node.type)) {
    fail(path, `expected atomic R vector type ${allowedTypes.join(' or ')}`);
  }
  if (!allowNames && node.names !== null) fail(path, 'unexpected R vector names; the schema requires an unnamed vector');
  return node;
}

function vector(node, allowedTypes, path, options = {}) {
  return atomic(node, allowedTypes, path, options)?.values ?? null;
}

function scalar(node, allowedTypes, path, { allowNullObject = false, allowNullValue = false } = {}) {
  if (node?.kind === 'null' && allowNullObject) return null;
  const value = atomic(node, allowedTypes, path);
  if (value.values.length !== 1) fail(path, `expected a scalar with cardinality 1; received ${value.values.length}`);
  if (value.values[0] === null && !allowNullValue) fail(path, 'unexpected NA/null scalar');
  return value.values[0];
}

function nullableCharacterVector(node, path) {
  if (node?.kind === 'null') return null;
  return vector(node, ['character'], path);
}

function decodeValuesRecord(node, path, allowedTypes = ['double', 'integer']) {
  const fields = listMap(node, ['names', 'values', 'decimal17'], path);
  const names = nullableCharacterVector(fields.names, `${path}.names`);
  const valuesNode = atomic(fields.values, allowedTypes, `${path}.values`);
  const values = valuesNode.values;
  if (names !== null && names.length !== values.length) fail(`${path}.names`, 'named vector names and values have different cardinality');
  const decimalNode = fields.decimal17;
  const decimal17 = decimalNode?.kind === 'null' ? null : vector(decimalNode, ['character'], `${path}.decimal17`);
  if (decimal17 !== null && decimal17.length !== values.length) fail(`${path}.decimal17`, 'decimal text and numeric values have different cardinality');
  return { names, values, decimal17 };
}

function decodeMatrix(node, path) {
  const fields = listMap(node, ['row_names', 'column_names', 'dimensions', 'values', 'decimal17'], path);
  const rowNames = nullableCharacterVector(fields.row_names, `${path}.row_names`);
  const columnNames = nullableCharacterVector(fields.column_names, `${path}.column_names`);
  const dimensions = vector(fields.dimensions, ['integer'], `${path}.dimensions`);
  if (dimensions.length !== 2 || dimensions.some(value => !Number.isInteger(value) || value < 0)) {
    fail(`${path}.dimensions`, 'expected exactly two non-negative integer dimensions');
  }
  const [rowCount, columnCount] = dimensions;
  if (rowNames !== null && rowNames.length !== rowCount) fail(`${path}.row_names`, 'row names do not match matrix dimensions');
  if (columnNames !== null && columnNames.length !== columnCount) fail(`${path}.column_names`, 'column names do not match matrix dimensions');
  const rowList = fields.values;
  if (rowList?.kind !== 'list' || rowList.names !== null || rowList.values.length !== rowCount) {
    fail(`${path}.values`, 'matrix rows must be an unnamed R list matching the row dimension');
  }
  const values = rowList.values.map((row, rowIndex) => {
    const rowValues = vector(row, ['double', 'integer'], `${path}.values[${rowIndex}]`);
    if (rowValues.length !== columnCount) fail(`${path}.values[${rowIndex}]`, 'matrix row cardinality does not match the column dimension');
    return rowValues;
  });
  const decimalList = fields.decimal17;
  let decimal17 = null;
  if (decimalList?.kind !== 'null') {
    if (decimalList?.kind !== 'list' || decimalList.names !== null || decimalList.values.length !== rowCount) {
      fail(`${path}.decimal17`, 'decimal text rows must match the matrix row dimension');
    }
    decimal17 = decimalList.values.map((row, rowIndex) => {
      const rowValues = vector(row, ['character'], `${path}.decimal17[${rowIndex}]`);
      if (rowValues.length !== columnCount) fail(`${path}.decimal17[${rowIndex}]`, 'decimal text row cardinality does not match the column dimension');
      return rowValues;
    });
  }
  return { row_names: rowNames, column_names: columnNames, dimensions, values, decimal17 };
}

function decodeNamedScalarList(node, path, valueType = 'character') {
  if (node?.kind !== 'list' || node.names === null) fail(path, 'expected a named R list');
  if (node.names.some(name => name.length === 0) || new Set(node.names).size !== node.names.length) {
    fail(`${path}.names`, 'named list entries must be non-empty and unique');
  }
  return Object.fromEntries(node.names.map((name, index) => [
    name,
    scalar(node.values[index], [valueType], `${path}.${name}`, { allowNullValue: true })
  ]));
}

function decodeEnvironment(node, path, runtimeOnly = false) {
  const expected = runtimeOnly ? RUNTIME_ENVIRONMENT_FIELDS : ENVIRONMENT_FIELDS;
  const fields = listMap(node, expected, path);
  const out = {
    r_version: scalar(fields.r_version, ['character'], `${path}.r_version`),
    r_platform: scalar(fields.r_platform, ['character'], `${path}.r_platform`),
    extSoftVersion: decodeNamedScalarList(fields.extSoftVersion, `${path}.extSoftVersion`),
    locale: scalar(fields.locale, ['character'], `${path}.locale`, { allowNullValue: true }),
    session_info: scalar(fields.session_info, ['character'], `${path}.session_info`)
  };
  if (!runtimeOnly) out.timezone = scalar(fields.timezone, ['character'], `${path}.timezone`, { allowNullValue: true });
  return out;
}

function decodeCondition(node, path) {
  const fields = listMap(node, CONDITION_FIELDS, path);
  const weighted = listMap(fields.weighted_model_matrix, ['value', 'singular_values'], `${path}.weighted_model_matrix`);
  const scaled = listMap(fields.column_scaled_weighted_model_matrix, ['value', 'singular_values'], `${path}.column_scaled_weighted_model_matrix`);
  return {
    weighted_model_matrix: {
      value: scalar(weighted.value, ['double', 'integer'], `${path}.weighted_model_matrix.value`, { allowNullValue: true }),
      singular_values: vector(weighted.singular_values, ['double', 'integer'], `${path}.weighted_model_matrix.singular_values`)
    },
    column_scaled_weighted_model_matrix: {
      value: scalar(scaled.value, ['double', 'integer'], `${path}.column_scaled_weighted_model_matrix.value`, { allowNullValue: true }),
      singular_values: vector(scaled.singular_values, ['double', 'integer'], `${path}.column_scaled_weighted_model_matrix.singular_values`)
    },
    unscaled_information_matrix_eigenvalue_ratio: scalar(
      fields.unscaled_information_matrix_eigenvalue_ratio, ['double', 'integer'],
      `${path}.unscaled_information_matrix_eigenvalue_ratio`, { allowNullValue: true }
    ),
    information_eigenvalues: vector(fields.information_eigenvalues, ['double', 'integer'], `${path}.information_eigenvalues`),
    weighted_column_norms: decodeValuesRecord(fields.weighted_column_norms, `${path}.weighted_column_norms`)
  };
}

export function serializeRFixture(rawFixture, expectedId) {
  if (!FIXTURE_IDS.includes(expectedId)) fail('fixture.expected_id', `unexpected fixture ID ${JSON.stringify(expectedId)}`);
  const root = readRNode(rawFixture, 'fixture');
  const fields = listMap(root, FIXTURE_FIELDS, 'fixture');
  const id = scalar(fields.id, ['character'], 'fixture.id');
  if (id !== expectedId) fail('fixture.id', `expected ${JSON.stringify(expectedId)}, received ${JSON.stringify(id)}`);

  const input = listMap(fields.input, INPUT_FIELDS, 'fixture.input');
  const inputOut = {
    row_ids: vector(input.row_ids, ['character'], 'fixture.input.row_ids'),
    row_count: scalar(input.row_count, ['integer'], 'fixture.input.row_count'),
    formula: scalar(input.formula, ['character'], 'fixture.input.formula'),
    treatment: vector(input.treatment, ['double', 'integer', 'logical'], 'fixture.input.treatment')
  };

  const glm = listMap(fields.glm, GLM_FIELDS, 'fixture.glm');
  const probabilityRange = listMap(glm.fitted_probability_range, ['minimum', 'maximum'], 'fixture.glm.fitted_probability_range');
  const glmOut = {
    warnings: vector(glm.warnings, ['character'], 'fixture.glm.warnings'),
    coefficients: decodeValuesRecord(glm.coefficients, 'fixture.glm.coefficients'),
    summary_coefficients: decodeMatrix(glm.summary_coefficients, 'fixture.glm.summary_coefficients'),
    vcov: decodeMatrix(glm.vcov, 'fixture.glm.vcov'),
    covariance_unscaled: decodeMatrix(glm.covariance_unscaled, 'fixture.glm.covariance_unscaled'),
    covariance_scaled: decodeMatrix(glm.covariance_scaled, 'fixture.glm.covariance_scaled'),
    se_from_vcov: decodeValuesRecord(glm.se_from_vcov, 'fixture.glm.se_from_vcov'),
    converged: scalar(glm.converged, ['logical'], 'fixture.glm.converged'),
    iter: scalar(glm.iter, ['integer'], 'fixture.glm.iter'),
    rank: scalar(glm.rank, ['integer'], 'fixture.glm.rank'),
    deviance: scalar(glm.deviance, ['double', 'integer'], 'fixture.glm.deviance'),
    null_deviance: scalar(glm.null_deviance, ['double', 'integer'], 'fixture.glm.null_deviance'),
    linear_predictors: decodeValuesRecord(glm.linear_predictors, 'fixture.glm.linear_predictors'),
    fitted_values: decodeValuesRecord(glm.fitted_values, 'fixture.glm.fitted_values'),
    fitted_probability_range: {
      minimum: scalar(probabilityRange.minimum, ['double', 'integer'], 'fixture.glm.fitted_probability_range.minimum'),
      maximum: scalar(probabilityRange.maximum, ['double', 'integer'], 'fixture.glm.fitted_probability_range.maximum')
    },
    working_weights: decodeValuesRecord(glm.working_weights, 'fixture.glm.working_weights'),
    prior_weights: decodeValuesRecord(glm.prior_weights, 'fixture.glm.prior_weights'),
    boundary: scalar(glm.boundary, ['logical'], 'fixture.glm.boundary'),
    aliased: decodeValuesRecord(glm.aliased, 'fixture.glm.aliased', ['logical'])
  };

  const modelMatrix = listMap(fields.model_matrix, MODEL_MATRIX_FIELDS, 'fixture.model_matrix');
  const modelMatrixOut = {
    row_ids: vector(modelMatrix.row_ids, ['character'], 'fixture.model_matrix.row_ids'),
    columns: vector(modelMatrix.columns, ['character'], 'fixture.model_matrix.columns'),
    values: decodeMatrix(modelMatrix.values, 'fixture.model_matrix.values'),
    response: decodeValuesRecord(modelMatrix.response, 'fixture.model_matrix.response')
  };

  const factor = listMap(fields.factorization, FACTORIZATION_FIELDS, 'fixture.factorization');
  const factorOut = {
    qr_rank: scalar(factor.qr_rank, ['integer'], 'fixture.factorization.qr_rank'),
    pivot: vector(factor.pivot, ['integer'], 'fixture.factorization.pivot'),
    qraux: decodeValuesRecord(factor.qraux, 'fixture.factorization.qraux'),
    tolerance: scalar(factor.tolerance, ['double', 'integer'], 'fixture.factorization.tolerance'),
    r_factor: decodeMatrix(factor.r_factor, 'fixture.factorization.r_factor'),
    qr_covariance_reconstruction_from_stored_R: factor.qr_covariance_reconstruction_from_stored_R.kind === 'null'
      ? null : decodeMatrix(factor.qr_covariance_reconstruction_from_stored_R, 'fixture.factorization.qr_covariance_reconstruction_from_stored_R'),
    qr_covariance_reconstruction_matches_unscaled: scalar(
      factor.qr_covariance_reconstruction_matches_unscaled, ['logical'],
      'fixture.factorization.qr_covariance_reconstruction_matches_unscaled', { allowNullObject: true, allowNullValue: true }
    ),
    information_matrix_from_final_working_weights: decodeMatrix(
      factor.information_matrix_from_final_working_weights,
      'fixture.factorization.information_matrix_from_final_working_weights'
    ),
    normal_equation_inverse_diagnostic_only: factor.normal_equation_inverse_diagnostic_only.kind === 'null'
      ? null : decodeMatrix(factor.normal_equation_inverse_diagnostic_only, 'fixture.factorization.normal_equation_inverse_diagnostic_only'),
    condition: decodeCondition(factor.condition, 'fixture.factorization.condition')
  };
  const output = {
    id,
    input: inputOut,
    glm: glmOut,
    model_matrix: modelMatrixOut,
    factorization: factorOut,
    environment: decodeEnvironment(fields.environment, 'fixture.environment')
  };
  validateSerializedFixture(output, expectedId);
  return output;
}

export function serializeRRuntimeEnvironment(rawEnvironment) {
  return decodeEnvironment(readRNode(rawEnvironment, 'runtime.r_environment'), 'runtime.r_environment', true);
}

function isJsonNumeric(value) {
  return value === null || typeof value === 'number' || ['Infinity', '-Infinity', 'NaN'].includes(value);
}

function validateVector(value, path, kind) {
  if (!Array.isArray(value)) fail(path, 'expected a vector array');
  const valid = kind === 'character'
    ? item => item === null || typeof item === 'string'
    : kind === 'logical'
      ? item => item === null || typeof item === 'boolean'
      : isJsonNumeric;
  if (value.some(item => !valid(item))) fail(path, `contains a value outside ${kind} vector semantics`);
}

function validateValuesRecord(value, path, kind = 'numeric') {
  checkKeys(value, ['names', 'values', 'decimal17'], path);
  if (value.names !== null && (!Array.isArray(value.names) || value.names.some(name => typeof name !== 'string'))) {
    fail(`${path}.names`, 'expected null or a string array');
  }
  validateVector(value.values, `${path}.values`, kind);
  if (value.names !== null && value.names.length !== value.values.length) fail(path, 'named vector names and values have different cardinality');
  if (value.decimal17 !== null) {
    validateVector(value.decimal17, `${path}.decimal17`, 'character');
    if (value.decimal17.length !== value.values.length) fail(`${path}.decimal17`, 'decimal text and values have different cardinality');
  }
}

function validateMatrix(value, path) {
  checkKeys(value, ['row_names', 'column_names', 'dimensions', 'values', 'decimal17'], path);
  for (const name of ['row_names', 'column_names']) {
    if (value[name] !== null && (!Array.isArray(value[name]) || value[name].some(item => typeof item !== 'string'))) {
      fail(`${path}.${name}`, 'expected null or a string array');
    }
  }
  if (!Array.isArray(value.dimensions) || value.dimensions.length !== 2 || value.dimensions.some(item => !Number.isInteger(item) || item < 0)) {
    fail(`${path}.dimensions`, 'expected [row_count, column_count]');
  }
  const [rows, columns] = value.dimensions;
  if (value.row_names !== null && value.row_names.length !== rows) fail(path, 'row names do not match dimensions');
  if (value.column_names !== null && value.column_names.length !== columns) fail(path, 'column names do not match dimensions');
  if (!Array.isArray(value.values) || value.values.length !== rows) fail(`${path}.values`, 'matrix row count does not match dimensions');
  value.values.forEach((row, index) => {
    validateVector(row, `${path}.values[${index}]`, 'numeric');
    if (row.length !== columns) fail(`${path}.values[${index}]`, 'matrix column count does not match dimensions');
  });
  if (value.decimal17 !== null) {
    if (!Array.isArray(value.decimal17) || value.decimal17.length !== rows) fail(`${path}.decimal17`, 'decimal text row count does not match dimensions');
    value.decimal17.forEach((row, index) => {
      validateVector(row, `${path}.decimal17[${index}]`, 'character');
      if (row.length !== columns) fail(`${path}.decimal17[${index}]`, 'decimal text column count does not match dimensions');
    });
  }
}

function validateEnvironment(value, path, runtimeOnly = false) {
  const fields = runtimeOnly ? RUNTIME_ENVIRONMENT_FIELDS : ENVIRONMENT_FIELDS;
  checkKeys(value, fields, path);
  for (const name of ['r_version', 'r_platform', 'session_info']) {
    if (typeof value[name] !== 'string') fail(`${path}.${name}`, 'expected a scalar string');
  }
  for (const name of ['locale', ...(runtimeOnly ? [] : ['timezone'])]) {
    if (value[name] !== null && typeof value[name] !== 'string') fail(`${path}.${name}`, 'expected a string or null');
  }
  if (!isObject(value.extSoftVersion) || Object.values(value.extSoftVersion).some(item => item !== null && typeof item !== 'string')) {
    fail(`${path}.extSoftVersion`, 'expected a named map of strings or nulls');
  }
}

export function validateSerializedFixture(fixture, expectedId) {
  checkKeys(fixture, FIXTURE_FIELDS, 'fixture');
  if (fixture.id !== expectedId || typeof fixture.id !== 'string') fail('fixture.id', `expected exact scalar string ${JSON.stringify(expectedId)}`);
  checkKeys(fixture.input, INPUT_FIELDS, 'fixture.input');
  validateVector(fixture.input.row_ids, 'fixture.input.row_ids', 'character');
  if (!Number.isInteger(fixture.input.row_count) || fixture.input.row_count !== fixture.input.row_ids.length) fail('fixture.input.row_count', 'must equal the row ID vector length');
  if (typeof fixture.input.formula !== 'string') fail('fixture.input.formula', 'expected scalar string');
  validateVector(fixture.input.treatment, 'fixture.input.treatment', 'numeric');
  if (fixture.input.treatment.length !== fixture.input.row_count) fail('fixture.input.treatment', 'treatment vector does not match row count');

  checkKeys(fixture.glm, GLM_FIELDS, 'fixture.glm');
  validateVector(fixture.glm.warnings, 'fixture.glm.warnings', 'character');
  for (const field of ['coefficients', 'se_from_vcov', 'linear_predictors', 'fitted_values', 'working_weights', 'prior_weights']) {
    validateValuesRecord(fixture.glm[field], `fixture.glm.${field}`);
  }
  validateValuesRecord(fixture.glm.aliased, 'fixture.glm.aliased', 'logical');
  for (const field of ['summary_coefficients', 'vcov', 'covariance_unscaled', 'covariance_scaled']) {
    validateMatrix(fixture.glm[field], `fixture.glm.${field}`);
  }
  if (typeof fixture.glm.converged !== 'boolean' || typeof fixture.glm.boundary !== 'boolean') fail('fixture.glm', 'converged and boundary must be scalar booleans');
  for (const field of ['iter', 'rank']) if (!Number.isInteger(fixture.glm[field])) fail(`fixture.glm.${field}`, 'expected scalar integer');
  for (const field of ['deviance', 'null_deviance']) if (!isJsonNumeric(fixture.glm[field]) || fixture.glm[field] === null) fail(`fixture.glm.${field}`, 'expected scalar number');
  checkKeys(fixture.glm.fitted_probability_range, ['minimum', 'maximum'], 'fixture.glm.fitted_probability_range');
  for (const field of ['minimum', 'maximum']) if (!isJsonNumeric(fixture.glm.fitted_probability_range[field]) || fixture.glm.fitted_probability_range[field] === null) fail(`fixture.glm.fitted_probability_range.${field}`, 'expected scalar number');

  checkKeys(fixture.model_matrix, MODEL_MATRIX_FIELDS, 'fixture.model_matrix');
  validateVector(fixture.model_matrix.row_ids, 'fixture.model_matrix.row_ids', 'character');
  validateVector(fixture.model_matrix.columns, 'fixture.model_matrix.columns', 'character');
  validateMatrix(fixture.model_matrix.values, 'fixture.model_matrix.values');
  validateValuesRecord(fixture.model_matrix.response, 'fixture.model_matrix.response');
  if (fixture.model_matrix.values.dimensions[0] !== fixture.input.row_count || fixture.model_matrix.values.dimensions[1] !== fixture.model_matrix.columns.length) {
    fail('fixture.model_matrix.values', 'matrix dimensions do not agree with row and column metadata');
  }
  if (fixture.model_matrix.row_ids.length !== fixture.input.row_count || fixture.model_matrix.response.values.length !== fixture.input.row_count) {
    fail('fixture.model_matrix', 'row IDs, response, and matrix dimensions disagree');
  }

  checkKeys(fixture.factorization, FACTORIZATION_FIELDS, 'fixture.factorization');
  if (!Number.isInteger(fixture.factorization.qr_rank)) fail('fixture.factorization.qr_rank', 'expected scalar integer');
  validateVector(fixture.factorization.pivot, 'fixture.factorization.pivot', 'numeric');
  validateValuesRecord(fixture.factorization.qraux, 'fixture.factorization.qraux');
  if (!isJsonNumeric(fixture.factorization.tolerance) || fixture.factorization.tolerance === null) fail('fixture.factorization.tolerance', 'expected scalar number');
  validateMatrix(fixture.factorization.r_factor, 'fixture.factorization.r_factor');
  if (fixture.factorization.qr_covariance_reconstruction_from_stored_R !== null) validateMatrix(fixture.factorization.qr_covariance_reconstruction_from_stored_R, 'fixture.factorization.qr_covariance_reconstruction_from_stored_R');
  if (fixture.factorization.qr_covariance_reconstruction_matches_unscaled !== null && typeof fixture.factorization.qr_covariance_reconstruction_matches_unscaled !== 'boolean') fail('fixture.factorization.qr_covariance_reconstruction_matches_unscaled', 'expected boolean or null');
  validateMatrix(fixture.factorization.information_matrix_from_final_working_weights, 'fixture.factorization.information_matrix_from_final_working_weights');
  if (fixture.factorization.normal_equation_inverse_diagnostic_only !== null) validateMatrix(fixture.factorization.normal_equation_inverse_diagnostic_only, 'fixture.factorization.normal_equation_inverse_diagnostic_only');
  checkKeys(fixture.factorization.condition, CONDITION_FIELDS, 'fixture.factorization.condition');
  for (const field of ['weighted_model_matrix', 'column_scaled_weighted_model_matrix']) {
    checkKeys(fixture.factorization.condition[field], ['value', 'singular_values'], `fixture.factorization.condition.${field}`);
    const entry = fixture.factorization.condition[field];
    if (!isJsonNumeric(entry.value)) fail(`fixture.factorization.condition.${field}.value`, 'expected scalar number or typed null');
    validateVector(entry.singular_values, `fixture.factorization.condition.${field}.singular_values`, 'numeric');
  }
  const eigenRatio = fixture.factorization.condition.unscaled_information_matrix_eigenvalue_ratio;
  if (!isJsonNumeric(eigenRatio)) fail('fixture.factorization.condition.unscaled_information_matrix_eigenvalue_ratio', 'expected scalar number or typed null');
  validateVector(fixture.factorization.condition.information_eigenvalues, 'fixture.factorization.condition.information_eigenvalues', 'numeric');
  validateValuesRecord(fixture.factorization.condition.weighted_column_norms, 'fixture.factorization.condition.weighted_column_norms');

  validateEnvironment(fixture.environment, 'fixture.environment');
  return fixture;
}

function legacyScalar(value, path) {
  if (Array.isArray(value)) {
    if (value.length !== 1) fail(path, `legacy scalar wrapper must have cardinality 1; received ${value.length}`);
    return value[0];
  }
  return value;
}

function legacyVector(value, path) {
  if (!Array.isArray(value)) fail(path, 'expected a legacy vector array');
  return value.map((item, index) => {
    const scalarValue = legacyScalar(item, `${path}[${index}]`);
    if (Array.isArray(scalarValue) || isObject(scalarValue)) fail(`${path}[${index}]`, 'unexpected nested legacy value');
    return scalarValue;
  });
}

function legacyValuesRecord(value, path, kind = 'numeric') {
  if (!isObject(value) || (value.names !== null && !Array.isArray(value.names)) || !Array.isArray(value.values)) fail(path, 'malformed legacy named vector');
  const values = legacyVector(value.values, `${path}.values`);
  const decimal = value.decimal17;
  let decimal17 = null;
  if (decimal !== null && decimal !== undefined) {
    if (Array.isArray(decimal)) decimal17 = legacyVector(decimal, `${path}.decimal17`);
    else if (isObject(decimal)) {
      decimal17 = value.names.map((name, index) => {
        if (!Object.hasOwn(decimal, name)) fail(`${path}.decimal17`, `missing decimal text for named value ${name}`);
        return legacyScalar(decimal[name], `${path}.decimal17.${name}`);
      });
    } else fail(`${path}.decimal17`, 'unexpected legacy decimal text shape');
  }
  if (value.names !== null && value.names.length !== values.length) fail(path, 'legacy names and values have different cardinality');
  if (decimal17 !== null && decimal17.length !== values.length) fail(path, 'legacy decimal text and values have different cardinality');
  validateVector(values, `${path}.values`, kind);
  if (decimal17 !== null) validateVector(decimal17, `${path}.decimal17`, 'character');
  return { names: value.names, values, decimal17 };
}

function legacyMatrix(value, path) {
  if (!isObject(value) || !Array.isArray(value.values)) fail(path, 'malformed legacy matrix');
  const values = value.values.map((row, index) => legacyVector(row, `${path}.values[${index}]`));
  const decimal17 = value.decimal17 === null || value.decimal17 === undefined
    ? null
    : value.decimal17.map((row, index) => legacyVector(row, `${path}.decimal17[${index}]`));
  const dimensions = [values.length, value.column_names?.length ?? values[0]?.length ?? 0];
  const result = { row_names: value.row_names ?? null, column_names: value.column_names ?? null, dimensions, values, decimal17 };
  validateMatrix(result, path);
  return result;
}

function legacyEnvironment(value, path, runtimeOnly = false) {
  if (!isObject(value) || !isObject(value.extSoftVersion)) fail(path, 'malformed legacy environment');
  const extSoftVersion = Object.fromEntries(Object.entries(value.extSoftVersion).map(([name, entry]) => [name, legacyScalar(entry, `${path}.extSoftVersion.${name}`)]));
  return {
    r_version: legacyScalar(value.r_version, `${path}.r_version`),
    r_platform: legacyScalar(value.r_platform, `${path}.r_platform`),
    extSoftVersion,
    locale: legacyScalar(value.locale, `${path}.locale`),
    ...(runtimeOnly ? {} : { timezone: legacyScalar(value.timezone, `${path}.timezone`) }),
    session_info: legacyScalar(value.session_info, `${path}.session_info`)
  };
}

function legacyFixture(fixture, expectedId) {
  if (!isObject(fixture) || !isObject(fixture.input) || !isObject(fixture.glm) || !isObject(fixture.model_matrix) || !isObject(fixture.factorization)) {
    fail('legacy.fixture', 'missing required fixture sections');
  }
  const id = legacyScalar(fixture.id, 'legacy.fixture.id');
  if (id !== expectedId) fail('legacy.fixture.id', `expected ${JSON.stringify(expectedId)}, received ${JSON.stringify(id)}`);
  const inputTreatment = Array.isArray(fixture.input.treatment)
    ? legacyVector(fixture.input.treatment, 'legacy.fixture.input.treatment')
    : isObject(fixture.input.treatment)
      ? Object.values(fixture.input.treatment).map((value, index) => legacyScalar(value, `legacy.fixture.input.treatment[${index}]`))
      : fail('legacy.fixture.input.treatment', 'expected legacy vector or named list');
  const glm = fixture.glm;
  const aliased = isObject(glm.aliased) && !Array.isArray(glm.aliased)
    ? { names: Object.keys(glm.aliased), values: Object.entries(glm.aliased).map(([name, value]) => legacyScalar(value, `legacy.fixture.glm.aliased.${name}`)), decimal17: null }
    : legacyValuesRecord(glm.aliased, 'legacy.fixture.glm.aliased', 'logical');
  const condition = fixture.factorization.condition;
  const out = {
    id,
    input: {
      row_ids: fixture.input.row_ids,
      row_count: legacyScalar(fixture.input.row_count, 'legacy.fixture.input.row_count'),
      formula: legacyScalar(fixture.input.formula, 'legacy.fixture.input.formula'),
      treatment: inputTreatment
    },
    glm: {
      warnings: fixture.glm.warnings,
      coefficients: legacyValuesRecord(glm.coefficients, 'legacy.fixture.glm.coefficients'),
      summary_coefficients: legacyMatrix(glm.summary_coefficients, 'legacy.fixture.glm.summary_coefficients'),
      vcov: legacyMatrix(glm.vcov, 'legacy.fixture.glm.vcov'),
      covariance_unscaled: legacyMatrix(glm.covariance_unscaled, 'legacy.fixture.glm.covariance_unscaled'),
      covariance_scaled: legacyMatrix(glm.covariance_scaled, 'legacy.fixture.glm.covariance_scaled'),
      se_from_vcov: legacyValuesRecord(glm.se_from_vcov, 'legacy.fixture.glm.se_from_vcov'),
      converged: legacyScalar(glm.converged, 'legacy.fixture.glm.converged'),
      iter: legacyScalar(glm.iter, 'legacy.fixture.glm.iter'),
      rank: legacyScalar(glm.rank, 'legacy.fixture.glm.rank'),
      deviance: legacyScalar(glm.deviance, 'legacy.fixture.glm.deviance'),
      null_deviance: legacyScalar(glm.null_deviance, 'legacy.fixture.glm.null_deviance'),
      linear_predictors: legacyValuesRecord(glm.linear_predictors, 'legacy.fixture.glm.linear_predictors'),
      fitted_values: legacyValuesRecord(glm.fitted_values, 'legacy.fixture.glm.fitted_values'),
      fitted_probability_range: {
        minimum: legacyScalar(glm.fitted_probability_range.minimum, 'legacy.fixture.glm.fitted_probability_range.minimum'),
        maximum: legacyScalar(glm.fitted_probability_range.maximum, 'legacy.fixture.glm.fitted_probability_range.maximum')
      },
      working_weights: legacyValuesRecord(glm.working_weights, 'legacy.fixture.glm.working_weights'),
      prior_weights: legacyValuesRecord(glm.prior_weights, 'legacy.fixture.glm.prior_weights'),
      boundary: legacyScalar(glm.boundary, 'legacy.fixture.glm.boundary'),
      aliased
    },
    model_matrix: {
      row_ids: fixture.model_matrix.row_ids,
      columns: fixture.model_matrix.columns,
      values: legacyMatrix(fixture.model_matrix.values, 'legacy.fixture.model_matrix.values'),
      response: legacyValuesRecord(fixture.model_matrix.response, 'legacy.fixture.model_matrix.response')
    },
    factorization: {
      qr_rank: legacyScalar(fixture.factorization.qr_rank, 'legacy.fixture.factorization.qr_rank'),
      pivot: legacyVector(fixture.factorization.pivot, 'legacy.fixture.factorization.pivot'),
      qraux: legacyValuesRecord(fixture.factorization.qraux, 'legacy.fixture.factorization.qraux'),
      tolerance: legacyScalar(fixture.factorization.tolerance, 'legacy.fixture.factorization.tolerance'),
      r_factor: legacyMatrix(fixture.factorization.r_factor, 'legacy.fixture.factorization.r_factor'),
      qr_covariance_reconstruction_from_stored_R: fixture.factorization.qr_covariance_reconstruction_from_stored_R === null
        ? null : legacyMatrix(fixture.factorization.qr_covariance_reconstruction_from_stored_R, 'legacy.fixture.factorization.qr_covariance_reconstruction_from_stored_R'),
      qr_covariance_reconstruction_matches_unscaled: fixture.factorization.qr_covariance_reconstruction_matches_unscaled === null
        ? null : legacyScalar(fixture.factorization.qr_covariance_reconstruction_matches_unscaled, 'legacy.fixture.factorization.qr_covariance_reconstruction_matches_unscaled'),
      information_matrix_from_final_working_weights: legacyMatrix(fixture.factorization.information_matrix_from_final_working_weights, 'legacy.fixture.factorization.information_matrix_from_final_working_weights'),
      normal_equation_inverse_diagnostic_only: fixture.factorization.normal_equation_inverse_diagnostic_only === null
        ? null : legacyMatrix(fixture.factorization.normal_equation_inverse_diagnostic_only, 'legacy.fixture.factorization.normal_equation_inverse_diagnostic_only'),
      condition: {
        weighted_model_matrix: {
          value: legacyScalar(condition.weighted_model_matrix.value, 'legacy.fixture.factorization.condition.weighted_model_matrix.value'),
          singular_values: legacyVector(condition.weighted_model_matrix.singular_values, 'legacy.fixture.factorization.condition.weighted_model_matrix.singular_values')
        },
        column_scaled_weighted_model_matrix: {
          value: legacyScalar(condition.column_scaled_weighted_model_matrix.value, 'legacy.fixture.factorization.condition.column_scaled_weighted_model_matrix.value'),
          singular_values: legacyVector(condition.column_scaled_weighted_model_matrix.singular_values, 'legacy.fixture.factorization.condition.column_scaled_weighted_model_matrix.singular_values')
        },
        unscaled_information_matrix_eigenvalue_ratio: legacyScalar(condition.unscaled_information_matrix_eigenvalue_ratio, 'legacy.fixture.factorization.condition.unscaled_information_matrix_eigenvalue_ratio'),
        information_eigenvalues: legacyVector(condition.information_eigenvalues, 'legacy.fixture.factorization.condition.information_eigenvalues'),
        weighted_column_norms: legacyValuesRecord(condition.weighted_column_norms, 'legacy.fixture.factorization.condition.weighted_column_norms')
      }
    },
    environment: legacyEnvironment(fixture.environment, 'legacy.fixture.environment')
  };
  return validateSerializedFixture(out, expectedId);
}

function normalizeLegacyRun(run) {
  if (!Array.isArray(run.fixtures) || run.fixtures.length !== FIXTURE_IDS.length) fail(`legacy.runs[${run.replicate}].fixtures`, 'expected exactly two fixture records');
  const byId = new Map();
  for (const fixture of run.fixtures) {
    const id = legacyScalar(fixture?.id, `legacy.runs[${run.replicate}].fixture.id`);
    if (!FIXTURE_IDS.includes(id)) fail(`legacy.runs[${run.replicate}].fixture.id`, `unexpected fixture ID ${JSON.stringify(id)}`);
    if (byId.has(id)) fail(`legacy.runs[${run.replicate}].fixtures`, `duplicate fixture ID ${id}`);
    byId.set(id, legacyFixture(fixture, id));
  }
  if (FIXTURE_IDS.some(id => !byId.has(id))) fail(`legacy.runs[${run.replicate}].fixtures`, 'missing required fixture');
  return {
    ...run,
    fixtures: FIXTURE_IDS.map(id => byId.get(id)),
    runtime: {
      ...run.runtime,
      r_environment: legacyEnvironment(run.runtime?.r_environment, `legacy.runs[${run.replicate}].runtime.r_environment`, true)
    }
  };
}

export function normalizeWebRArtifact(artifact) {
  if (!isObject(artifact) || !Array.isArray(artifact.runs)) fail('artifact', 'expected a WebR diagnostic artifact with runs');
  let normalized = artifact;
  if (artifact.schema === WEBR_DIAGNOSTIC_V1) {
    normalized = { ...artifact, runs: artifact.runs.map(normalizeLegacyRun), serialization_migration: 'v1-singleton-wrapper-shape-only' };
  } else if (artifact.schema !== WEBR_DIAGNOSTIC_V2) {
    fail('artifact.schema', `unsupported schema ${JSON.stringify(artifact.schema)}`);
  }
  validateWebRArtifact(normalized);
  return normalized;
}

export function validateWebRRun(run, expectedReplicate = null) {
  if (!isObject(run)) fail('run', 'expected a run object');
  if (![1, 2].includes(run.replicate) || (expectedReplicate !== null && run.replicate !== expectedReplicate)) fail('run.replicate', 'replicate identity must be exactly 1 or 2 as selected');
  if (run.evidence_classification !== 'WEBR_DIAGNOSTIC_SHADOW_EXECUTION') fail('run.evidence_classification', 'unexpected evidence classification');
  if (!Array.isArray(run.fixtures) || run.fixtures.length !== 2) fail(`run[${run.replicate}].fixtures`, 'expected exactly two fixture records');
  const ids = run.fixtures.map(fixture => fixture?.id);
  if (ids.some(id => typeof id !== 'string')) fail(`run[${run.replicate}].fixtures`, 'fixture IDs must be scalar strings');
  if (new Set(ids).size !== ids.length) fail(`run[${run.replicate}].fixtures`, 'duplicate fixture ID');
  if (FIXTURE_IDS.some(id => !ids.includes(id))) fail(`run[${run.replicate}].fixtures`, 'missing required fixture');
  for (const id of FIXTURE_IDS) validateSerializedFixture(run.fixtures.find(fixture => fixture.id === id), id);
  validateEnvironment(run.runtime?.r_environment, `run[${run.replicate}].runtime.r_environment`, true);
  return run;
}

export function validateWebRArtifact(artifact) {
  if (!isObject(artifact) || !Array.isArray(artifact.runs) || artifact.runs.length !== 2) fail('artifact.runs', 'expected exactly two WebR replicate records');
  const replicates = artifact.runs.map(run => run.replicate);
  if (new Set(replicates).size !== 2 || !replicates.includes(1) || !replicates.includes(2)) fail('artifact.runs', 'replicate 1 and replicate 2 must be distinct executions');
  artifact.runs.forEach(run => validateWebRRun(run));
  return artifact;
}

export function selectWebRReplicate(artifact, replicate) {
  validateWebRArtifact(artifact);
  const matches = artifact.runs.filter(run => run.replicate === replicate);
  if (matches.length !== 1) fail('artifact.runs', `expected exactly one record for replicate ${replicate}`);
  return matches[0];
}

export function validateWebRResult(result) {
  if (!isObject(result) || result.type !== 'RESULT') fail('worker.result', 'expected RESULT envelope');
  validateWebRRun(result);
  if (!isObject(result.runtime) || typeof result.runtime.webr_version !== 'string' || typeof result.runtime.channel !== 'string') {
    fail('worker.result.runtime', 'missing WebR runtime identity');
  }
  if (typeof result.runtime.worker_cross_origin_isolated !== 'boolean' || typeof result.runtime.shared_array_buffer_available !== 'boolean') {
    fail('worker.result.runtime', 'cross-origin isolation state must be boolean');
  }
  validateToJsShape(result.serialization_shape, result.fixtures);
  return result;
}

function validateToJsShape(shape, fixtures) {
  checkKeys(shape, ['api', 'fixture_records'], 'worker.result.serialization_shape');
  if (shape.api !== 'WebR 0.6.0 RObject.toJs({ depth: 0 })') fail('worker.result.serialization_shape.api', 'unexpected WebR conversion API identity');
  if (!Array.isArray(shape.fixture_records) || shape.fixture_records.length !== FIXTURE_IDS.length) {
    fail('worker.result.serialization_shape.fixture_records', 'expected one bounded shape record per fixture');
  }
  const byId = new Map(shape.fixture_records.map(record => [record?.id, record]));
  if (byId.size !== FIXTURE_IDS.length || FIXTURE_IDS.some(id => !byId.has(id))) fail('worker.result.serialization_shape.fixture_records', 'missing or duplicate fixture shape record');
  for (const id of FIXTURE_IDS) {
    const record = byId.get(id);
    checkKeys(record, ['id', 'root_type', 'root_fields', 'fixture_id', 'sections'], `worker.result.serialization_shape.${id}`);
    if (record.root_type !== 'list' || !Array.isArray(record.root_fields) || record.root_fields.length !== FIXTURE_FIELDS.length ||
        [...record.root_fields].sort().some((name, index) => name !== [...FIXTURE_FIELDS].sort()[index])) {
      fail(`worker.result.serialization_shape.${id}`, 'unexpected root RList shape');
    }
    checkKeys(record.fixture_id, ['type', 'names', 'values_length', 'value'], `worker.result.serialization_shape.${id}.fixture_id`);
    if (record.fixture_id.type !== 'character' || record.fixture_id.names !== null || record.fixture_id.values_length !== 1 || record.fixture_id.value !== id) {
      fail(`worker.result.serialization_shape.${id}.fixture_id`, 'fixture ID must be a one-value, unnamed character RObject');
    }
    checkKeys(record.sections, ['glm', 'model_matrix', 'factorization'], `worker.result.serialization_shape.${id}.sections`);
    for (const section of ['glm', 'model_matrix', 'factorization']) {
      const expectedFields = section === 'glm' ? GLM_FIELDS : section === 'model_matrix' ? MODEL_MATRIX_FIELDS : FACTORIZATION_FIELDS;
      const entry = record.sections[section];
      checkKeys(entry, ['type', 'fields', 'values_length'], `worker.result.serialization_shape.${id}.sections.${section}`);
      if (entry.type !== 'list' || entry.values_length !== expectedFields.length ||
          !Array.isArray(entry.fields) || entry.fields.length !== expectedFields.length ||
          [...entry.fields].sort().some((name, index) => name !== [...expectedFields].sort()[index])) {
        fail(`worker.result.serialization_shape.${id}.sections.${section}`, 'RList field names do not match the diagnostic schema');
      }
    }
  }
  if (fixtures.some(fixture => !byId.has(fixture.id))) fail('worker.result.serialization_shape', 'shape record does not correspond to fixture output');
}
