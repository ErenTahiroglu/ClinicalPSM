// CP-WEBR-02A Safe WebR Parameter Binding & Object Construction
// Conforms to CP-WEBR-01 Production Architecture Section 4.3 & Errata B & R1.1 Requirements

const ALLOWED_OPTION_KEYS = new Set([
  'method',
  'distanceMetric',
  'ratio',
  'replace',
  'matchingOrder',
  'caliper',
  'stdCaliper',
  'discard',
  'missingDataPolicy'
]);

/**
 * Validates scientific options against strict allowed schema
 */
export function validateOptions(options) {
  if (!options) return {};

  for (const key of Object.keys(options)) {
    if (!ALLOWED_OPTION_KEYS.has(key)) {
      const err = new Error(`UNKNOWN_OPTION_REJECTED: Unrecognized matching option: "${key}"`);
      err.code = 'UNKNOWN_OPTION_REJECTED';
      throw err;
    }
  }

  if (options.method !== undefined && options.method !== 'nearest') {
    const err = new Error(`INVALID_OPTION: method must be 'nearest', got "${options.method}"`);
    err.code = 'INVALID_OPTION';
    throw err;
  }

  if (options.distanceMetric !== undefined && !['linear.logit', 'logit'].includes(options.distanceMetric)) {
    const err = new Error(`INVALID_OPTION: distanceMetric must be 'linear.logit' or 'logit', got "${options.distanceMetric}"`);
    err.code = 'INVALID_OPTION';
    throw err;
  }

  if (options.ratio !== undefined && options.ratio !== 1) {
    const err = new Error(`INVALID_OPTION: ratio must be 1, got "${options.ratio}"`);
    err.code = 'INVALID_OPTION';
    throw err;
  }

  if (options.replace !== undefined && options.replace !== false) {
    const err = new Error(`INVALID_OPTION: replace must be false, got "${options.replace}"`);
    err.code = 'INVALID_OPTION';
    throw err;
  }

  if (options.matchingOrder !== undefined && options.matchingOrder !== 'largest') {
    const err = new Error(`INVALID_OPTION: matchingOrder must be 'largest', got "${options.matchingOrder}"`);
    err.code = 'INVALID_OPTION';
    throw err;
  }

  if (options.caliper !== undefined && options.caliper !== null) {
    if (typeof options.caliper !== 'number' || !Number.isFinite(options.caliper) || options.caliper < 0) {
      const err = new Error(`INVALID_OPTION: caliper must be non-negative finite number or null, got "${options.caliper}"`);
      err.code = 'INVALID_OPTION';
      throw err;
    }
  }

  if (options.stdCaliper !== undefined && typeof options.stdCaliper !== 'boolean') {
    const err = new Error(`INVALID_OPTION: stdCaliper must be boolean, got ${typeof options.stdCaliper}`);
    err.code = 'INVALID_OPTION';
    throw err;
  }

  if (options.discard !== undefined && !['none', 'both', 'hull', 'control', 'treat'].includes(options.discard)) {
    const err = new Error(`INVALID_OPTION: discard must be one of none, both, hull, control, treat, got "${options.discard}"`);
    err.code = 'INVALID_OPTION';
    throw err;
  }

  return options;
}

export async function constructWebREnvironment(webR, dataset, symbolMapper) {
  const rowCount = dataset.rows?.length || 0;
  if (rowCount === 0) {
    throw new Error('Dataset must contain at least 1 row');
  }

  // 1. Strict Option Validation
  validateOptions(dataset.options);

  // 2. Strict Row ID Validation: explicit, non-empty, unique (NO fallback generation)
  const seenIds = new Set();
  const rowIds = [];
  for (let i = 0; i < rowCount; i++) {
    const row = dataset.rows[i];
    if (row.id === undefined || row.id === null) {
      const err = new Error(`MISSING_ROW_ID: Row ${i + 1} missing required explicit identifier "id"`);
      err.code = 'MISSING_ROW_ID';
      throw err;
    }
    const rawId = String(row.id).trim();
    if (rawId.length === 0) {
      const err = new Error(`MISSING_ROW_ID: Row ${i + 1} has blank identifier`);
      err.code = 'MISSING_ROW_ID';
      throw err;
    }
    if (seenIds.has(rawId)) {
      const err = new Error(`DUPLICATE_UNIT_ID_REJECTED: Duplicate row identifier detected: "${rawId}"`);
      err.code = 'DUPLICATE_UNIT_ID_REJECTED';
      throw err;
    }
    seenIds.add(rawId);
    rowIds.push(rawId);
  }

  // 3. Treatment Variable Registration & Validation
  if (!dataset.treatmentVariable) {
    throw new Error('Treatment variable name must be specified');
  }
  const trtAlias = symbolMapper.registerTreatment(dataset.treatmentVariable);

  const trtList = [];
  const missingTreatmentRows = [];
  for (let i = 0; i < rowCount; i++) {
    const val = dataset.rows[i][dataset.treatmentVariable];
    if (val === null || val === undefined || val === '' || val === 'NA' || (typeof val === 'string' && val.trim() === '') || (typeof val === 'number' && isNaN(val))) {
      missingTreatmentRows.push(rowIds[i]);
      continue;
    }
    const num = Number(val);
    if (num !== 0 && num !== 1) {
      const err = new Error(`Non-binary treatment value "${val}" at row ${i + 1}`);
      err.code = 'INVALID_TREATMENT_VALUE';
      throw err;
    }
    trtList.push(num);
  }

  if (missingTreatmentRows.length > 0) {
    const err = new Error(`MISSING_DATA_REJECTED: Missing value detected in treatment column "${dataset.treatmentVariable}" at rows: [${missingTreatmentRows.join(', ')}]`);
    err.code = 'MISSING_TREATMENT';
    throw err;
  }

  // 4. Covariates Array Validation & Normalization
  if (!Array.isArray(dataset.covariates) || dataset.covariates.length === 0) {
    throw new Error('At least one covariate must be selected');
  }

  const covHeaders = [];
  const definitions = { ...(dataset.covariateDefinitions || {}) };

  for (const item of dataset.covariates) {
    if (typeof item === 'string') {
      covHeaders.push(item);
    } else if (item && typeof item === 'object' && typeof item.name === 'string') {
      covHeaders.push(item.name);
      if (!definitions[item.name]) {
        definitions[item.name] = item;
      }
    } else {
      throw new Error(`Invalid covariate specification: expected string or object with name, got ${typeof item}`);
    }
  }

  const seenCovs = new Set();
  for (const covHeader of covHeaders) {
    if (seenCovs.has(covHeader)) {
      const err = new Error(`REPEATED_COVARIATE_REJECTED: Duplicate covariate selected: "${covHeader}"`);
      err.code = 'REPEATED_COVARIATE_REJECTED';
      throw err;
    }
    seenCovs.add(covHeader);
  }

  // 5. Create isolated child environment
  const globalEnv = await webR.evalR('globalenv()');
  const analysisEnv = await new webR.REnvironment(globalEnv);

  const rRowIds = await new webR.RCharacter(rowIds);
  const rTrt = await new webR.RInteger(trtList);
  await analysisEnv.bind('row_ids', rRowIds);
  await analysisEnv.bind(trtAlias, rTrt);

  const rProxies = [rRowIds, rTrt];
  const covAliases = [];
  const factorMetadata = {};

  // 6. Validate and Bind Each Covariate Vector across ALL rows
  for (const covHeader of covHeaders) {
    const covAlias = symbolMapper.registerCovariate(covHeader);
    covAliases.push(covAlias);

    const covDef = definitions[covHeader];
    if (!covDef || !covDef.inferredType) {
      const err = new Error(`EXPLICIT_COVARIATE_TYPE_REQUIRED: Missing explicit covariate definition for "${covHeader}"`);
      err.code = 'EXPLICIT_COVARIATE_TYPE_REQUIRED';
      throw err;
    }

    const covType = covDef.inferredType;
    if (!['continuous', 'binary', 'categorical'].includes(covType)) {
      const err = new Error(`INVALID_COVARIATE_TYPE: Covariate "${covHeader}" has invalid type "${covType}"`);
      err.code = 'INVALID_COVARIATE_TYPE';
      throw err;
    }

    if (covType === 'continuous') {
      const numList = [];
      const missingCovRows = [];
      for (let i = 0; i < rowCount; i++) {
        const v = dataset.rows[i][covHeader];
        const isMissing = (v === null || v === undefined || v === '' || v === 'NA' || (typeof v === 'string' && v.trim() === ''));
        if (isMissing) {
          missingCovRows.push(rowIds[i]);
          continue;
        }
        const num = Number(v);
        if (typeof v === 'number' && !Number.isFinite(v)) {
          const err = new Error(`NON_FINITE_NUMERIC_REJECTED: Non-finite numeric value in covariate "${covHeader}" at row ${rowIds[i]}`);
          err.code = 'NON_FINITE_NUMERIC_REJECTED';
          throw err;
        }
        if (isNaN(num) || !Number.isFinite(num)) {
          const err = new Error(`MALFORMED_NUMERIC_REJECTED: Malformed numeric value "${v}" in covariate "${covHeader}" at row ${rowIds[i]}`);
          err.code = 'MALFORMED_NUMERIC_REJECTED';
          throw err;
        }
        numList.push(num);
      }

      if (missingCovRows.length > 0) {
        const err = new Error(`MISSING_DATA_REJECTED: Missing values detected in covariate "${covHeader}" at rows: [${missingCovRows.join(', ')}]`);
        err.code = 'MISSING_COVARIATE';
        throw err;
      }

      const rDouble = await new webR.RDouble(numList);
      await analysisEnv.bind(covAlias, rDouble);
      rProxies.push(rDouble);

    } else if (covType === 'binary') {
      const binList = [];
      const missingCovRows = [];
      for (let i = 0; i < rowCount; i++) {
        const v = dataset.rows[i][covHeader];
        const isMissing = (v === null || v === undefined || v === '' || v === 'NA' || (typeof v === 'string' && v.trim() === ''));
        if (isMissing) {
          missingCovRows.push(rowIds[i]);
          continue;
        }
        const num = Number(v);
        if (num !== 0 && num !== 1) {
          const err = new Error(`INVALID_BINARY_VALUE: Non-binary value "${v}" in binary covariate "${covHeader}" at row ${rowIds[i]}`);
          err.code = 'INVALID_BINARY_VALUE';
          throw err;
        }
        binList.push(num);
      }

      if (missingCovRows.length > 0) {
        const err = new Error(`MISSING_DATA_REJECTED: Missing values detected in covariate "${covHeader}" at rows: [${missingCovRows.join(', ')}]`);
        err.code = 'MISSING_COVARIATE';
        throw err;
      }

      const rDouble = await new webR.RDouble(binList);
      await analysisEnv.bind(covAlias, rDouble);
      rProxies.push(rDouble);

    } else {
      // Categorical factor
      const levels = covDef.levels;
      if (!Array.isArray(levels) || levels.length < 2) {
        const err = new Error(`INVALID_FACTOR_LEVELS: Categorical covariate "${covHeader}" must declare at least 2 levels`);
        err.code = 'INVALID_FACTOR_LEVELS';
        throw err;
      }

      for (const lvl of levels) {
        if (typeof lvl !== 'string' || lvl.trim().length === 0) {
          const err = new Error(`BLANK_FACTOR_LEVEL_REJECTED: Blank or whitespace-only factor level in covariate "${covHeader}"`);
          err.code = 'BLANK_FACTOR_LEVEL_REJECTED';
          throw err;
        }
      }

      const refLevel = covDef.referenceLevel;
      if (!refLevel || typeof refLevel !== 'string' || refLevel.trim().length === 0) {
        const err = new Error(`REFERENCE_LEVEL_REQUIRED: Missing referenceLevel for categorical covariate "${covHeader}"`);
        err.code = 'REFERENCE_LEVEL_REQUIRED';
        throw err;
      }
      if (!levels.includes(refLevel)) {
        const err = new Error(`UNKNOWN_REFERENCE_CATEGORY_REJECTED: Reference level "${refLevel}" not found in declared levels [${levels.join(', ')}] for covariate "${covHeader}"`);
        err.code = 'UNKNOWN_REFERENCE_CATEGORY_REJECTED';
        throw err;
      }

      const strArray = [];
      const missingCovRows = [];
      for (let i = 0; i < rowCount; i++) {
        const v = dataset.rows[i][covHeader];
        const isMissing = (v === null || v === undefined || v === '' || (typeof v === 'string' && (v.trim() === '' || v === 'NA')));
        if (isMissing) {
          missingCovRows.push(rowIds[i]);
          continue;
        }
        const strVal = String(v);
        if (!levels.includes(strVal)) {
          const err = new Error(`UNLISTED_FACTOR_OBSERVATION_REJECTED: Value "${strVal}" at row ${rowIds[i]} is not listed in declared levels [${levels.join(', ')}] for covariate "${covHeader}"`);
          err.code = 'UNLISTED_FACTOR_OBSERVATION_REJECTED';
          throw err;
        }
        strArray.push(strVal);
      }

      if (missingCovRows.length > 0) {
        const err = new Error(`MISSING_DATA_REJECTED: Missing values detected in categorical covariate "${covHeader}" at rows: [${missingCovRows.join(', ')}]`);
        err.code = 'MISSING_COVARIATE';
        throw err;
      }

      factorMetadata[covAlias] = {
        originalHeader: covHeader,
        internalAlias: covAlias,
        displayName: covHeader,
        inferredType: 'categorical',
        levels,
        referenceLevel: refLevel,
        droppedLevel: null
      };

      const rChar = await new webR.RCharacter(strArray);
      const rLevels = await new webR.RCharacter(levels);
      const rRef = await new webR.RCharacter([refLevel]);

      await analysisEnv.bind(`${covAlias}_raw`, rChar);
      await analysisEnv.bind(`${covAlias}_levels`, rLevels);
      await analysisEnv.bind(`${covAlias}_ref`, rRef);

      rProxies.push(rChar, rLevels, rRef);
    }
  }

  // 7. Bind configuration metadata
  const rTrtName = await new webR.RCharacter([trtAlias]);
  const rCovNames = await new webR.RCharacter(covAliases);
  const catAliases = Object.keys(factorMetadata);
  const rCatCovs = await new webR.RCharacter(catAliases);
  await analysisEnv.bind('target_trt_name', rTrtName);
  await analysisEnv.bind('target_cov_names', rCovNames);
  await analysisEnv.bind('target_categorical_covs', rCatCovs);

  const caliperVal = dataset.options?.caliper ?? null;
  const stdCaliper = dataset.options?.stdCaliper ?? true;
  const discardOpt = dataset.options?.discard || 'none';
  const linkOpt = dataset.options?.distanceMetric === 'logit' ? 'logit' : 'linear.logit';

  if (caliperVal !== null && caliperVal !== undefined) {
    const rCaliper = await new webR.RDouble([caliperVal]);
    await analysisEnv.bind('target_caliper_val', rCaliper);
    rProxies.push(rCaliper);
  } else {
    await webR.evalR('target_caliper_val <- NULL', { env: analysisEnv });
  }

  const rStdCaliper = await new webR.RLogical([stdCaliper]);
  const rDiscard = await new webR.RCharacter([discardOpt]);
  const rLink = await new webR.RCharacter([linkOpt]);

  await analysisEnv.bind('target_std_caliper', rStdCaliper);
  await analysisEnv.bind('target_discard_opt', rDiscard);
  await analysisEnv.bind('target_link_opt', rLink);

  rProxies.push(rTrtName, rCovNames, rCatCovs, rStdCaliper, rDiscard, rLink);

  return {
    analysisEnv,
    trtAlias,
    covAliases,
    factorMetadata,
    rProxies
  };
}
