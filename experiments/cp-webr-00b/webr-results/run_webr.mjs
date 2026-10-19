// CP-WEBR-00B R1 WebR Execution Runner
// Executes the 25 golden fixtures inside WebR 0.6.0 (R 4.6.0 Wasm)

import fs from 'node:fs';
import path from 'node:path';

function resolveWebrPath() {
  const env = process.env.WEBR_NODE_MODULES || process.env.WEBR_PATH;
  if (env && fs.existsSync(env)) return env;
  const candidates = [
    path.resolve('experiments/cp-webr-00b/.cache/webr'),
    path.resolve('node_modules/webr'),
    path.resolve('../node_modules/webr')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve('experiments/cp-webr-00b/.cache/webr');
}

const webrPkgPath = resolveWebrPath();
const { WebR } = await import(path.join(webrPkgPath, 'dist/webr.mjs'));

const baseDir = 'experiments/cp-webr-00b/fixtures';
const outFile = 'experiments/cp-webr-00b/webr-results/webr_results.json';
const manifestFile = path.join(baseDir, 'fixtures_manifest.json');

const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const fixtureSpecs = manifest.fixtures;

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
  const idLines = csvContent.trim().split('\n').slice(1).map(l => l.split(',')[0].replace(/"/g, ''));
  const uniqueIds = new Set(idLines);
  if (uniqueIds.size < idLines.length) {
    allResults[fid] = {
      id: fid,
      runtime: "WEBR_WASM",
      r_version: rVer,
      status: "CLINICALPSM_POLICY_REJECT",
      warning_categories: [],
      warnings: [],
      error_category: "DUPLICATE_IDENTIFIER",
      error: "Duplicate row identifier detected: ClinicalPSM policy requires strictly unique patient/sample identifiers.",
      clinicalpsm_policy: "REJECT_DUPLICATE_ID"
    };
    console.log(`Evaluated ${fid}: status=CLINICALPSM_POLICY_REJECT`);
    continue;
  }

  // Load CSV into WebR VFS
  await webr.FS.writeFile('/tmp/fixture.csv', new TextEncoder().encode(csvContent));

  const factorRefStr = spec.extra_meta?.factor_ref?.x_cat
    ? `df$x_cat <- relevel(factor(df$x_cat, levels = c("low", "med", "high")), ref = "${spec.extra_meta.factor_ref.x_cat}")`
    : `if ("x_cat" %in% names(df)) df$x_cat <- relevel(factor(df$x_cat, levels = c("low", "med", "high")), ref = "low")`;

    const caliperStr = (typeof spec.caliper === 'number') ? spec.caliper : 'NULL';

    const script = `
    df <- read.csv('/tmp/fixture.csv', stringsAsFactors = FALSE)
    ${factorRefStr}
    if ("cat_var" %in% names(df)) df$cat_var <- factor(df$cat_var)
    rownames(df) <- df$id

    warnings_captured <- character(0)
    err_msg <- NULL
    m_out <- NULL

    formula_obj <- as.formula("${spec.formula}")

    withCallingHandlers({
      tryCatch({
        m_out <- MatchIt::matchit(
          formula = formula_obj,
          data = df,
          method = "${spec.method}",
          distance = "${spec.distance}",
          link = "${spec.link}",
          estimand = "ATT",
          ratio = ${spec.ratio},
          replace = ${spec.replace ? 'TRUE' : 'FALSE'},
          m.order = "${spec.m_order}",
          discard = "${spec.discard}",
          caliper = ${caliperStr},
          std.caliper = ${spec.std_caliper ? 'TRUE' : 'FALSE'}
        )
      }, error = function(e) {
        err_msg <<- conditionMessage(e)
      })
    }, warning = function(w) {
      warnings_captured <<- c(warnings_captured, conditionMessage(w))
      invokeRestart("muffleWarning")
    })

    warning_cats <- character(0)
    for (wmsg in warnings_captured) {
      if (grepl("numerically 0 or 1", wmsg)) {
        warning_cats <- c(warning_cats, "SEPARATION_WARNING")
      } else if (grepl("rank-deficient", wmsg)) {
        warning_cats <- c(warning_cats, "RANK_DEFICIENT_WARNING")
      } else if (grepl("did not converge", wmsg)) {
        warning_cats <- c(warning_cats, "CONVERGENCE_WARNING")
      } else {
        warning_cats <- c(warning_cats, "OTHER_WARNING")
      }
    }
    warning_cats <- unique(warning_cats)

    out_obj <- list(
      id = "${fid}",
      runtime = "WEBR_WASM",
      r_version = R.version.string,
      status = "UNKNOWN",
      warning_categories = warning_cats,
      warnings = warnings_captured,
      error_category = NULL,
      error = err_msg,
      clinicalpsm_policy = "${spec.extra_meta?.clinicalpsm_policy || 'ACCEPT'}"
    )

    if (!is.null(err_msg)) {
      out_obj$status <- "EXPECTED_REFERENCE_ERROR"
      out_obj$error_category <- "${spec.extra_meta?.error_category || 'EXECUTION_ERROR'}"
    } else {
      mm <- m_out$match.matrix
      treated_units <- rownames(mm)
      matched_pairs <- list()
      for (t_id in treated_units) {
        c_id <- mm[t_id, 1]
        if (!is.na(c_id)) {
          matched_pairs[[t_id]] <- c_id
        }
      }

      if (length(matched_pairs) == 0 && "${spec.expected_status}" == "EXPECTED_ZERO_MATCHES") {
        out_obj$status <- "EXPECTED_ZERO_MATCHES"
      } else if (length(warnings_captured) > 0) {
        out_obj$status <- "SUCCESS_WITH_WARNING"
      } else {
        out_obj$status <- "SUCCESS"
      }

      discarded_units <- names(m_out$discarded)[m_out$discarded]
      if (is.null(discarded_units)) discarded_units <- character(0)

      weights_map <- as.list(m_out$weights)
      subclass_map <- as.list(ifelse(is.na(m_out$subclass), "UNMATCHED", as.character(m_out$subclass)))

      glm_mod <- m_out$model
      coefs <- if (!is.null(glm_mod)) as.list(coef(glm_mod)) else list()
      converged <- if (!is.null(glm_mod)) glm_mod$converged else NA
      rank <- if (!is.null(glm_mod)) glm_mod$rank else NA
      aliased <- if (!is.null(glm_mod)) as.list(summary(glm_mod)$aliased) else list()
      mm_cols <- if (!is.null(glm_mod)) colnames(model.matrix(glm_mod)) else character(0)

      contrasts_list <- list()
      if (!is.null(glm_mod) && !is.null(glm_mod$contrasts)) {
        for (cname in names(glm_mod$contrasts)) {
          contrasts_list[[cname]] <- glm_mod$contrasts[[cname]]
        }
      }

      out_obj$matching <- list(
        converged = converged,
        rank = rank,
        aliased = aliased,
        model_matrix_colnames = mm_cols,
        contrasts = contrasts_list,
        coefficients = coefs,
        distance = as.list(setNames(as.numeric(m_out$distance), names(m_out$distance))),
        matched_pairs = matched_pairs,
        weights = weights_map,
        subclass = subclass_map,
        discarded = discarded_units,
        n_treated_total = sum(m_out$treat == 1),
        n_control_total = sum(m_out$treat == 0),
        n_matched_pairs = length(matched_pairs),
        n_discarded = length(discarded_units)
      )

      extract_bal <- function(binary_mode) {
        if (length(matched_pairs) == 0) return(NULL)
        bal <- tryCatch({
          cobalt::bal.tab(m_out, un = TRUE, binary = binary_mode, s.d.denom = "treated")
        }, error = function(e) NULL)

        if (is.null(bal) || is.null(bal$Balance)) return(NULL)
        b_df <- as.data.frame(bal$Balance)
        raw_covs <- rownames(b_df)
        canon_covs <- ifelse(grepl("^distance", raw_covs), "distance", raw_covs)

        list(
          binary_mode = binary_mode,
          covariates = canon_covs,
          raw_covariates = raw_covs,
          type = as.character(b_df$Type),
          diff_un = as.list(setNames(b_df$Diff.Un, canon_covs)),
          diff_adj = as.list(setNames(b_df$Diff.Adj, canon_covs)),
          v_ratio_un = if ("V.Ratio.Un" %in% names(b_df)) as.list(setNames(b_df$V.Ratio.Un, canon_covs)) else list(),
          v_ratio_adj = if ("V.Ratio.Adj" %in% names(b_df)) as.list(setNames(b_df$V.Ratio.Adj, canon_covs)) else list()
        )
      }

      out_obj$cobalt_balance_raw <- extract_bal("raw")
      out_obj$cobalt_balance_std <- extract_bal("std")
    }

    jsonlite::toJSON(out_obj, auto_unbox = TRUE, null = "null", na = "string")
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
      warning_categories: [],
      warnings: [],
      error_category: "UNCAUGHT_EXCEPTION",
      error: e.message,
      clinicalpsm_policy: "REJECT_ON_CRASH"
    };
    console.error(`Exception evaluating ${fid}:`, e.message);
  }
}

await webr.close();
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(allResults, null, 2));
console.log(`WebR execution complete: saved to ${outFile}`);
