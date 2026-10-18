// CP-WEBR-00B WebR Execution Runner
// Executes the 24 golden fixtures inside WebR 0.6.0 (R 4.6.0 Wasm)

import fs from 'node:fs';
import path from 'node:path';

const webrPkgPath = '/Users/eren/.gemini/antigravity-ide/brain/bde2c483-da90-4bd7-8519-833214691e68/scratch/webr-qualification/node_modules/webr';
const { WebR } = await import(path.join(webrPkgPath, 'dist/webr.mjs'));

const baseDir = 'experiments/cp-webr-00b/fixtures';
const outFile = 'experiments/cp-webr-00b/webr-results/webr_results.json';

const fixtureSpecs = [
  { id: "fix_01_well_conditioned", formula: "treat ~ age + bmi + sbp", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_02_mixed_types", formula: "treat ~ x_cont + x_bin + x_cat", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_03_ref_level_change", formula: "treat ~ x_cont + x_bin + x_cat", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_04_input_row_order", formula: "treat ~ age + bmi + sbp", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_05_exact_distance_ties", formula: "treat ~ x1 + x2", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_06_no_caliper_nearest", formula: "treat ~ age + bmi + sbp", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_07_prob_scale_caliper", formula: "treat ~ age + bmi + sbp", link: "logit", caliper: 0.1, std: false, discard: "none" },
  { id: "fix_08_linear_logit_caliper", formula: "treat ~ age + bmi + sbp", link: "linear.logit", caliper: 0.2, std: false, discard: "none" },
  { id: "fix_09_standardized_caliper", formula: "treat ~ age + bmi + sbp", link: "linear.logit", caliper: 0.2, std: true, discard: "none" },
  { id: "fix_10_whole_vs_pooled_sd", formula: "treat ~ x", link: "linear.logit", caliper: 0.2, std: true, discard: "none" },
  { id: "fix_11_pre_match_discard", formula: "treat ~ x", link: "linear.logit", caliper: null, std: false, discard: "both" },
  { id: "fix_12_caliper_unmatched", formula: "treat ~ age + bmi + sbp", link: "linear.logit", caliper: 0.05, std: false, discard: "none" },
  { id: "fix_13_more_treated_than_control", formula: "treat ~ x1 + x2", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_14_more_controls_than_treated", formula: "treat ~ x1 + x2", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_15_quasi_separation", formula: "treat ~ x_quasi + x_norm", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_16_complete_separation", formula: "treat ~ x_sep", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_17_rank_deficient", formula: "treat ~ x1 + x2", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_18_zero_variance", formula: "treat ~ x1 + x_const", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_19_missing_values", formula: "treat ~ x1 + x2", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_20_malformed_category", formula: "treat ~ x1 + cat_var", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_21_extreme_propensities", formula: "treat ~ x_ext", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_22_small_sample", formula: "treat ~ x", link: "linear.logit", caliper: null, std: false, discard: "none" },
  { id: "fix_23_no_eligible_match", formula: "treat ~ x", link: "linear.logit", caliper: 0.01, std: false, discard: "none" },
  { id: "fix_24_duplicate_ids", formula: "treat ~ age + bmi + sbp", link: "linear.logit", caliper: null, std: false, discard: "none" }
];

console.log('Initializing WebR instance...');
const webr = new WebR();
await webr.init();

console.log('Installing MatchIt, cobalt and jsonlite into WebR virtual filesystem...');
await webr.installPackages(['MatchIt', 'cobalt', 'jsonlite']);
await webr.evalR('library(MatchIt); library(cobalt); library(jsonlite)');

const rVer = (await (await webr.evalR('R.version.string')).toJs()).values[0];
console.log(`WebR R version: ${rVer}`);

const allResults = {};

for (const spec of fixtureSpecs) {
  const fid = spec.id;
  const csvPath = path.join(baseDir, `${fid}.csv`);
  const csvContent = fs.readFileSync(csvPath, 'utf8');

  // Check for duplicate IDs (ClinicalPSM policy)
  const idLines = csvContent.trim().split('\n').slice(1).map(l => l.split(',')[0]);
  const uniqueIds = new Set(idLines);
  if (uniqueIds.size < idLines.length) {
    allResults[fid] = {
      id: fid,
      runtime: "WEBR_WASM",
      r_version: rVer,
      status: "CLINICALPSM_POLICY_REJECT",
      warnings: [],
      error: "Duplicate row identifier detected: ClinicalPSM policy requires strictly unique patient/sample identifiers."
    };
    console.log(`Evaluated ${fid}: status=CLINICALPSM_POLICY_REJECT pairs=N/A`);
    continue;
  }

  // Load CSV into WebR VFS
  await webr.FS.writeFile('/tmp/fixture.csv', new TextEncoder().encode(csvContent));

  const script = `
    df <- read.csv('/tmp/fixture.csv', stringsAsFactors = FALSE)
    if ("x_cat" %in% names(df)) df$x_cat <- factor(df$x_cat)
    if ("cat_var" %in% names(df)) df$cat_var <- factor(df$cat_var)
    rownames(df) <- df$id

    warnings_captured <- character(0)
    err_msg <- NULL
    m_out <- NULL

    withCallingHandlers({
      tryCatch({
        m_out <- MatchIt::matchit(
          formula = ${spec.formula},
          data = df,
          method = "nearest",
          distance = "glm",
          link = "${spec.link}",
          estimand = "ATT",
          ratio = 1,
          replace = FALSE,
          m.order = "largest",
          discard = "${spec.discard}",
          caliper = ${spec.caliper === null ? 'NULL' : spec.caliper},
          std.caliper = ${spec.std ? 'TRUE' : 'FALSE'}
        )
      }, error = function(e) {
        err_msg <<- conditionMessage(e)
      })
    }, warning = function(w) {
      warnings_captured <<- c(warnings_captured, conditionMessage(w))
      invokeRestart("muffleWarning")
    })

    out_obj <- list(
      id = "${fid}",
      runtime = "WEBR_WASM",
      r_version = R.version.string,
      status = if (is.null(err_msg)) "SUCCESS" else "ERROR",
      warnings = warnings_captured,
      error = err_msg
    )

    if (!is.null(m_out)) {
      mm <- m_out$match.matrix
      treated_units <- rownames(mm)
      matched_pairs <- list()
      for (t_id in treated_units) {
        c_id <- mm[t_id, 1]
        if (!is.na(c_id)) {
          matched_pairs[[t_id]] <- c_id
        }
      }
      discarded_units <- names(m_out$discarded)[m_out$discarded]
      if (is.null(discarded_units)) discarded_units <- character(0)

      glm_mod <- m_out$model
      coefs <- if (!is.null(glm_mod)) as.list(coef(glm_mod)) else list()
      converged <- if (!is.null(glm_mod)) glm_mod$converged else NA

      out_obj$matching <- list(
        converged = converged,
        coefficients = coefs,
        distance = as.list(setNames(as.numeric(m_out$distance), names(m_out$distance))),
        matched_pairs = matched_pairs,
        weights = as.list(m_out$weights),
        subclass = as.list(ifelse(is.na(m_out$subclass), "UNMATCHED", as.character(m_out$subclass))),
        discarded = discarded_units,
        n_treated_total = sum(m_out$treat == 1),
        n_control_total = sum(m_out$treat == 0),
        n_matched_pairs = length(matched_pairs),
        n_discarded = length(discarded_units)
      )

      if (length(matched_pairs) > 0) {
        bal <- tryCatch({
          cobalt::bal.tab(m_out, un = TRUE, binary = "raw", s.d.denom = "treated")
        }, error = function(e) NULL)
        if (!is.null(bal) && !is.null(bal$Balance)) {
          b_df <- as.data.frame(bal$Balance)
          out_obj$cobalt_balance <- list(
            covariates = rownames(b_df),
            type = as.character(b_df$Type),
            diff_un = as.list(setNames(b_df$Diff.Un, rownames(b_df))),
            diff_adj = as.list(setNames(b_df$Diff.Adj, rownames(b_df))),
            v_ratio_un = if ("V.Ratio.Un" %in% names(b_df)) as.list(setNames(b_df$V.Ratio.Un, rownames(b_df))) else list(),
            v_ratio_adj = if ("V.Ratio.Adj" %in% names(b_df)) as.list(setNames(b_df$V.Ratio.Adj, rownames(b_df))) else list()
          )
        }
      } else {
        out_obj$cobalt_balance <- list(note = "Zero matched pairs; cobalt bal.tab skipped")
      }
    }
    jsonlite::toJSON(out_obj, auto_unbox = TRUE, null = "null", na = "null")
  `;

  try {
    const rawJson = await webr.evalR(script);
    const jsonStr = (await rawJson.toJs()).values[0];
    const parsed = JSON.parse(jsonStr);
    allResults[fid] = parsed;
    const pairs = parsed.matching ? parsed.matching.n_matched_pairs : 'N/A';
    console.log(`Evaluated ${fid}: status=${parsed.status} pairs=${pairs} warnings=${parsed.warnings.length}`);
  } catch (e) {
    allResults[fid] = {
      id: fid,
      runtime: "WEBR_WASM",
      r_version: rVer,
      status: "EXECUTION_EXCEPTION",
      warnings: [],
      error: e.message
    };
    console.error(`Exception evaluating ${fid}:`, e.message);
  }
}

await webr.close();
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(allResults, null, 2));
console.log(`WebR execution complete: saved to ${outFile}`);
