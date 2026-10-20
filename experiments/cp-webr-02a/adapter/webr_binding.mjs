// CP-WEBR-02A Safe WebR Parameter Binding & Object Construction
// Conforms to CP-WEBR-01 Production Architecture Section 4.3 & Errata B

export async function constructWebREnvironment(webR, dataset, symbolMapper) {
  const rowCount = dataset.rows.length;
  if (rowCount === 0) {
    throw new Error('Dataset must contain at least 1 row');
  }

  // 1. Create an isolated child environment inheriting from globalenv()
  const globalEnv = await webR.evalR('globalenv()');
  const analysisEnv = await new webR.REnvironment(globalEnv);

  // 2. Prepare row IDs & treatment vector (webR.RInteger takes standard number[])
  const trtAlias = symbolMapper.getAlias(dataset.treatmentVariable);
  if (!trtAlias) {
    throw new Error(`Treatment variable not registered in symbol mapper: "${dataset.treatmentVariable}"`);
  }

  const rowIds = [];
  const trtList = [];
  for (let i = 0; i < rowCount; i++) {
    const rowId = dataset.rows[i].id !== undefined && dataset.rows[i].id !== null ? String(dataset.rows[i].id) : String(i + 1);
    rowIds.push(rowId);
    const val = dataset.rows[i][dataset.treatmentVariable];
    if (val === null || val === undefined || val === '') {
      throw new Error(`Missing value detected in treatment column at row ${i + 1}`);
    }
    const num = Number(val);
    if (num !== 0 && num !== 1) {
      throw new Error(`Non-binary treatment value "${val}" at row ${i + 1}`);
    }
    trtList.push(num);
  }

  const rRowIds = await new webR.RCharacter(rowIds);
  const rTrt = await new webR.RInteger(trtList);
  await analysisEnv.bind('row_ids', rRowIds);
  await analysisEnv.bind(trtAlias, rTrt);

  // 3. Prepare each covariate vector
  const covAliases = [];
  const rProxies = [rRowIds, rTrt];

  for (const covHeader of dataset.covariates) {
    const covAlias = symbolMapper.getAlias(covHeader);
    if (!covAlias) {
      throw new Error(`Covariate not registered in symbol mapper: "${covHeader}"`);
    }
    covAliases.push(covAlias);

    // Determine type: check sample values
    let isNumeric = true;
    for (let i = 0; i < Math.min(rowCount, 20); i++) {
      const v = dataset.rows[i][covHeader];
      if (v !== null && v !== undefined && v !== '' && typeof v !== 'number' && isNaN(Number(v))) {
        isNumeric = false;
        break;
      }
    }

    if (isNumeric) {
      const numList = [];
      for (let i = 0; i < rowCount; i++) {
        const val = dataset.rows[i][covHeader];
        numList.push((val === null || val === undefined || val === '') ? NaN : Number(val));
      }
      const rDouble = await new webR.RDouble(numList);
      await analysisEnv.bind(covAlias, rDouble);
      rProxies.push(rDouble);
    } else {
      const strArray = [];
      for (let i = 0; i < rowCount; i++) {
        const val = dataset.rows[i][covHeader];
        strArray.push((val === null || val === undefined) ? '' : String(val));
      }
      const rChar = await new webR.RCharacter(strArray);
      // Bind as raw character and factorize in R
      const rawAlias = `${covAlias}_raw`;
      await analysisEnv.bind(rawAlias, rChar);
      rProxies.push(rChar);
    }
  }

  // 4. Bind configuration metadata
  const rTrtName = await new webR.RCharacter([trtAlias]);
  const rCovNames = await new webR.RCharacter(covAliases);
  await analysisEnv.bind('target_trt_name', rTrtName);
  await analysisEnv.bind('target_cov_names', rCovNames);

  const caliperVal = dataset.options?.caliper ?? null;
  const stdCaliper = dataset.options?.stdCaliper ?? true;

  if (caliperVal !== null && caliperVal !== undefined) {
    const rCaliper = await new webR.RDouble([caliperVal]);
    await analysisEnv.bind('target_caliper_val', rCaliper);
    rProxies.push(rCaliper);
  } else {
    await webR.evalR('target_caliper_val <- NULL', { env: analysisEnv });
  }

  const rStdCaliper = await new webR.RLogical([stdCaliper]);
  await analysisEnv.bind('target_std_caliper', rStdCaliper);

  rProxies.push(rTrtName, rCovNames, rStdCaliper);

  return {
    analysisEnv,
    trtAlias,
    covAliases,
    rProxies
  };
}
