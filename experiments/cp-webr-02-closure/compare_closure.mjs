import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const closure = path.join(root, 'experiments/cp-webr-02-closure');
const fixtureRoot = path.join(root, 'experiments/cp-webr-02a/fixtures');
const manifestPath = path.join(fixtureRoot, 'fixtures_manifest.json');
const fixtureMatrixPath = path.join(root, 'experiments/cp-webr-02a/r1.2a/FIXTURE-ASSERTION-MATRIX.json');
const lockPath = path.join(closure, 'renv.lock');
const packageManifestPath = path.join(closure, 'source-package-integrity.json');
const fixtureIntegrityPath = path.join(closure, 'fixture-integrity.json');
const oracleSourcePath = path.join(closure, 'native_oracle.R');
const expectedFixtureMatrixSha256 = 'c53ed65845adfa0bdd61011ab7ba6667b5662f4144a438a0443898adc0cabeea';
const expectedTemplateSha256 = '7989403c7d093031b93a9c971a6d4f055101bab83c0ec4417fc52e4dceee24a4';

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function shaFile(file) { return sha(fs.readFileSync(file)); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function fail(message) { throw new Error(message); }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function asArray(value) { return value == null ? [] : Array.isArray(value) ? value : [value]; }
function mapById(items, label, failures) {
  if (!Array.isArray(items)) { failures.push(`${label}:not-array`); return new Map(); }
  const map = new Map();
  for (const item of items) {
    if (!item || typeof item.id !== 'string') { failures.push(`${label}:missing-id`); continue; }
    if (map.has(item.id)) failures.push(`${label}:duplicate:${item.id}`);
    else map.set(item.id, item);
  }
  return map;
}
function pushExact(failures, path, actual, expected) {
  if (!eq(actual, expected)) failures.push(`${path}:expected=${JSON.stringify(expected)}:actual=${JSON.stringify(actual)}`);
}
function compareNumber(failures, rows, name, actual, expected, tolerance) {
  const aNull = actual === null || actual === undefined;
  const eNull = expected === null || expected === undefined;
  if (aNull || eNull) {
    const pass = aNull && eNull;
    rows.push({ name, semantics: 'null', actual: aNull ? null : actual, reference: eNull ? null : expected, tolerance, absolute_difference: null, status: pass ? 'PASS' : 'FAIL' });
    if (!pass) failures.push(`${name}:numeric-null-semantics-mismatch`);
    return;
  }
  const a = Number(actual);
  const e = Number(expected);
  const diff = Math.abs(a - e);
  const pass = Number.isFinite(a) && Number.isFinite(e) && diff <= tolerance;
  rows.push({ name, semantics: 'numeric', actual: a, reference: e, tolerance, absolute_difference: diff, status: pass ? 'PASS' : 'FAIL' });
  if (!pass) failures.push(`${name}:difference=${diff}:tolerance=${tolerance}`);
}
function compareExactMap(failures, path, actual, expected) {
  const actualKeys = Object.keys(actual || {}).sort();
  const expectedKeys = Object.keys(expected || {}).sort();
  pushExact(failures, `${path}.keys`, actualKeys, expectedKeys);
  for (const key of expectedKeys) pushExact(failures, `${path}.${key}`, actual?.[key], expected[key]);
}
function exactErrorClassification(spec, app, failures) {
  const id = spec.id;
  const msgType = app.worker_message_type;
  if (id === 'fix_19_missing_values') {
    if (msgType !== 'ERROR' || app.worker_error?.code !== 'MISSING_COVARIATE') failures.push(`${id}:expected fail-closed MISSING_COVARIATE error`);
    return 'EXPECTED_MISSING_COVARIATE_REJECTION';
  }
  if (id === 'fix_19b_missing_treatment') {
    if (msgType !== 'ERROR' || app.worker_error?.code !== 'MISSING_TREATMENT') failures.push(`${id}:expected fail-closed MISSING_TREATMENT error`);
    return 'EXPECTED_MISSING_TREATMENT_REJECTION';
  }
  if (id === 'fix_20_malformed_category') {
    const allowed = ['UNLISTED_FACTOR_OBSERVATION_REJECTED', 'MISSING_COVARIATE', 'BLANK_FACTOR_LEVEL_REJECTED'];
    if (msgType !== 'ERROR' || !allowed.includes(app.worker_error?.code)) failures.push(`${id}:expected strict blank/unlisted category policy rejection`);
    return 'PRODUCT_POLICY_REJECTION_HISTORICAL_MANIFEST_SUCCESS';
  }
  if (id === 'fix_23_no_eligible_match') {
    const message = app.worker_error?.error || '';
    if (msgType !== 'ERROR' || !/no units were matched|zero matches|no eligible/i.test(message)) failures.push(`${id}:expected safe zero-match error, observed ${msgType}/${message}`);
    return 'EXPECTED_ZERO_MATCHES_SAFE_ERROR';
  }
  if (id === 'fix_24_duplicate_ids') {
    if (msgType !== 'ERROR' || app.worker_error?.code !== 'DUPLICATE_UNIT_ID_REJECTED') failures.push(`${id}:expected pre-computation duplicate ID rejection`);
    return 'PRODUCT_POLICY_REJECTION_DUPLICATE_ID';
  }
  return null;
}

function semanticTerm(term, covariates, aliases, definitions) {
  if (term === '(Intercept)') return '(Intercept)';
  const candidates = [];
  for (const covariate of covariates) candidates.push({ prefix: covariate, covariate });
  for (const [alias, originalHeader] of Object.entries(aliases)) candidates.push({ prefix: alias, covariate: originalHeader });
  candidates.sort((a, b) => b.prefix.length - a.prefix.length);
  for (const { prefix, covariate } of candidates) {
    if (term === prefix) return covariate;
    if (!term.startsWith(prefix)) continue;
    let suffix = term.slice(prefix.length).replace(/^[_.:]+/, '');
    const levels = definitions[covariate]?.levels || [];
    if (levels.includes(suffix)) return `${covariate}::${suffix}`;
  }
  return term;
}

function appResult(app) { return app?.envelope?.payload || null; }
function appAliases(result) {
  const out = {};
  for (const value of Object.values(result?.factorConfiguration || {})) {
    if (value?.internalAlias && value?.originalHeader) out[value.internalAlias] = value.originalHeader;
  }
  return out;
}
function semanticMap(rows, covariates, aliases, definitions, label, failures) {
  const out = new Map();
  for (const row of rows || []) {
    const rawName = String(row.term ?? row.originalHeader ?? row.covariateName ?? row.displayName ?? '');
    const key = semanticTerm(rawName, covariates, aliases, definitions);
    if (out.has(key)) failures.push(`${label}:duplicate-semantic-key:${key}`);
    else out.set(key, row);
  }
  return out;
}
function contrastColumns(meta) {
  const levels = meta?.declared_levels || [];
  const ref = meta?.reference_level;
  return levels.filter(level => level !== ref);
}
function balanceBaseCovariate(key, covariates) {
  if (key === 'distance' || key.startsWith('distance_') || key.startsWith('distance::level_')) return 'distance';
  for (const covariate of [...covariates].sort((a, b) => b.length - a.length)) {
    if (key === covariate || key.startsWith(`${covariate}::`) || key.startsWith(`${covariate}_`)) return covariate;
  }
  return null;
}
function distanceValue(key) {
  const match = /^distance_([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)$/.exec(key);
  return match ? Number(match[1]) : null;
}
function normalizeDistanceBalanceKeys(map) {
  const entries = [...map.entries()].filter(([key]) => distanceValue(key) !== null)
    .sort(([left], [right]) => distanceValue(left) - distanceValue(right));
  for (const [key] of entries) map.delete(key);
  entries.forEach(([, row], index) => map.set(`distance::level_${index + 1}`, row));
  return entries.map(([key]) => distanceValue(key));
}

function compareFixture(referenceFixture, appFixture, spec, allFailures, numericRows, fixtureMatrix, tolerances) {
  const failures = [];
  const id = spec.id;
  if (appFixture.execution_path !== 'chromium-built-static-app-production-dedicated-worker' || appFixture.worker_script_url !== '/assets/webr-worker.js') {
    failures.push(`${id}:result-not-from-production-dedicated-worker`);
  }
  if (appFixture.input_evidence?.id !== id || appFixture.manifest_expected_status !== spec.expected_status) failures.push(`${id}:input identity/classification does not match preserved manifest`);
  pushExact(failures, `${id}.input.csv_hash`, appFixture.input_evidence?.csv_sha256, referenceFixture.fixture_sha256?.csv);
  pushExact(failures, `${id}.input.config_hash`, appFixture.input_evidence?.config_sha256, referenceFixture.fixture_sha256?.config);
  pushExact(failures, `${id}.input.row_ids`, appFixture.input_evidence?.row_ids, referenceFixture.input_identity?.row_ids);

  const expectedSpecial = exactErrorClassification(spec, appFixture, failures);
  if (expectedSpecial) {
    if (!referenceFixture.native_classification) failures.push(`${id}:native classification missing for special case`);
    if (['fix_19_missing_values', 'fix_19b_missing_treatment'].includes(id) && !['SUCCESS', 'ERROR'].includes(referenceFixture.native_execution?.status)) {
      failures.push(`${id}:independent native missing-data behavior was not observed`);
    }
    if (id === 'fix_20_malformed_category' && !['SUCCESS', 'ERROR'].includes(referenceFixture.native_execution?.status)) failures.push(`${id}:native R behavior was not separately observed`);
    if (id === 'fix_24_duplicate_ids' && referenceFixture.native_execution?.status !== 'NOT_RUN') failures.push(`${id}:native oracle must not compute invalid duplicate IDs`);
    if (id === 'fix_23_no_eligible_match' && !String(referenceFixture.native_classification).includes('ZERO_MATCH')) failures.push(`${id}:native zero-match classification absent`);
    allFailures.push(...failures);
    return { id, classification: expectedSpecial, native_classification: referenceFixture.native_classification,
      native_observed_status: referenceFixture.native_execution?.status || null,
      native_error_stage: referenceFixture.native_execution?.stage || null,
      native_error_message: referenceFixture.native_execution?.message || null,
      product_policy_status: referenceFixture.product_policy?.status || null,
      historical_manifest_status: referenceFixture.manifest_expected_status,
      parity: 'POLICY_OR_EXPECTED_ERROR_CLASSIFICATION', status: failures.length ? 'FAIL' : 'PASS', failures };
  }

  if (appFixture.worker_message_type !== 'ANALYSIS_COMPLETE' || !appResult(appFixture)) {
    failures.push(`${id}:expected successful analysis result from actual Worker`);
    allFailures.push(...failures);
    return { id, classification: 'EXPECTED_SUCCESS', parity: 'NOT_COMPARABLE', status: 'FAIL', failures };
  }
  const result = appResult(appFixture);
  const native = referenceFixture.native_execution;
  if (!native || native.status !== 'SUCCESS') {
    failures.push(`${id}:native outcome is ${native?.status || 'missing'}; cannot claim numeric parity`);
    allFailures.push(...failures);
    return { id, classification: 'EXPECTED_SUCCESS', parity: 'NATIVE_OUTCOME_NOT_COMPARABLE', status: 'FAIL', failures };
  }
  const tol = tolerances || {};
  const numericTolerance = (name, fallback = 1e-4) => typeof tol[name] === 'number' ? tol[name]
    : typeof tol[name]?.value === 'number' ? tol[name].value : fallback;
  const localRows = [];

  const inputEvidence = appFixture.input_evidence || {};
  const covariates = Object.keys(inputEvidence.covariate_definitions || {});
  const definitions = inputEvidence.covariate_definitions || {};
  const aliases = appAliases(result);
  const nativeConfiguration = referenceFixture.configuration || {};
  const appConfiguration = result.matchingConfiguration || {};
  const matchingConfigurationFields = [
    ['method', appConfiguration.method, nativeConfiguration.method],
    ['link_or_distance_metric', appConfiguration.distanceMetric, nativeConfiguration.link],
    ['ratio', appConfiguration.ratio, nativeConfiguration.ratio],
    ['replace', appConfiguration.replace, nativeConfiguration.replace],
    ['matching_order', appConfiguration.matchingOrder, nativeConfiguration.m_order],
    ['caliper', appConfiguration.caliper, nativeConfiguration.caliper],
    ['standardized_caliper', appConfiguration.stdCaliper, nativeConfiguration.std_caliper],
    ['discard', appConfiguration.discard, nativeConfiguration.discard]
  ];
  for (const [field, actual, expected] of matchingConfigurationFields) pushExact(failures, `${id}.matching_configuration.${field}`, actual, expected);
  pushExact(failures, `${id}.matching_configuration.treatment`, appConfiguration.treatmentVariable, 'treat');
  pushExact(failures, `${id}.matching_configuration.covariates`, appConfiguration.covariates, covariates);
  pushExact(failures, `${id}.matching_configuration.estimand`, nativeConfiguration.estimand, 'ATT');
  pushExact(failures, `${id}.matching_configuration.distance_method`, nativeConfiguration.distance, 'glm');
  const nativeCoefficients = native.glm?.coefficients || {};
  const appCoefficients = result.numericalDiagnostics?.coefficientTable || [];
  const nativeCoefficientMap = new Map(Object.entries(nativeCoefficients).map(([term, value]) => [semanticTerm(term, covariates, {}, definitions), value]));
  const appCoefficientMap = new Map(appCoefficients.map(value => [semanticTerm(value.term, covariates, aliases, definitions), value]));
  pushExact(failures, `${id}.coefficient_terms`, [...appCoefficientMap.keys()].sort(), [...nativeCoefficientMap.keys()].sort());
  for (const [term, ref] of nativeCoefficientMap) {
    const actual = appCoefficientMap.get(term);
    if (!actual) continue;
    pushExact(failures, `${id}.coefficient.${term}.aliased`, Boolean(actual.aliased), Boolean(ref.aliased));
    compareNumber(failures, localRows, `${id}.coefficient.${term}.estimate`, actual.estimate, ref.estimate, numericTolerance('model_coefficients'));
    compareNumber(failures, localRows, `${id}.coefficient.${term}.standard_error`, actual.standardError, ref.standard_error, numericTolerance('model_coefficients'));
    compareNumber(failures, localRows, `${id}.coefficient.${term}.z_value`, actual.zValue, ref.z_value, numericTolerance('model_coefficients'));
    compareNumber(failures, localRows, `${id}.coefficient.${term}.p_value`, actual.pValue, ref.p_value, numericTolerance('model_coefficients'));
  }
  pushExact(failures, `${id}.glm.converged`, Boolean(result.numericalDiagnostics?.glmConvergence), Boolean(native.glm?.converged));
  pushExact(failures, `${id}.glm.iterations`, result.numericalDiagnostics?.glmIterations, native.glm?.iterations);
  pushExact(failures, `${id}.glm.aliases`, (result.numericalDiagnostics?.coefficientTable || []).filter(x => x.aliased).map(x => semanticTerm(x.term, covariates, aliases, definitions)).sort(), asArray(native.glm?.aliased_terms).map(term => semanticTerm(term, covariates, {}, definitions)).sort());
  compareNumber(failures, localRows, `${id}.glm.null_deviance`, result.numericalDiagnostics?.glmNullDeviance, native.glm?.null_deviance, numericTolerance('glm_diagnostic_values'));
  compareNumber(failures, localRows, `${id}.glm.residual_deviance`, result.numericalDiagnostics?.glmResidualDeviance, native.glm?.residual_deviance, numericTolerance('glm_diagnostic_values'));
  compareNumber(failures, localRows, `${id}.glm.maximum_standard_error`, result.numericalDiagnostics?.maxCoefficientStandardError, native.glm?.maximum_standard_error, numericTolerance('glm_diagnostic_values'));
  compareNumber(failures, localRows, `${id}.glm.maximum_absolute_coefficient`, result.numericalDiagnostics?.maxAbsoluteCoefficient, native.glm?.maximum_absolute_coefficient, numericTolerance('glm_diagnostic_values'));

  pushExact(failures, `${id}.unit_ids`, result.propensityScores?.unitIds, referenceFixture.input_identity?.row_ids);
  pushExact(failures, `${id}.treatment_identity`, result.propensityScores?.treatment, referenceFixture.input_identity?.treatment_values);
  const nativeScores = native.glm?.propensity_scores || {};
  const nativeLogits = native.glm?.linear_logits || {};
  const ids = referenceFixture.input_identity?.row_ids || [];
  pushExact(failures, `${id}.native_input_row_count`, referenceFixture.input_identity?.row_count, ids.length);
  pushExact(failures, `${id}.application_input_row_count`, inputEvidence.row_ids?.length, ids.length);
  pushExact(failures, `${id}.native_input_identity_row_ids`, native.input_identity?.row_ids, ids);
  pushExact(failures, `${id}.propensity_score_keys`, Object.keys(nativeScores).sort(), [...ids].sort());
  pushExact(failures, `${id}.linear_logit_keys`, Object.keys(nativeLogits).sort(), [...ids].sort());
  const nativeDistances = native.matchit?.distances || {};
  compareNumber(failures, localRows, `${id}.matching.effective_caliper_width_raw`, result.matchingConfiguration?.effectiveCaliperWidthRaw,
    native.matchit?.effective_caliper_width_raw, numericTolerance('matching_distances_and_pair_distances'));
  pushExact(failures, `${id}.matching_distance_keys`, Object.keys(nativeDistances).sort(), [...ids].sort());
  for (let index = 0; index < ids.length; index++) {
    const unitId = ids[index];
    compareNumber(failures, localRows, `${id}.propensity.${unitId}`, result.propensityScores?.propensityScores?.[index], nativeScores[unitId], numericTolerance('propensity_scores_and_linear_logits'));
    compareNumber(failures, localRows, `${id}.linear_logit.${unitId}`, result.propensityScores?.linearLogits?.[index], nativeLogits[unitId], numericTolerance('propensity_scores_and_linear_logits'));
    const appDistance = result.matchingConfiguration?.distanceMetric === 'logit'
      ? result.propensityScores?.propensityScores?.[index]
      : result.propensityScores?.linearLogits?.[index];
    compareNumber(failures, localRows, `${id}.matching_distance.${unitId}`, appDistance, nativeDistances[unitId], numericTolerance('matching_distances_and_pair_distances'));
  }
  for (const variable of covariates) {
    if (definitions[variable]?.inferredType !== 'categorical') continue;
    const nativeFactor = native.factor_reference_and_contrasts?.[variable];
    const appFactor = Object.values(result.factorConfiguration || {}).find(item => item?.originalHeader === variable);
    if (!nativeFactor || !appFactor) { failures.push(`${id}.factor.${variable}:factor metadata missing`); continue; }
    pushExact(failures, `${id}.factor.${variable}.reference`, appFactor.referenceLevel, nativeFactor.reference_level);
    pushExact(failures, `${id}.factor.${variable}.declared_levels`, appFactor.levels, nativeFactor.declared_levels);
    pushExact(failures, `${id}.factor.${variable}.contrast_columns`, (appFactor.levels || []).filter(level => level !== appFactor.referenceLevel), contrastColumns(nativeFactor));
    const effectiveLevels = nativeFactor.effective_factor_levels || nativeFactor.contrast_row_levels;
    pushExact(failures, `${id}.factor.${variable}.contrast_row_levels`, nativeFactor.contrast_row_levels, effectiveLevels);
    const expectedContrastMatrix = Object.fromEntries(contrastColumns(nativeFactor).map(level => [
      level, effectiveLevels.map(rowLevel => rowLevel === level ? 1 : 0)
    ]));
    pushExact(failures, `${id}.factor.${variable}.native_treatment_contrast_matrix`, nativeFactor.contrast_matrix, expectedContrastMatrix);
    const expectedFactorTerms = contrastColumns(nativeFactor).map(level => `${variable}::${level}`).sort();
    const nativeFactorTerms = [...nativeCoefficientMap.keys()].filter(term => term.startsWith(`${variable}::`)).sort();
    const appFactorTerms = [...appCoefficientMap.keys()].filter(term => term.startsWith(`${variable}::`)).sort();
    pushExact(failures, `${id}.factor.${variable}.native_coefficient_contrast_terms`, nativeFactorTerms, expectedFactorTerms);
    pushExact(failures, `${id}.factor.${variable}.application_coefficient_contrast_terms`, appFactorTerms, expectedFactorTerms);
  }

  const nativePairs = native.matchit?.ordered_matched_pairs || {};
  const actualPairs = result.matchMatrix || {};
  pushExact(failures, `${id}.matched_pair_treated_order`, actualPairs.treatedIds, Object.keys(nativePairs));
  pushExact(failures, `${id}.matched_pair_control_order`, actualPairs.matchedControlIds, Object.values(nativePairs));
  pushExact(failures, `${id}.matched_pair_identity`, actualPairs.treatedIds?.map((treatedId, i) => [treatedId, actualPairs.matchedControlIds?.[i]]), Object.entries(nativePairs));
  const nativePairDistances = native.matchit?.pair_distances || {};
  for (let index = 0; index < (actualPairs.treatedIds || []).length; index++) {
    const treatedId = actualPairs.treatedIds[index];
    compareNumber(failures, localRows, `${id}.pair_distance.${treatedId}`, actualPairs.pairDistances?.[index], nativePairDistances[treatedId], numericTolerance('matching_distances_and_pair_distances'));
  }
  const expectedWeights = native.matchit?.weights || {};
  const actualWeights = Object.fromEntries((result.matchingWeights?.unitIds || []).map((unitId, index) => [unitId, result.matchingWeights.weights[index]]));
  compareExactMap(failures, `${id}.matching_weights`, actualWeights, expectedWeights);
  const expectedSubclasses = native.matchit?.subclasses || {};
  const actualSubclasses = Object.fromEntries((result.matchingWeights?.unitIds || []).map((unitId, index) => [unitId, result.matchingWeights.subclass[index]]));
  compareExactMap(failures, `${id}.subclasses`, actualSubclasses, expectedSubclasses);

  const nativeAccounting = native.matchit?.sample_accounting || {};
  const appAccounting = result.sampleAccounting || {};
  const accountingKeys = {
    importedTotal: 'imported_total', completeCases: 'complete_cases', treatedTotal: 'treated_total', controlTotal: 'control_total',
    matchedTreatedCount: 'matched_pair_count', matchedControlCount: 'matched_control_count',
    unmatchedTreatedCount: 'unmatched_treated_count', unmatchedControlCount: 'unmatched_control_count',
    discardedTreatedCount: 'discarded_treated_count', discardedControlCount: 'discarded_control_count'
  };
  for (const [appKey, nativeKey] of Object.entries(accountingKeys)) pushExact(failures, `${id}.sample_accounting.${appKey}`, appAccounting[appKey], nativeAccounting[nativeKey]);

  const nativeRaw = native.cobalt?.raw?.rows || {};
  const nativeStd = native.cobalt?.standardized?.rows || {};
  const aliasesToHeaders = aliases;
  const nativeRawMap = semanticMap(Object.values(nativeRaw), covariates, {}, definitions, `${id}.native_raw_balance`, failures);
  const nativeStdMap = semanticMap(Object.values(nativeStd), covariates, {}, definitions, `${id}.native_std_balance`, failures);
  const appBalanceMap = semanticMap(result.balanceTable || [], covariates, aliasesToHeaders, definitions, `${id}.app_balance`, failures);
  const appDistanceLevels = normalizeDistanceBalanceKeys(appBalanceMap);
  const nativeRawDistanceLevels = normalizeDistanceBalanceKeys(nativeRawMap);
  const nativeStdDistanceLevels = normalizeDistanceBalanceKeys(nativeStdMap);
  appBalanceMap.delete('distance');
  nativeRawMap.delete('distance');
  nativeStdMap.delete('distance');
  pushExact(failures, `${id}.balance_distance_level_count`, appDistanceLevels.length, nativeRawDistanceLevels.length);
  pushExact(failures, `${id}.native_balance_distance_level_count`, nativeStdDistanceLevels.length, nativeRawDistanceLevels.length);
  for (let index = 0; index < Math.min(appDistanceLevels.length, nativeRawDistanceLevels.length); index++) {
    compareNumber(failures, localRows, `${id}.balance.distance_level_${index + 1}.identity`, appDistanceLevels[index],
      nativeRawDistanceLevels[index], numericTolerance('matching_distances_and_pair_distances'));
  }
  const expectedCovariateKeys = [...covariates].sort();
  const baseKeySet = (map, label) => {
    const bases = [];
    for (const key of map.keys()) {
      const base = balanceBaseCovariate(key, covariates);
      if (base === null) failures.push(`${id}.${label}:unexpected_balance_row:${key}`);
      else if (base !== 'distance') bases.push(base);
    }
    return [...new Set(bases)].sort();
  };
  pushExact(failures, `${id}.expected_covariate_keys`, baseKeySet(appBalanceMap, 'app_balance'), expectedCovariateKeys);
  pushExact(failures, `${id}.native_expected_covariate_keys`, baseKeySet(nativeRawMap, 'native_raw_balance'), expectedCovariateKeys);
  pushExact(failures, `${id}.native_standardized_expected_covariate_keys`, baseKeySet(nativeStdMap, 'native_std_balance'), expectedCovariateKeys);
  for (const variable of covariates) {
    if (definitions[variable]?.inferredType !== 'categorical') continue;
    const expectedLevels = (definitions[variable].levels || []).map(level => `${variable}::${level}`).sort();
    const keysForVariable = map => [...map.keys()].filter(key => key.startsWith(`${variable}::`)).sort();
    pushExact(failures, `${id}.expected_factor_balance_rows.${variable}`, keysForVariable(appBalanceMap), expectedLevels);
    pushExact(failures, `${id}.native_factor_balance_rows.${variable}`, keysForVariable(nativeRawMap), expectedLevels);
    pushExact(failures, `${id}.native_standardized_factor_balance_rows.${variable}`, keysForVariable(nativeStdMap), expectedLevels);
  }
  pushExact(failures, `${id}.balance_covariate_keys`, [...appBalanceMap.keys()].sort(), [...nativeRawMap.keys()].sort());
  pushExact(failures, `${id}.balance_std_covariate_keys`, [...nativeStdMap.keys()].sort(), [...nativeRawMap.keys()].sort());
  for (const [key, rawRow] of nativeRawMap) {
    const stdRow = nativeStdMap.get(key);
    const appRow = appBalanceMap.get(key);
    if (!appRow || !stdRow) continue;
    const rawType = String(rawRow.Type ?? '');
    const binary = /bin/i.test(rawType);
    pushExact(failures, `${id}.balance.${key}.type`, appRow.type, binary ? 'binary' : 'continuous');
    const metricSpecs = [
      ['unadjustedTreatedMean', rawRow['M.1.Un']], ['unadjustedTreatedSd', rawRow['SD.1.Un']],
      ['unadjustedControlMean', rawRow['M.0.Un']], ['unadjustedControlSd', rawRow['SD.0.Un']],
      ['matchedTreatedMean', rawRow['M.1.Adj']], ['matchedTreatedSd', rawRow['SD.1.Adj']],
      ['matchedControlMean', rawRow['M.0.Adj']], ['matchedControlSd', rawRow['SD.0.Adj']],
      ['unadjustedSmd', stdRow['Diff.Un']], ['matchedSmd', stdRow['Diff.Adj']],
      ['rawDifferenceUnadjusted', binary ? rawRow['Diff.Un'] : null], ['rawDifferenceMatched', binary ? rawRow['Diff.Adj'] : null],
      ['unadjustedVarianceRatio', stdRow['V.Ratio.Un']], ['matchedVarianceRatio', stdRow['V.Ratio.Adj']]
    ];
    for (const [field, expected] of metricSpecs) {
      compareNumber(failures, localRows, `${id}.cobalt.${key}.${field}`, appRow[field], expected, numericTolerance('cobalt_smd_raw_difference_and_variance_ratio'));
    }
  }

  const rubinTol = typeof tol.rubin_b_r?.value === 'number' ? tol.rubin_b_r.value : 1e-4;
  compareNumber(failures, localRows, `${id}.diagnostics.rubinB`, result.numericalDiagnostics?.rubinB, native.diagnostics?.rubin_b, rubinTol);
  compareNumber(failures, localRows, `${id}.diagnostics.rubinR`, result.numericalDiagnostics?.rubinR, native.diagnostics?.rubin_r, rubinTol);

  const policy = fixtureMatrix.fixtures?.[id];
  const expectedPublication = policy?.details?.publicationVerdict;
  if (expectedPublication) pushExact(failures, `${id}.publication_restriction`, result.publicationStatus?.verdict, expectedPublication);
  if (spec.expected_status === 'SUCCESS_WITH_WARNING') {
    const warningCount = (result.warnings || []).length;
    if (warningCount === 0 && !result.numericalInstabilitySafeguard?.triggered) failures.push(`${id}:warning/diagnostic distinction is absent`);
  }

  numericRows.push(...localRows);
  allFailures.push(...failures);
  const warningDiagnostic = ['fix_15_quasi_separation', 'fix_16_complete_separation', 'fix_21_extreme_propensities'].includes(id) ? {
    preserved_manifest_classification: spec.expected_status,
    native_warning_messages: referenceFixture.native_execution?.warnings || null,
    native_glm_converged: referenceFixture.native_execution?.glm?.converged ?? null,
    application_warning_messages: result.warnings || [],
    application_glm_converged: result.numericalDiagnostics?.glmConvergence ?? null,
    application_maximum_standard_error: result.numericalDiagnostics?.maxCoefficientStandardError ?? null,
    application_safeguard_triggered: result.numericalInstabilitySafeguard?.triggered ?? false,
    application_publication_verdict: result.publicationStatus?.verdict ?? null,
    distinction: (result.warnings || []).length > 0 || result.numericalInstabilitySafeguard?.triggered
      ? 'APPLICATION_WARNING_OR_DIAGNOSTIC_PRESENT'
      : 'MANIFEST_WARNING_CLASSIFICATION_WITHOUT_APPLICATION_WARNING_OR_DIAGNOSTIC'
  } : null;
  return { id, classification: spec.expected_status, native_classification: referenceFixture.native_classification,
    parity: 'PRODUCTION_WORKER_VS_NATIVE_R', status: failures.length ? 'FAIL' : 'PASS', compared_numeric_fields: localRows.length,
    warning_diagnostic_distinction: warningDiagnostic, failures };
}

function integrityFailures(reference, referenceBytes, sidecar, browser, manifest, failures) {
  const packageManifest = readJson(packageManifestPath);
  const fixtureIntegrity = readJson(fixtureIntegrityPath);
  const lock = readJson(lockPath);
  const expectedCommit = process.env.GITHUB_SHA || reference.commit_sha;
  if (sidecar.status !== 'PASS_CANDIDATE_INTEGRITY') failures.push('candidate_integrity_sidecar_not_pass');
  if (sha(referenceBytes) !== sidecar.candidate_sha256) failures.push('candidate_reference_sha256_mismatch');
  if (reference.commit_sha !== expectedCommit || sidecar.commit_sha !== expectedCommit || browser.commit_sha !== expectedCommit) failures.push('commit_sha_mismatch');
  if (reference.evidence_class !== 'CANDIDATE_NATIVE_GOLDEN_PENDING_INDEPENDENT_RED_TEAM_ACCEPTANCE') failures.push('reference_replaced_or_evidence_class_invalid');
  if (reference.provenance?.oracle_source_sha256 !== shaFile(oracleSourcePath)) failures.push('native_oracle_source_hash_mismatch');
  if (reference.provenance?.frozen_template_sha256 !== expectedTemplateSha256 || browser.provenance?.template_sha256 !== expectedTemplateSha256) failures.push('frozen_R_template_hash_mismatch');
  if (reference.provenance?.oracle_source_sha256 !== sidecar.native_oracle_source_sha256) failures.push('sidecar_native_oracle_hash_mismatch');
  if (reference.provenance?.fixture_manifest_sha256 !== shaFile(manifestPath) || browser.provenance?.fixture_manifest_sha256 !== shaFile(manifestPath)) failures.push('fixture_manifest_hash_mismatch');
  if (reference.provenance?.fixture_integrity_sha256 !== shaFile(fixtureIntegrityPath) || browser.provenance?.fixture_integrity_sha256 !== shaFile(fixtureIntegrityPath)) failures.push('fixture_integrity_hash_mismatch');
  if (fixtureIntegrity.manifest_sha256 !== shaFile(manifestPath) || fixtureIntegrity.fixtures.length !== 25) failures.push('committed_fixture_integrity_pin_invalid');
  if (reference.provenance?.renv_lock_sha256 !== shaFile(lockPath) || reference.provenance?.renv_lock_sha256 !== sidecar.renv_lock_sha256) failures.push('renv_lock_hash_mismatch');
  if (reference.provenance?.source_package_manifest_sha256 !== shaFile(packageManifestPath) || reference.provenance?.source_package_manifest_sha256 !== sidecar.package_source_manifest_sha256) failures.push('package_manifest_hash_mismatch');
  if (reference.provenance?.r_version !== '4.6.0') failures.push(`native_R_version_mismatch:${reference.provenance?.r_version}`);
  if (reference.provenance?.package_versions?.MatchIt !== '4.8.1') failures.push(`MatchIt_version_mismatch:${reference.provenance?.package_versions?.MatchIt}`);
  if (reference.provenance?.package_versions?.cobalt !== '5.0.0') failures.push(`cobalt_version_mismatch:${reference.provenance?.package_versions?.cobalt}`);
  if (sidecar.package_count !== Object.keys(lock.Packages).length || packageManifest.package_count !== sidecar.package_count) failures.push('package_source_count_mismatch');
  if (browser.execution?.path !== 'Chromium page -> built /assets/webr-worker.js Dedicated Worker -> production WebR adapter imports') failures.push('production_worker_execution_path_unverified');
  if (browser.execution?.worker_script_url !== '/assets/webr-worker.js' || browser.execution?.no_direct_node_adapter_results !== true) failures.push('production_worker_identity_unverified');
  if (!/^[0-9a-f]{64}$/.test(browser.execution?.worker_bundle_sha256 || '')) failures.push('production_worker_bundle_hash_missing');
  if (browser.execution?.legacy_worker_absent !== true) failures.push('legacy_statistical_worker_present_or_not_measured');
  if (browser.runtime?.init?.webrVersion !== '0.6.0' || browser.runtime?.init?.rVersion !== '4.6.0') failures.push('WebR_or_R_runtime_version_mismatch');
  if (!eq(browser.runtime?.init?.packages, ['MatchIt@4.8.1', 'cobalt@5.0.0'])) failures.push('browser_runtime_package_versions_mismatch');
  const isolation = browser.runtime?.init?.pageIsolation || {};
  if (!isolation.crossOriginIsolated || !isolation.sharedArrayBufferAvailable || browser.runtime?.init?.channelType !== 'SharedArrayBuffer') failures.push('runtime_channel_not_empirically_shared_array_buffer');
  if (browser.runtime?.init?.crossOriginIsolated !== true || browser.runtime?.init?.sharedArrayBufferAvailable !== true) failures.push('dedicated_worker_isolation_not_observed');
  if (browser.runtime?.nested_webr_worker_request_observed !== true || browser.runtime?.nested_webr_worker_initialization_observed !== true) failures.push('nested_webr_worker_runtime_not_observed');
  if (browser.runtime?.nested_webr_worker_network_interception_observed !== true) failures.push('nested_webr_worker_http_interception_unmeasured');
  const cspResponses = browser.runtime?.csp_responses || [];
  const appWorkerPolicy = cspResponses.find(item => new URL(item.url).pathname === '/assets/webr-worker.js')?.policy || '';
  const nestedWorkerPolicy = cspResponses.find(item => new URL(item.url).pathname === '/assets/webr/webr-worker.js')?.policy || '';
  if (!appWorkerPolicy.includes("'wasm-unsafe-eval'") || appWorkerPolicy.includes("'unsafe-eval'")) failures.push('production_worker_csp_profile_mismatch');
  if (!nestedWorkerPolicy.includes("'unsafe-eval'")) failures.push('nested_WebR_worker_CSP_exception_not_explicitly_observed');
  const storage = browser.storage_after_all_fixtures || {};
  for (const checkpoint of ['beforeInitialization', 'afterAllFixtures']) {
    const state = storage[checkpoint];
    if (!state || !Array.isArray(state.localStorageKeys) || !Array.isArray(state.sessionStorageKeys) ||
        !Array.isArray(state.cookieNames) || !Array.isArray(state.cacheStorageNames) ||
        !Array.isArray(state.serviceWorkerRegistrations) || !Array.isArray(state.indexedDbNames)) {
      failures.push(`storage_checkpoint_unmeasured:${checkpoint}`);
      continue;
    }
    if (state.localStorageKeys.length || state.sessionStorageKeys.length || state.cookieNames.length || state.serviceWorkerRegistrations.length) {
      failures.push(`unexpected_browser_key_cookie_or_service_worker_storage_after_${checkpoint}`);
    }
    if (state.rowIdSentinelCount < 1 || state.rowIdMatchCount !== 0 || !Array.isArray(state.indexedDbNames)) {
      failures.push(`browser_row_id_storage_scan_failed:${checkpoint}`);
    }
  }
  if (shaFile(fixtureMatrixPath) !== expectedFixtureMatrixSha256) failures.push('frozen_fixture_classification_matrix_hash_mismatch');
  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length !== 25 || reference.fixtures?.length !== 25 || browser.fixtures?.length !== 25) failures.push('25_fixture_cardinality_mismatch');
}

function compareAll(reference, browser, manifest, fixtureMatrix, options = {}) {
  const failures = [];
  const numericRows = [];
  const refs = mapById(reference.fixtures, 'reference', failures);
  const apps = mapById(browser.fixtures, 'application', failures);
  const specs = new Map(manifest.fixtures.map(spec => [spec.id, spec]));
  const fixtureIntegrity = readJson(fixtureIntegrityPath);
  for (const spec of manifest.fixtures) {
    const pin = fixtureIntegrity.fixtures.find(item => item.id === spec.id);
    const referenceFixture = refs.get(spec.id);
    const appFixture = apps.get(spec.id);
    if (!pin || !referenceFixture || !appFixture || referenceFixture.fixture_sha256?.csv !== pin.csv_sha256 ||
        referenceFixture.fixture_sha256?.config !== pin.config_sha256 || appFixture.input_evidence?.csv_sha256 !== pin.csv_sha256 ||
        appFixture.input_evidence?.config_sha256 !== pin.config_sha256) failures.push(`frozen_fixture_input_hash_mismatch:${spec.id}`);
  }
  pushExact(failures, 'manifest_ids', [...specs.keys()].sort(), [...refs.keys()].sort());
  pushExact(failures, 'worker_result_ids', [...specs.keys()].sort(), [...apps.keys()].sort());
  const rows = [];
  for (const spec of manifest.fixtures) {
    const ref = refs.get(spec.id);
    const app = apps.get(spec.id);
    if (!ref || !app) continue;
    if (ref.manifest_expected_status !== spec.expected_status) failures.push(`${spec.id}:native manifest expected classification differs`);
    rows.push(compareFixture(ref, app, spec, failures, numericRows, fixtureMatrix, reference.tolerances));
  }
  if (!options.skipIntegrity) integrityFailures(reference, options.referenceBytes, options.sidecar, browser, manifest, failures);
  if (browser.network_privacy?.monitoring_status !== 'MEASURED') failures.push('network_privacy_monitoring_unmeasured');
  if (browser.network_privacy?.nominal_unauthorized_count !== 0) failures.push('nominal_network_privacy_gate_failed_or_unmeasured');
  if (!browser.network_privacy?.unauthorized_egress_positive_control?.requestDetected ||
      browser.network_privacy?.unauthorized_egress_positive_control?.pageRequestPermitted !== true ||
      browser.network_privacy?.unauthorized_egress_positive_control?.bodyPresenceObserved !== true ||
      browser.network_privacy?.unauthorized_egress_positive_control?.pageMonitorGatePassesWhenPermitted !== false) failures.push('page_network_positive_control_not_falsifiable');
  if (browser.network_privacy?.unauthorized_egress_positive_control?.workerRequestMonitoring !== 'MEASURED' ||
      browser.network_privacy?.unauthorized_egress_positive_control?.workerRequestDetected !== true ||
      browser.network_privacy?.unauthorized_egress_positive_control?.workerRequestPermitted !== true ||
      browser.network_privacy?.unauthorized_egress_positive_control?.workerBodyPresenceObserved !== true ||
      browser.network_privacy?.unauthorized_egress_positive_control?.workerMonitorGatePassesWhenPermitted !== false) {
    failures.push('worker_network_positive_control_unmeasured_or_non_falsifiable');
  }
  if (browser.network_privacy?.websocket !== 'UNMEASURED' || browser.network_privacy?.webtransport !== 'UNMEASURED') failures.push('unmeasured_channels_must_remain_unmeasured');
  return { failures, numericRows, fixtures: rows };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function expectNegative(name, mutate, baseline, inputs, failures) {
  try {
    const altered = mutate(clone(inputs.reference), clone(inputs.browser), Buffer.from(inputs.referenceBytes));
    const result = compareAll(altered.reference, altered.browser, inputs.manifest, inputs.fixtureMatrix, {
      skipIntegrity: altered.skipIntegrity === true,
      referenceBytes: altered.referenceBytes,
      sidecar: inputs.sidecar
    });
    const baselineFailureSet = new Set(baseline.failures);
    const introducedFailures = result.failures.filter(failure => !baselineFailureSet.has(failure));
    if (!introducedFailures.length) failures.push(`negative_control_${name}:mutation_introduced_no_new_failure`);
    return { name, status: introducedFailures.length ? 'PASS' : 'FAIL', baseline_failure_count: baseline.failures.length,
      mutated_failure_count: result.failures.length, introduced_failure_count: introducedFailures.length,
      first_introduced_failure: introducedFailures[0] || null };
  } catch (error) {
    failures.push(`negative_control_${name}:control_setup_failed:${String(error.message || error)}`);
    return { name, status: 'FAIL', observed_failure_count: 0, first_failure: String(error.message || error) };
  }
}
function runNegativeControls(baseline, inputs) {
  const controls = [];
  const controlFailures = [];
  controls.push(expectNegative('fixture_omitted', (_ref, browser, referenceBytes) => {
    browser.fixtures.pop();
    return { reference: _ref, browser, referenceBytes };
  }, baseline, inputs, controlFailures));
  controls.push(expectNegative('fixture_duplicated', (_ref, browser, referenceBytes) => {
    browser.fixtures.push(clone(browser.fixtures[0]));
    return { reference: _ref, browser, referenceBytes };
  }, baseline, inputs, controlFailures));
  controls.push(expectNegative('covariate_omitted', (reference, browser) => {
    const target = browser.fixtures.find(item => item.id === 'fix_01_well_conditioned').envelope.payload;
    const index = target.balanceTable.findIndex(row => row.term !== 'distance');
    if (index < 0) throw new Error('No expected covariate row available for omission control');
    target.balanceTable.splice(index, 1);
    return { reference, browser, referenceBytes: inputs.referenceBytes, skipIntegrity: true };
  }, baseline, inputs, controlFailures));
  controls.push(expectNegative('unexpected_covariate', (reference, browser) => {
    const target = browser.fixtures.find(item => item.id === 'fix_01_well_conditioned').envelope.payload;
    target.balanceTable.push({ term: '__unexpected_covariate__', type: 'continuous' });
    return { reference, browser, referenceBytes: inputs.referenceBytes, skipIntegrity: true };
  }, baseline, inputs, controlFailures));
  controls.push(expectNegative('reference_replaced', (reference, browser) => { reference.evidence_class = 'WEBR_REFERENCE'; return { reference, browser, referenceBytes: Buffer.from(JSON.stringify(reference)) }; }, baseline, inputs, controlFailures));
  controls.push(expectNegative('reference_hash_mismatch', (reference, browser, bytes) => { bytes = Buffer.from(`${bytes.toString()}\n`); return { reference, browser, referenceBytes: bytes }; }, baseline, inputs, controlFailures));
  controls.push(expectNegative('native_R_version_changed', (reference, browser) => { reference.provenance.r_version = '4.5.0'; return { reference, browser, referenceBytes: Buffer.from(JSON.stringify(reference)) }; }, baseline, inputs, controlFailures));
  controls.push(expectNegative('package_version_changed', (reference, browser) => { reference.provenance.package_versions.MatchIt = '4.8.0'; return { reference, browser, referenceBytes: Buffer.from(JSON.stringify(reference)) }; }, baseline, inputs, controlFailures));
  controls.push(expectNegative('factor_reference_changed', (reference, browser) => {
    const f = reference.fixtures.find(item => item.id === 'fix_02_mixed_types');
    f.native_execution.factor_reference_and_contrasts.x_cat.reference_level = 'med';
    return { reference, browser, referenceBytes: Buffer.from(JSON.stringify(reference)), skipIntegrity: true };
  }, baseline, inputs, controlFailures));
  controls.push(expectNegative('matched_pair_identity_changed', (reference, browser) => {
    const altered = browser.fixtures.find(item => item.worker_message_type === 'ANALYSIS_COMPLETE');
    const result = altered.envelope.payload;
    result.matchMatrix.matchedControlIds[0] = '__tampered_pair__';
    return { reference, browser, referenceBytes: inputs.referenceBytes, skipIntegrity: true };
  }, baseline, inputs, controlFailures));
  controls.push(expectNegative('matching_weight_changed', (reference, browser) => {
    const target = browser.fixtures.find(item => item.worker_message_type === 'ANALYSIS_COMPLETE').envelope.payload;
    target.matchingWeights.weights[0] += 1;
    return { reference, browser, referenceBytes: inputs.referenceBytes, skipIntegrity: true };
  }, baseline, inputs, controlFailures));
  controls.push(expectNegative('coefficient_beyond_tolerance', (reference, browser) => {
    const target = browser.fixtures.find(item => item.worker_message_type === 'ANALYSIS_COMPLETE').envelope.payload;
    target.numericalDiagnostics.coefficientTable[0].estimate = Number(target.numericalDiagnostics.coefficientTable[0].estimate) + 0.05;
    return { reference, browser, referenceBytes: inputs.referenceBytes, skipIntegrity: true };
  }, baseline, inputs, controlFailures));
  controls.push(expectNegative('cobalt_balance_changed', (reference, browser) => {
    const target = browser.fixtures.find(item => item.worker_message_type === 'ANALYSIS_COMPLETE').envelope.payload;
    const row = target.balanceTable.find(item => typeof item.matchedSmd === 'number');
    row.matchedSmd += 0.05;
    return { reference, browser, referenceBytes: inputs.referenceBytes, skipIntegrity: true };
  }, baseline, inputs, controlFailures));
  controls.push(expectNegative('numeric_to_null_corruption', (reference, browser) => {
    const target = browser.fixtures.find(item => item.worker_message_type === 'ANALYSIS_COMPLETE').envelope.payload;
    const row = target.balanceTable.find(item => item.rawDifferenceUnadjusted === null);
    if (!row) throw new Error('No continuous raw-difference null exists for null-semantics control');
    row.rawDifferenceUnadjusted = 0;
    return { reference, browser, referenceBytes: inputs.referenceBytes, skipIntegrity: true };
  }, baseline, inputs, controlFailures));
  controls.push(expectNegative('expected_error_became_success', (reference, browser) => {
    const target = browser.fixtures.find(item => item.id === 'fix_19_missing_values');
    target.worker_message_type = 'ANALYSIS_COMPLETE';
    target.worker_error = null;
    target.envelope = { payload: {} };
    return { reference, browser, referenceBytes: inputs.referenceBytes, skipIntegrity: true };
  }, baseline, inputs, controlFailures));
  controls.push(expectNegative('publication_restriction_removed', (reference, browser) => {
    const applicationRestricted = browser.fixtures.find(item => item.envelope?.payload?.publicationStatus?.verdict === 'OUTPUT_GENERATION_RESTRICTED');
    if (!applicationRestricted) throw new Error('No restricted publication result available for falsification control');
    browser.fixtures.find(item => item.id === applicationRestricted.id).envelope.payload.publicationStatus.verdict = 'OUTPUT_READY';
    return { reference, browser, referenceBytes: inputs.referenceBytes, skipIntegrity: true };
  }, baseline, inputs, controlFailures));
  controls.push(expectNegative('direct_node_result_substitution', (reference, browser) => {
    browser.fixtures.find(item => item.worker_message_type === 'ANALYSIS_COMPLETE').execution_path = 'node-direct-adapter';
    return { reference, browser, referenceBytes: inputs.referenceBytes, skipIntegrity: true };
  }, baseline, inputs, controlFailures));
  controls.push(expectNegative('numeric_reference_value_changed', (reference, browser) => {
    const successId = browser.fixtures.find(item => item.worker_message_type === 'ANALYSIS_COMPLETE').id;
    const ref = reference.fixtures.find(item => item.id === successId);
    const value = Object.values(ref.native_execution.glm.coefficients)[0];
    value.estimate += 0.05;
    return { reference, browser, referenceBytes: inputs.referenceBytes, skipIntegrity: true };
  }, baseline, inputs, controlFailures));
  const failed = controls.filter(control => control.status !== 'PASS');
  if (failed.length) controlFailures.push(`negative_controls_failed:${failed.map(item => item.name).join(',')}`);
  return { status: failed.length ? 'FAIL' : 'PASS', count: controls.length, controls, failures: controlFailures };
}

function cli() {
  const args = process.argv.slice(2);
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--reference', '--sidecar', '--browser', '--output'].includes(args[i]) || !args[i + 1]) fail('Usage: node compare_closure.mjs --reference candidate.json --sidecar integrity.json --browser production-worker.json --output new-comparison.json');
    values[args[i].slice(2)] = path.resolve(args[i + 1]);
  }
  for (const key of ['reference', 'sidecar', 'browser', 'output']) if (!values[key]) fail(`Missing --${key}`);
  if (fs.existsSync(values.output)) fail(`Refusing to overwrite comparison report: ${values.output}`);
  return values;
}

try {
  const args = cli();
  const referenceBytes = fs.readFileSync(args.reference);
  const reference = JSON.parse(referenceBytes.toString('utf8'));
  const sidecar = readJson(args.sidecar);
  const browser = readJson(args.browser);
  const manifest = readJson(manifestPath);
  const fixtureMatrix = readJson(fixtureMatrixPath);
  const input = { reference, browser, sidecar, referenceBytes, manifest, fixtureMatrix };
  const baseline = compareAll(reference, browser, manifest, fixtureMatrix, { referenceBytes, sidecar });
  const negativeControls = runNegativeControls(baseline, input);
  const report = {
    schema_version: 1,
    evidence_class: 'NATIVE_R_VS_CHROMIUM_PRODUCTION_WORKER_COMPARISON',
    status: baseline.failures.length === 0 && negativeControls.status === 'PASS' ? 'PASS_PENDING_INDEPENDENT_RED_TEAM_ACCEPTANCE' : 'FAIL',
    commit_sha: process.env.GITHUB_SHA || reference.commit_sha,
    evidence_status: 'candidate oracle; not independently accepted or frozen',
    summary: {
      manifest_fixture_count: manifest.fixtures.length,
      compared_fixture_count: baseline.fixtures.length,
      passing_fixture_count: baseline.fixtures.filter(fixture => fixture.status === 'PASS').length,
      failing_fixture_count: baseline.fixtures.filter(fixture => fixture.status === 'FAIL').length,
      numerical_comparison_count: baseline.numericRows.length,
      numerical_pass_count: baseline.numericRows.filter(row => row.status === 'PASS').length,
      numerical_fail_count: baseline.numericRows.filter(row => row.status === 'FAIL').length,
      baseline_failure_count: baseline.failures.length,
      negative_control_count: negativeControls.count,
      negative_control_status: negativeControls.status
    },
    tolerance_policy: reference.tolerances,
    fixture_matrix_sha256: shaFile(fixtureMatrixPath),
    reference_sha256: sha(referenceBytes),
    browser_evidence_sha256: shaFile(args.browser),
    native_oracle_source_sha256: reference.provenance.oracle_source_sha256,
    runtime_channel: {
      page_cross_origin_isolated: browser.runtime.init.pageIsolation.crossOriginIsolated,
      worker_cross_origin_isolated: browser.runtime.init.crossOriginIsolated,
      shared_array_buffer_available: browser.runtime.init.sharedArrayBufferAvailable,
      selected_webr_channel: browser.runtime.init.channelType,
      nested_worker_request_observed: browser.runtime.nested_webr_worker_request_observed
    },
    csp: browser.runtime.csp_responses,
    privacy: {
      network_nominal_unauthorized_count: browser.network_privacy.nominal_unauthorized_count,
      network_route_observed_unauthorized_count: browser.network_privacy.route_observed_unauthorized_count,
      network_monitoring_status: browser.network_privacy.monitoring_status,
      nested_webr_worker_http_interception: browser.runtime.nested_webr_worker_network_interception_observed ? 'MEASURED' : 'UNMEASURED',
      unmeasured_network_channels: browser.network_privacy.unmeasured_channels,
      positive_control: browser.network_privacy.unauthorized_egress_positive_control,
      websocket: browser.network_privacy.websocket,
      webtransport: browser.network_privacy.webtransport,
      storage_after_all_fixtures: browser.storage_after_all_fixtures
    },
    fixtures: baseline.fixtures,
    warning_diagnostic_distinctions: baseline.fixtures.filter(fixture => fixture.warning_diagnostic_distinction)
      .map(fixture => ({ id: fixture.id, ...fixture.warning_diagnostic_distinction })),
    numeric_comparisons: baseline.numericRows,
    negative_controls: negativeControls,
    failures: baseline.failures
  };
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(`Fixtures passed: ${report.summary.passing_fixture_count}/${report.summary.compared_fixture_count}`);
  console.log(`Numeric fields passed: ${report.summary.numerical_pass_count}/${report.summary.numerical_comparison_count}`);
  console.log(`Negative controls: ${negativeControls.status} (${negativeControls.count})`);
  console.log(`Runtime channel: ${report.runtime_channel.selected_webr_channel}; COI=${report.runtime_channel.worker_cross_origin_isolated}; nested WebR Worker observed=${report.runtime_channel.nested_worker_request_observed}`);
  if (baseline.failures.length) console.error(`Gate failures:\n${baseline.failures.map(failure => `- ${failure}`).join('\n')}`);
  if (negativeControls.status !== 'PASS') console.error(JSON.stringify(negativeControls, null, 2));
  if (report.status === 'FAIL') process.exitCode = 1;
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
