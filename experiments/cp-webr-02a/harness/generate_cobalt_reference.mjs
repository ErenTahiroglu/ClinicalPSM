// CP-WEBR-02A R1.2a-E1 Authoritative Cobalt Reference Generator & Reproducibility Verifier
// Directly evaluates MatchIt 4.8.1 and cobalt 5.0.0 on R 4.6.0 (via official WebR)
// Constructs independent R-side models and balance diagnostics WITHOUT adapter or template layers

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebR } from 'webr';
import { createServer } from '../browser-harness/server.mjs';

const REFERENCE_PORT = 8896;
const PINNED_REF_PATH = path.resolve('experiments/cp-webr-02a/r1.2a/COBALT-NUMERICAL-REFERENCE.json');
const AUDIT_PATH = path.resolve('experiments/cp-webr-02a/r1.2a/COBALT-REFERENCE-REPRODUCIBILITY-AUDIT.json');

const FIX_01_CSV_PATH = path.resolve('experiments/cp-webr-02a/fixtures/fix_01_well_conditioned.csv');
const FIX_02_CSV_PATH = path.resolve('experiments/cp-webr-02a/fixtures/fix_02_mixed_types.csv');

function computeFileSha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function runCobaltReferenceGeneration(options = {}) {
  const shouldOverwrite = options.overwrite === true || process.argv.includes('--overwrite');
  console.log('===============================================================');
  console.log('CP-WEBR-02A R1.2a-E1 Authoritative Cobalt Reference Generator');
  console.log('Direct Independent R Evaluation (MatchIt 4.8.1, cobalt 5.0.0)');
  console.log('===============================================================\n');

  // 1. Hash generator script and fixture inputs
  const scriptPath = path.resolve('experiments/cp-webr-02a/harness/generate_cobalt_reference.mjs');
  const scriptSha256 = fs.existsSync(scriptPath) ? computeFileSha256(scriptPath) : 'UNKNOWN_SCRIPT_HASH';
  const fix01Sha256 = computeFileSha256(FIX_01_CSV_PATH);
  const fix02Sha256 = computeFileSha256(FIX_02_CSV_PATH);

  console.log(`Generator Script SHA-256: ${scriptSha256}`);
  console.log(`Fixture fix_01 CSV SHA-256: ${fix01Sha256}`);
  console.log(`Fixture fix_02 CSV SHA-256: ${fix02Sha256}\n`);

  // 2. Start qualification package server
  const server = createServer();
  await new Promise(resolve => server.listen(REFERENCE_PORT, resolve));
  console.log(`Qualification server listening on port ${REFERENCE_PORT}`);

  // 3. Initialize WebR
  const webR = new WebR();
  await webR.init();
  console.log('WebR runtime initialized (R 4.6.0)');

  const REQUIRED_PACKAGES = [
    'Rcpp', 'R6', 'cli', 'rlang', 'vctrs', 'glue', 'withr', 'lifecycle',
    'gtable', 'scales', 'farver', 'labeling', 'isoband', 'ggplot2',
    'gridExtra', 'viridisLite', 'S7', 'arg', 'RColorBrewer', 'MatchIt', 'cobalt'
  ];
  await webR.installPackages(REQUIRED_PACKAGES, { repos: [`http://127.0.0.1:${REFERENCE_PORT}/repo`] });
  console.log('MatchIt 4.8.1 and cobalt 5.0.0 installed successfully\n');

  const generatedFixtures = {};

  // 4. Evaluate fix_01_well_conditioned directly in R
  console.log('Generating independent reference for fix_01_well_conditioned...');
  const csv1Text = fs.readFileSync(FIX_01_CSV_PATH, 'utf-8');
  await webR.FS.writeFile('/gen_fix_01.csv', new TextEncoder().encode(csv1Text));

  const rCodeFix01 = `
library(MatchIt)
library(cobalt)
df1 <- read.csv('/gen_fix_01.csv')
m1 <- matchit(treat ~ age + bmi + sbp, data = df1, method = 'nearest', distance = 'glm', link = 'linear.logit', replace = FALSE, m.order = 'largest', ratio = 1)
b1_std <- bal.tab(m1, s.d.denom = 'treated', binary = 'std', un = TRUE)[['Balance']]
b1_raw <- bal.tab(m1, s.d.denom = 'treated', binary = 'raw', un = TRUE)[['Balance']]

covs1 <- c('age', 'bmi', 'sbp')
res1 <- list()
for (cov in covs1) {
  res1[[cov]] <- list(
    type = 'continuous',
    unadjusted_smd = as.numeric(b1_std[cov, ][['Diff.Un']]),
    matched_smd = as.numeric(b1_std[cov, ][['Diff.Adj']]),
    raw_diff_unadjusted = NULL,
    raw_diff_matched = NULL,
    unadjusted_variance_ratio = NULL,
    matched_variance_ratio = NULL
  )
}
res1
`;

  const shelter1 = await new webR.Shelter();
  const rawRes1 = await shelter1.captureR(rCodeFix01);
  const eval1 = await rawRes1.result.toJs();
  await shelter1.purge();

  generatedFixtures['fix_01_well_conditioned'] = {
    name: 'Well-conditioned logistic regression',
    covariates: {}
  };

  for (let i = 0; i < eval1.names.length; i++) {
    const covName = eval1.names[i];
    const valObj = eval1.values[i];
    const covData = {};
    for (let j = 0; j < valObj.names.length; j++) {
      const fieldName = valObj.names[j];
      const val = valObj.values[j].values ? valObj.values[j].values[0] : null;
      covData[fieldName] = (val !== null && val !== undefined) ? val : null;
    }
    generatedFixtures['fix_01_well_conditioned'].covariates[covName] = covData;
  }
  console.log('fix_01_well_conditioned reference generated successfully.');

  // 5. Evaluate fix_02_mixed_types directly in R
  console.log('Generating independent reference for fix_02_mixed_types...');
  const csv2Text = fs.readFileSync(FIX_02_CSV_PATH, 'utf-8');
  await webR.FS.writeFile('/gen_fix_02.csv', new TextEncoder().encode(csv2Text));

  const rCodeFix02 = `
df2 <- read.csv('/gen_fix_02.csv')
names(df2)[names(df2) == 'x_cat'] <- 'cov_02'
df2[['cov_02']] <- factor(df2[['cov_02']], levels = c('low', 'med', 'high'))
m2 <- matchit(treat ~ x_cont + x_bin + cov_02, data = df2, method = 'nearest', distance = 'glm', link = 'linear.logit', replace = FALSE, m.order = 'largest', ratio = 1)
b2_std <- bal.tab(m2, s.d.denom = 'treated', binary = 'std', un = TRUE)[['Balance']]
b2_raw <- bal.tab(m2, s.d.denom = 'treated', binary = 'raw', un = TRUE)[['Balance']]

res2 <- list(
  x_cont = list(
    type = 'continuous',
    unadjusted_smd = as.numeric(b2_std['x_cont', ][['Diff.Un']]),
    matched_smd = as.numeric(b2_std['x_cont', ][['Diff.Adj']]),
    raw_diff_unadjusted = NULL,
    raw_diff_matched = NULL,
    unadjusted_variance_ratio = NULL,
    matched_variance_ratio = NULL
  ),
  x_bin = list(
    type = 'binary',
    unadjusted_smd = as.numeric(b2_std['x_bin', ][['Diff.Un']]),
    matched_smd = as.numeric(b2_std['x_bin', ][['Diff.Adj']]),
    raw_diff_unadjusted = as.numeric(b2_raw['x_bin', ][['Diff.Un']]),
    raw_diff_matched = as.numeric(b2_raw['x_bin', ][['Diff.Adj']]),
    unadjusted_variance_ratio = NULL,
    matched_variance_ratio = NULL
  ),
  cov_02_low = list(
    type = 'binary',
    unadjusted_smd = as.numeric(b2_std['cov_02_low', ][['Diff.Un']]),
    matched_smd = as.numeric(b2_std['cov_02_low', ][['Diff.Adj']]),
    raw_diff_unadjusted = as.numeric(b2_raw['cov_02_low', ][['Diff.Un']]),
    raw_diff_matched = as.numeric(b2_raw['cov_02_low', ][['Diff.Adj']]),
    unadjusted_variance_ratio = NULL,
    matched_variance_ratio = NULL
  ),
  cov_02_med = list(
    type = 'binary',
    unadjusted_smd = as.numeric(b2_std['cov_02_med', ][['Diff.Un']]),
    matched_smd = as.numeric(b2_std['cov_02_med', ][['Diff.Adj']]),
    raw_diff_unadjusted = as.numeric(b2_raw['cov_02_med', ][['Diff.Un']]),
    raw_diff_matched = as.numeric(b2_raw['cov_02_med', ][['Diff.Adj']]),
    unadjusted_variance_ratio = NULL,
    matched_variance_ratio = NULL
  ),
  cov_02_high = list(
    type = 'binary',
    unadjusted_smd = as.numeric(b2_std['cov_02_high', ][['Diff.Un']]),
    matched_smd = as.numeric(b2_std['cov_02_high', ][['Diff.Adj']]),
    raw_diff_unadjusted = as.numeric(b2_raw['cov_02_high', ][['Diff.Un']]),
    raw_diff_matched = as.numeric(b2_raw['cov_02_high', ][['Diff.Adj']]),
    unadjusted_variance_ratio = NULL,
    matched_variance_ratio = NULL
  )
)
res2
`;

  const shelter2 = await new webR.Shelter();
  const rawRes2 = await shelter2.captureR(rCodeFix02);
  const eval2 = await rawRes2.result.toJs();
  await shelter2.purge();

  generatedFixtures['fix_02_mixed_types'] = {
    name: 'Mixed factor types',
    covariates: {}
  };

  for (let i = 0; i < eval2.names.length; i++) {
    const covName = eval2.names[i];
    const valObj = eval2.values[i];
    const covData = {};
    for (let j = 0; j < valObj.names.length; j++) {
      const fieldName = valObj.names[j];
      const val = valObj.values[j].values ? valObj.values[j].values[0] : null;
      covData[fieldName] = (val !== null && val !== undefined) ? val : null;
    }
    generatedFixtures['fix_02_mixed_types'].covariates[covName] = covData;
  }
  console.log('fix_02_mixed_types reference generated successfully.\n');

  server.close();

  // 6. Assemble complete reference document
  const generatedReferenceDoc = {
    version: '1.2.0a-E1',
    generated_at: new Date().toISOString(),
    toolchain: {
      r: '4.6.0',
      webr: '0.6.0',
      matchit: '4.8.1',
      cobalt: '5.0.0'
    },
    provenance: 'OFFICIAL_R_COBALT_BAL_TAB_INDEPENDENT_EVALUATION',
    method_description: 'Direct R-side MatchIt::matchit and cobalt::bal.tab evaluation without adapter or template layers',
    execution_command: 'node experiments/cp-webr-02a/harness/generate_cobalt_reference.mjs',
    generator_source_sha256: scriptSha256,
    input_fixture_hashes: {
      fix_01_well_conditioned: fix01Sha256,
      fix_02_mixed_types: fix02Sha256
    },
    tolerance: 0.0001,
    fixtures: generatedFixtures
  };

  // 7. Verify Reproducibility against pinned reference file
  if (!fs.existsSync(PINNED_REF_PATH)) {
    console.error(`Pinned reference not found at ${PINNED_REF_PATH}`);
    if (shouldOverwrite) {
      fs.writeFileSync(PINNED_REF_PATH, JSON.stringify(generatedReferenceDoc, null, 2) + '\n', 'utf-8');
      console.log(`Wrote initial pinned reference to ${PINNED_REF_PATH}`);
    } else {
      process.exit(1);
    }
  }

  const pinnedReference = JSON.parse(fs.readFileSync(PINNED_REF_PATH, 'utf-8'));
  console.log('Comparing newly generated reference against pinned reference...');

  const auditReport = {
    suite: 'CP-WEBR-02A R1.2a-E1 Cobalt Reference Reproducibility Audit',
    executed_at: new Date().toISOString(),
    generator_script_sha256: scriptSha256,
    input_fixture_hashes: {
      fix_01_well_conditioned: fix01Sha256,
      fix_02_mixed_types: fix02Sha256
    },
    tolerance: 0.0001,
    total_comparisons: 0,
    numerical_comparisons: 0,
    null_comparisons: 0,
    reproducibility_pass: true,
    discrepancies: [],
    details: []
  };

  for (const [fixId, fixData] of Object.entries(generatedFixtures)) {
    const pinnedFix = pinnedReference.fixtures[fixId];
    if (!pinnedFix) {
      auditReport.discrepancies.push(`Missing fixture in pinned reference: ${fixId}`);
      auditReport.reproducibility_pass = false;
      continue;
    }

    for (const [covName, covStats] of Object.entries(fixData.covariates)) {
      const pinnedCov = pinnedFix.covariates[covName];
      if (!pinnedCov) {
        auditReport.discrepancies.push(`Missing covariate in pinned reference: ${fixId}.${covName}`);
        auditReport.reproducibility_pass = false;
        continue;
      }

      for (const [statName, genVal] of Object.entries(covStats)) {
        if (statName === 'type') continue;
        const pinnedVal = pinnedCov[statName];
        auditReport.total_comparisons++;

        if (pinnedVal === null) {
          auditReport.null_comparisons++;
          const nullMatch = (genVal === null);
          auditReport.details.push({
            fixture: fixId,
            covariate: covName,
            statistic: statName,
            is_numerical: false,
            pinned_value: null,
            generated_value: genVal,
            difference: 0,
            pass: nullMatch
          });
          if (!nullMatch) {
            auditReport.discrepancies.push(`Null mismatch on ${fixId}.${covName}.${statName}: expected null, got ${genVal}`);
            auditReport.reproducibility_pass = false;
          }
        } else {
          auditReport.numerical_comparisons++;
          const diff = Math.abs(genVal - pinnedVal);
          const numMatch = diff <= 0.0001;
          auditReport.details.push({
            fixture: fixId,
            covariate: covName,
            statistic: statName,
            is_numerical: true,
            pinned_value: pinnedVal,
            generated_value: genVal,
            difference: diff,
            pass: numMatch
          });
          if (!numMatch) {
            auditReport.discrepancies.push(`Numerical difference on ${fixId}.${covName}.${statName} (${diff.toExponential(4)}) exceeds tolerance 0.0001`);
            auditReport.reproducibility_pass = false;
          }
        }
      }
    }
  }

  fs.writeFileSync(AUDIT_PATH, JSON.stringify(auditReport, null, 2) + '\n', 'utf-8');
  console.log(`Wrote reproducibility audit to ${AUDIT_PATH}`);
  console.log(`Total comparisons: ${auditReport.total_comparisons} (Numerical: ${auditReport.numerical_comparisons}, Null: ${auditReport.null_comparisons})`);
  console.log(`Reproducibility verdict: ${auditReport.reproducibility_pass ? 'PASS' : 'FAIL'}`);

  if (shouldOverwrite) {
    fs.writeFileSync(PINNED_REF_PATH, JSON.stringify(generatedReferenceDoc, null, 2) + '\n', 'utf-8');
    console.log(`Updated pinned reference document with fresh generator metadata: ${PINNED_REF_PATH}`);
  }

  if (!auditReport.reproducibility_pass) {
    console.error('FAIL: Regenerated cobalt reference values differ from pinned reference!');
    process.exit(1);
  }

  console.log('Authoritative Cobalt reference reproducibility confirmed.\n');
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCobaltReferenceGeneration().catch(err => {
    console.error('Fatal error in cobalt reference generation:', err);
    process.exit(1);
  });
}
