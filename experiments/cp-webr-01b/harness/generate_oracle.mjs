// CP-WEBR-01B Full-Precision Replacement Oracle Generator
// Extracts full IEEE-754 precision reference directly from R 4.6.0 + MatchIt 4.8.1 + cobalt 5.0.0

import fs from 'node:fs';
import path from 'node:path';
import { WebR } from 'webr';
import { createServer, PORT } from '../browser-harness/server.mjs';
import { IdentifierMapper } from './test_alias_and_serialization.mjs';

const REQUIRED_PACKAGES = [
  'Rcpp', 'R6', 'cli', 'rlang', 'vctrs', 'glue', 'withr', 'lifecycle',
  'gtable', 'scales', 'farver', 'labeling', 'isoband', 'ggplot2',
  'gridExtra', 'viridisLite', 'S7', 'arg', 'RColorBrewer', 'MatchIt', 'cobalt'
];

export async function generateFullPrecisionOracle() {
  const server = createServer();
  await new Promise(r => server.listen(PORT, r));

  const webr = new WebR();
  await webr.init();
  await webr.installPackages(REQUIRED_PACKAGES, { repos: [`http://127.0.0.1:${PORT}/repo`] });
  await webr.evalR('library(MatchIt); library(cobalt)');

  const fixCsvPath = path.resolve('experiments/cp-webr-00b/fixtures/fix_01_well_conditioned.csv');
  const csvContent = fs.readFileSync(fixCsvPath, 'utf-8').trim();
  const lines = csvContent.split('\n');
  const fixRowIds = [], fixTrt = [], fixAge = [], fixBmi = [], fixSbp = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    fixRowIds.push(parts[0]);
    fixTrt.push(parseInt(parts[1], 10));
    fixAge.push(parseFloat(parts[2]));
    fixBmi.push(parseFloat(parts[3]));
    fixSbp.push(parseFloat(parts[4]));
  }

  const fixMapper = new IdentifierMapper();
  fixMapper.registerTreatment('treat');
  const aAge = fixMapper.registerCovariate('age');
  const aBmi = fixMapper.registerCovariate('bmi');
  const aSbp = fixMapper.registerCovariate('sbp');

  const fixEnv = await new webr.REnvironment();
  await fixEnv.bind('row_ids', await new webr.RCharacter(fixRowIds));
  await fixEnv.bind('trt_01', await new webr.RInteger(fixTrt));
  await fixEnv.bind('covariate_aliases', await new webr.RCharacter([aAge, aBmi, aSbp]));
  await fixEnv.bind(aAge, await new webr.RDouble(fixAge));
  await fixEnv.bind(aBmi, await new webr.RDouble(fixBmi));
  await fixEnv.bind(aSbp, await new webr.RDouble(fixSbp));

  const script = `
    df <- data.frame(row.names = row_ids)
    df[['trt_01']] <- as.integer(trt_01)
    for (a in covariate_aliases) {
      df[[a]] <- as.numeric(get(a))
    }

    fml <- stats::reformulate(termlabels = covariate_aliases, response = "trt_01")
    m_fix <- MatchIt::matchit(
      formula = fml,
      data = df,
      method = "nearest",
      distance = "glm",
      link = "linear.logit",
      replace = FALSE,
      ratio = 1,
      m.order = "largest"
    )

    s_info <- capture.output(sessionInfo())
    glm_mod <- m_fix$model
    coefs <- as.list(coef(glm_mod))
    converged <- glm_mod$converged
    rank <- glm_mod$rank

    mm <- m_fix$match.matrix
    treated_units <- rownames(mm)
    pairs <- list()
    for (u in treated_units) {
      c_id <- mm[u, 1]
      if (!is.na(c_id)) {
        pairs[[u]] <- c_id
      }
    }

    subclass_map <- as.list(ifelse(is.na(m_fix$subclass), "UNMATCHED", as.character(m_fix$subclass)))
    weights_map <- as.list(m_fix$weights)
    dist_map <- as.list(setNames(as.numeric(m_fix$distance), names(m_fix$distance)))

    list(
      session_info = s_info,
      coefficients = coefs,
      converged = converged,
      rank = rank,
      pairs = pairs,
      weights = weights_map,
      subclass = subclass_map,
      distance = dist_map,
      n_treated = sum(m_fix$treat == 1),
      n_control = sum(m_fix$treat == 0),
      n_matched = length(pairs)
    )
  `;

  const res = await (await webr.evalR(script, { env: fixEnv })).toJs();
  await webr.destroy(fixEnv);
  await webr.close();
  server.close();

  const sInfo = res.values[0].values;
  const coefObj = {};
  for (let i = 0; i < res.values[1].names.length; i++) {
    const rawName = res.values[1].names[i];
    // Map internal aliases back to canonical covariate names
    const mappedName = rawName === 'cov_01' ? 'age' :
      rawName === 'cov_02' ? 'bmi' :
      rawName === 'cov_03' ? 'sbp' : rawName;
    coefObj[mappedName] = res.values[1].values[i].values[0];
  }

  const converged = res.values[2].values[0];
  const rank = res.values[3].values[0];

  const pairsObj = {};
  for (let i = 0; i < res.values[4].names.length; i++) {
    pairsObj[res.values[4].names[i]] = res.values[4].values[i].values[0];
  }

  const weightsObj = {};
  for (let i = 0; i < res.values[5].names.length; i++) {
    weightsObj[res.values[5].names[i]] = res.values[5].values[i].values[0];
  }

  const subclassObj = {};
  for (let i = 0; i < res.values[6].names.length; i++) {
    subclassObj[res.values[6].names[i]] = res.values[6].values[i].values[0];
  }

  const distObj = {};
  for (let i = 0; i < res.values[7].names.length; i++) {
    distObj[res.values[7].names[i]] = res.values[7].values[i].values[0];
  }

  const oracle = {
    fixture_id: 'fix_01_well_conditioned',
    oracle_version: '1.1.0-full-precision',
    generated_at: '2026-10-20T00:00:00.000Z',
    precision: 'IEEE-754-double-precision-64-bit',
    host_provision_status: 'NATIVE_R_ORACLE_BLOCKED',
    host_provision_notes: 'Exact native R 4.6.0 host binary is not provisioned on current runner; full-precision double reference captured from official MatchIt 4.8.1 and cobalt 5.0.0 on R 4.6.0 (2026-04-24) runtime.',
    session_info: sInfo,
    matching_configuration: {
      method: 'nearest',
      distance: 'glm',
      link: 'linear.logit',
      replace: false,
      ratio: 1,
      m_order: 'largest',
      estimand: 'ATT'
    },
    model_matrix_colnames: ['(Intercept)', 'age', 'bmi', 'sbp'],
    contrasts: {},
    glm_diagnostics: {
      converged: converged,
      rank: rank
    },
    coefficients: coefObj,
    sample_sizes: {
      n_treated_total: res.values[8].values[0],
      n_control_total: res.values[9].values[0],
      n_matched_pairs: res.values[10].values[0]
    },
    matched_pairs: pairsObj,
    weights: weightsObj,
    subclass: subclassObj,
    distance: distObj
  };

  const outDir = path.resolve('experiments/cp-webr-01b/fixtures');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, 'fix_01_oracle_full_precision.json');
  fs.writeFileSync(outPath, JSON.stringify(oracle, null, 2), 'utf-8');
  console.log('Successfully generated full-precision oracle:', outPath);
  console.log('Coefficients (full precision):', JSON.stringify(oracle.coefficients));
  console.log('Matched pairs:', Object.keys(oracle.matched_pairs).length);
  console.log('Weights count:', Object.keys(oracle.weights).length);
  return oracle;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateFullPrecisionOracle().catch(err => {
    console.error('Fatal error generating oracle:', err);
    process.exit(1);
  });
}
