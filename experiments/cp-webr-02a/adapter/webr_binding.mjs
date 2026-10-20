// CP-WEBR-02A Safe WebR Parameter Binding & Object Construction
// Conforms to CP-WEBR-01 Production Architecture Section 4.3 & Errata B

export async function constructWebREnvironment(webR, dataset, symbolMapper) {
  const rowCount = dataset.rows.length;
  if (rowCount === 0) {
    throw new Error('Dataset must contain at least 1 row');
  }

  // 1. Check for Duplicate Unit IDs (Fail-Closed Policy)
  const seenIds = new Set();
  const rowIds = [];
  for (let i = 0; i < rowCount; i++) {
    const rawId = dataset.rows[i].id !== undefined && dataset.rows[i].id !== null ? String(dataset.rows[i].id) : String(i + 1);
    if (seenIds.has(rawId)) {
      const err = new Error(`DUPLICATE_UNIT_ID_REJECTED: Duplicate row identifier detected: "${rawId}"`);
      err.code = 'DUPLICATE_UNIT_ID_REJECTED';
      throw err;
    }
    seenIds.add(rawId);
    rowIds.push(rawId);
  }

  // 2. Validate Treatment Variable across ALL rows & check for missing values
  const trtAlias = symbolMapper.getAlias(dataset.treatmentVariable);
  if (!trtAlias) {
    throw new Error(`Treatment variable not registered in symbol mapper: "${dataset.treatmentVariable}"`);
  }

  const trtList = [];
  const missingTreatmentRows = [];
  for (let i = 0; i < rowCount; i++) {
    const val = dataset.rows[i][dataset.treatmentVariable];
    if (val === null || val === undefined || val === '' || val === 'NA' || (typeof val === 'number' && isNaN(val))) {
      missingTreatmentRows.push(rowIds[i]);
      continue;
    }
    const num = Number(val);
    if (num !== 0 && num !== 1) {
      throw new Error(`Non-binary treatment value "${val}" at row ${i + 1}`);
    }
    trtList.push(num);
  }

  if (missingTreatmentRows.length > 0) {
    const err = new Error(`MISSING_DATA_REJECTED: Missing value detected in treatment column "${dataset.treatmentVariable}" at rows: [${missingTreatmentRows.join(', ')}]`);
    err.code = 'MISSING_TREATMENT';
    throw err;
  }

  // 3. Create isolated child environment inheriting from globalenv()
  const globalEnv = await webR.evalR('globalenv()');
  const analysisEnv = await new webR.REnvironment(globalEnv);

  const rRowIds = await new webR.RCharacter(rowIds);
  const rTrt = await new webR.RInteger(trtList);
  await analysisEnv.bind('row_ids', rRowIds);
  await analysisEnv.bind(trtAlias, rTrt);

  const rProxies = [rRowIds, rTrt];
  const covAliases = [];
  const factorMetadata = {};

  // 4. Validate and Bind Each Covariate Vector across ALL rows
  for (const covHeader of dataset.covariates) {
    const covAlias = symbolMapper.getAlias(covHeader);
    if (!covAlias) {
      throw new Error(`Covariate not registered in symbol mapper: "${covHeader}"`);
    }
    covAliases.push(covAlias);

    const covDef = dataset.covariateDefinitions?.[covHeader];

    // Inspect ALL rows to determine type
    let isNumeric = covDef?.inferredType === 'continuous';
    if (!covDef || covDef.inferredType !== 'continuous') {
      let nonNumericFound = false;
      for (let i = 0; i < rowCount; i++) {
        const v = dataset.rows[i][covHeader];
        // Skip missing indicators when probing data type
        if (v === null || v === undefined || v === 'NA' || (typeof v === 'number' && isNaN(v))) {
          continue;
        }
        if (typeof v !== 'number' && isNaN(Number(v))) {
          nonNumericFound = true;
        }
      }
      isNumeric = !nonNumericFound && (covDef?.inferredType !== 'categorical');
    }

    // Inspect ALL rows for missingness according to type
    let hasMissing = false;
    const missingCovRows = [];
    for (let i = 0; i < rowCount; i++) {
      const v = dataset.rows[i][covHeader];
      let isMissing = (v === null || v === undefined || v === 'NA' || (typeof v === 'number' && isNaN(v)));
      if (!isMissing && isNumeric && (v === '' || (typeof v === 'string' && v.trim() === ''))) {
        isMissing = true;
      }
      if (isMissing) {
        hasMissing = true;
        missingCovRows.push(rowIds[i]);
      }
    }

    if (hasMissing) {
      const err = new Error(`MISSING_DATA_REJECTED: Missing values detected in covariate "${covHeader}" at rows: [${missingCovRows.join(', ')}]`);
      err.code = 'MISSING_COVARIATE';
      throw err;
    }

    if (isNumeric) {
      const numList = [];
      for (let i = 0; i < rowCount; i++) {
        const val = dataset.rows[i][covHeader];
        numList.push(Number(val));
      }
      const rDouble = await new webR.RDouble(numList);
      await analysisEnv.bind(covAlias, rDouble);
      rProxies.push(rDouble);
    } else {
      // Categorical factor: preserve levels and reference categories
      const strArray = [];
      const distinctSet = new Set();
      for (let i = 0; i < rowCount; i++) {
        const val = dataset.rows[i][covHeader];
        const strVal = String(val);
        strArray.push(strVal);
        distinctSet.add(strVal);
      }

      // Establish factor levels: either from definition or sorted unique values
      const levels = covDef?.levels && covDef.levels.length > 0
        ? covDef.levels
        : Array.from(distinctSet).sort();

      const refLevel = covDef?.referenceLevel && levels.includes(covDef.referenceLevel)
        ? covDef.referenceLevel
        : levels[0];

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

  // 5. Bind configuration metadata
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
