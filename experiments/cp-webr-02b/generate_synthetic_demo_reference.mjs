// CP-WEBR-02B Independent Synthetic Demo Reference Generator
// Generates reproducible reference values for the seed-7 200-row synthetic demo cohort
// Directly evaluates MatchIt 4.8.1 and cobalt 5.0.0 on R 4.6.0 via official WebR
// WITHOUT ClinicalPSM adapter or template layers

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebR } from 'webr';
import { createServer } from '../cp-webr-02a/browser-harness/server.mjs';

const PORT = 8895;
const OUT_REF_PATH = path.resolve('experiments/cp-webr-02b/SYNTHETIC-DEMO-REFERENCE.json');
const OUT_CSV_PATH = path.resolve('experiments/cp-webr-02b/SYNTHETIC-DEMO-INPUT.csv');

export function generateCohort() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return Array.from({ length: 200 }, (_, idx) => {
    const age = Math.round(40 + rnd() * 40);
    const bmi = +(20 + rnd() * 15).toFixed(1);
    const p = 1 / (1 + Math.exp(-((age - 60) / 10 + (bmi - 27) / 5)));
    return {
      id: `row_${idx + 1}`,
      age,
      bmi,
      sex: rnd() < 0.5 ? 'F' : 'M',
      treated: rnd() < p ? 1 : 0
    };
  });
}

export function cohortToCsv(rows) {
  const header = 'id,age,bmi,sex,treated\n';
  const body = rows.map(r => `${r.id},${r.age},${r.bmi},${r.sex},${r.treated}`).join('\n');
  return header + body + '\n';
}

export async function runSyntheticDemoReferenceGeneration() {
  console.log('=================================================================');
  console.log('CP-WEBR-02B Synthetic Demo Independent Reference Generator');
  console.log('Direct WebR R 4.6.0 Evaluation (MatchIt 4.8.1, cobalt 5.0.0)');
  console.log('=================================================================\n');

  const rows = generateCohort();
  const csvContent = cohortToCsv(rows);
  fs.writeFileSync(OUT_CSV_PATH, csvContent, 'utf-8');
  const inputSha256 = crypto.createHash('sha256').update(csvContent).digest('hex');
  console.log(`Generated synthetic demo cohort: 200 rows`);
  console.log(`Input CSV SHA-256: ${inputSha256}\n`);

  // Start package server
  const server = createServer();
  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`Qualification package server listening on port ${PORT}`);

  // Initialize WebR
  const webR = new WebR();
  await webR.init();
  console.log('WebR runtime initialized (R 4.6.0 Wasm)');

  const REQUIRED_PACKAGES = [
    'Rcpp', 'R6', 'cli', 'rlang', 'vctrs', 'glue', 'withr', 'lifecycle',
    'gtable', 'scales', 'farver', 'labeling', 'isoband', 'ggplot2',
    'gridExtra', 'viridisLite', 'S7', 'arg', 'RColorBrewer', 'MatchIt', 'cobalt'
  ];
  await webR.installPackages(REQUIRED_PACKAGES, { repos: [`http://127.0.0.1:${PORT}/repo`] });
  console.log('MatchIt 4.8.1 and cobalt 5.0.0 installed successfully\n');

  await webR.FS.writeFile('/cohort_200.csv', new TextEncoder().encode(csvContent));

  const rCode = `
library(MatchIt)
library(cobalt)

df <- read.csv('/cohort_200.csv', stringsAsFactors = FALSE)
df$sex <- factor(df$sex, levels = c("F", "M"))
df$sex <- stats::relevel(df$sex, ref = "F")
rownames(df) <- df$id

# 1. Direct GLM Model
glm_fit <- stats::glm(treated ~ age + bmi + sex, family = binomial(link = "logit"), data = df)

# Linear logit and propensity scores
lp_named <- stats::predict(glm_fit, type = "link")
ps_named <- stats::predict(glm_fit, type = "response")

# 2. Direct MatchIt 1:1 Nearest-Neighbor
m_out <- MatchIt::matchit(
  treated ~ age + bmi + sex,
  data = df,
  method = "nearest",
  distance = "glm",
  link = "linear.logit",
  replace = FALSE,
  m.order = "largest",
  ratio = 1
)

# 3. Direct cobalt balance tables (ATT)
b_raw <- cobalt::bal.tab(m_out, s.d.denom = "treated", binary = "raw", un = TRUE)[["Balance"]]
b_std <- cobalt::bal.tab(m_out, s.d.denom = "treated", binary = "std", un = TRUE)[["Balance"]]

# 4. Rubin's B and Rubin's R calculation
weights <- m_out$weights
matched_mask <- weights > 0
trt_vec <- df$treated

lp_t_adj <- lp_named[matched_mask & trt_vec == 1]
lp_c_adj <- lp_named[matched_mask & trt_vec == 0]
lp_t_unadj <- lp_named[trt_vec == 1]
lp_c_unadj <- lp_named[trt_vec == 0]

var_t_unadj <- stats::var(lp_t_unadj, na.rm = TRUE)
var_c_unadj <- stats::var(lp_c_unadj, na.rm = TRUE)
pooled_var <- (var_t_unadj + var_c_unadj) / 2
rubin_b <- abs(mean(lp_t_adj) - mean(lp_c_adj)) / sqrt(pooled_var)

var_t_adj <- stats::var(lp_t_adj, na.rm = TRUE)
var_c_adj <- stats::var(lp_c_adj, na.rm = TRUE)
rubin_r <- if (!is.na(var_c_adj) && var_c_adj > 0) var_t_adj / var_c_adj else NULL

# 5. Extract match matrix
mm <- m_out$match.matrix
matched_treated_ids <- rownames(mm)[!is.na(mm[, 1])]
matched_control_ids <- as.character(mm[!is.na(mm[, 1]), 1])

# Build export structure
cov_names <- c("age", "bmi", "sex_M")
balance_export <- list()

for (cn in cov_names) {
  is_bin <- cn == "sex_M"
  raw_row <- b_raw[cn, ]
  std_row <- b_std[cn, ]
  
  vr_un <- if ("V.Ratio.Un" %in% names(std_row) && !is.na(std_row[["V.Ratio.Un"]])) as.numeric(std_row[["V.Ratio.Un"]]) else NULL
  vr_adj <- if ("V.Ratio.Adj" %in% names(std_row) && !is.na(std_row[["V.Ratio.Adj"]])) as.numeric(std_row[["V.Ratio.Adj"]]) else NULL

  balance_export[[cn]] <- list(
    covariate = cn,
    type = if (is_bin) "binary" else "continuous",
    unadjusted_smd = as.numeric(std_row[["Diff.Un"]]),
    matched_smd = as.numeric(std_row[["Diff.Adj"]]),
    raw_diff_unadjusted = if (is_bin) as.numeric(raw_row[["Diff.Un"]]) else NULL,
    raw_diff_matched = if (is_bin) as.numeric(raw_row[["Diff.Adj"]]) else NULL,
    unadjusted_variance_ratio = vr_un,
    matched_variance_ratio = vr_adj
  )
}

list(
  sampleAccounting = list(
    totalUnits = nrow(df),
    treatedTotal = sum(trt_vec == 1),
    controlTotal = sum(trt_vec == 0),
    matchedPairs = length(matched_treated_ids),
    matchedTreatedCount = length(matched_treated_ids),
    matchedControlCount = length(unique(matched_control_ids)),
    discardedTreatedCount = 0,
    discardedControlCount = 0,
    unmatchedTreatedCount = sum(trt_vec == 1) - length(matched_treated_ids),
    unmatchedControlCount = sum(trt_vec == 0) - length(unique(matched_control_ids))
  ),
  matchedPairs = list(
    treatedIds = matched_treated_ids,
    controlIds = matched_control_ids
  ),
  diagnostics = list(
    glmConverged = isTRUE(glm_fit$converged),
    glmIter = as.integer(glm_fit$iter),
    rubinB = as.numeric(rubin_b),
    rubinR = as.numeric(rubin_r)
  ),
  balance = balance_export
)
`;

  const shelter = await new webR.Shelter();
  const rawRes = await shelter.captureR(rCode);
  const evalRes = await rawRes.result.toJs();
  await shelter.purge();

  function unpack(node) {
    if (node === null || node === undefined) return null;
    if (typeof node !== 'object') return node;
    if (node.type === 'null') return null;
    if (node.type === 'list') {
      if (Array.isArray(node.names)) {
        const obj = {};
        for (let i = 0; i < node.names.length; i++) {
          obj[node.names[i]] = unpack(node.values[i]);
        }
        return obj;
      }
      return (node.values || []).map(unpack);
    }
    if (node.values !== undefined) {
      if (Array.isArray(node.values) && node.values.length === 1 && !Array.isArray(node.names)) {
        return node.values[0];
      }
      return node.values;
    }
    return node;
  }

  const unpacked = unpack(evalRes);

  const generatorSource = fs.readFileSync('experiments/cp-webr-02b/generate_synthetic_demo_reference.mjs', 'utf-8');
  const generatorSha256 = crypto.createHash('sha256').update(generatorSource).digest('hex');

  const referenceDoc = {
    version: "1.0.0-synthetic-demo",
    generated_at: new Date().toISOString(),
    provenance: "OFFICIAL_R_MATCHIT_COBALT_INDEPENDENT_EVALUATION",
    method_description: "Direct R-side MatchIt::matchit and cobalt::bal.tab evaluation on 200-row seed-7 synthetic demo cohort without ClinicalPSM adapter or template layers",
    execution_command: "node experiments/cp-webr-02b/generate_synthetic_demo_reference.mjs",
    generator_source_sha256: generatorSha256,
    input_csv_path: "experiments/cp-webr-02b/SYNTHETIC-DEMO-INPUT.csv",
    input_csv_sha256: inputSha256,
    toolchain: {
      webr: "0.6.0",
      r: "4.6.0",
      matchit: "4.8.1",
      cobalt: "5.0.0"
    },
    method: {
      algorithm: "nearest",
      distance_metric: "linear.logit",
      ratio: 1,
      replace: false,
      matching_order: "largest",
      caliper: null,
      discard: "none",
      estimand: "ATT"
    },
    tolerances: {
      numerical_smd: 0.0001,
      numerical_raw_diff: 0.0001,
      rubin_diagnostics: 0.001
    },
    sample_accounting: unpacked.sampleAccounting,
    matched_pairs: unpacked.matchedPairs,
    diagnostics: unpacked.diagnostics,
    balance: unpacked.balance
  };

  fs.writeFileSync(OUT_REF_PATH, JSON.stringify(referenceDoc, null, 2) + '\n', 'utf-8');
  console.log(`Reference successfully written to ${OUT_REF_PATH}`);

  console.log('\n--- Summary Accounting ---');
  console.log(`Treated Total: ${unpacked.sampleAccounting.treatedTotal}`);
  console.log(`Control Total: ${unpacked.sampleAccounting.controlTotal}`);
  console.log(`Matched Pairs: ${unpacked.sampleAccounting.matchedPairs}`);
  console.log(`Rubin's B: ${unpacked.diagnostics.rubinB.toFixed(4)}`);
  console.log(`Rubin's R: ${unpacked.diagnostics.rubinR.toFixed(4)}`);
  console.log('\n--- Balance Table ---');
  for (const [cov, data] of Object.entries(unpacked.balance)) {
    console.log(`${cov}: pre-SMD=${data.unadjusted_smd.toFixed(4)}, post-SMD=${data.matched_smd.toFixed(4)}`);
  }

  server.close();
  webR.close();
  console.log('\nIndependent reference generation complete.');
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSyntheticDemoReferenceGeneration().catch(err => {
    console.error('Fatal error in reference generation:', err);
    process.exit(1);
  });
}
