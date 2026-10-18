# CP-WEBR-00B Native R Oracle Runner
# Executes 24 golden fixtures against native R 4.6.0 + MatchIt 4.8.1 + cobalt 5.0.0

suppressPackageStartupMessages({
  library(MatchIt)
  library(cobalt)
  library(jsonlite)
})

base_dir <- "experiments/cp-webr-00b/fixtures"
out_file <- "experiments/cp-webr-00b/native-reference/native_results.json"

fixture_specs <- list(
  list(id = "fix_01_well_conditioned", formula = treat ~ age + bmi + sbp, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_02_mixed_types", formula = treat ~ x_cont + x_bin + x_cat, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none", test_std_binary = TRUE),
  list(id = "fix_03_ref_level_change", formula = treat ~ x_cont + x_bin + x_cat, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_04_input_row_order", formula = treat ~ age + bmi + sbp, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_05_exact_distance_ties", formula = treat ~ x1 + x2, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_06_no_caliper_nearest", formula = treat ~ age + bmi + sbp, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_07_prob_scale_caliper", formula = treat ~ age + bmi + sbp, link = "logit", caliper = 0.1, std = FALSE, discard = "none"),
  list(id = "fix_08_linear_logit_caliper", formula = treat ~ age + bmi + sbp, link = "linear.logit", caliper = 0.2, std = FALSE, discard = "none"),
  list(id = "fix_09_standardized_caliper", formula = treat ~ age + bmi + sbp, link = "linear.logit", caliper = 0.2, std = TRUE, discard = "none"),
  list(id = "fix_10_whole_vs_pooled_sd", formula = treat ~ x, link = "linear.logit", caliper = 0.2, std = TRUE, discard = "none"),
  list(id = "fix_11_pre_match_discard", formula = treat ~ x, link = "linear.logit", caliper = NULL, std = FALSE, discard = "both"),
  list(id = "fix_12_caliper_unmatched", formula = treat ~ age + bmi + sbp, link = "linear.logit", caliper = 0.05, std = FALSE, discard = "none"),
  list(id = "fix_13_more_treated_than_control", formula = treat ~ x1 + x2, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_14_more_controls_than_treated", formula = treat ~ x1 + x2, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_15_quasi_separation", formula = treat ~ x_quasi + x_norm, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_16_complete_separation", formula = treat ~ x_sep, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_17_rank_deficient", formula = treat ~ x1 + x2, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_18_zero_variance", formula = treat ~ x1 + x_const, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_19_missing_values", formula = treat ~ x1 + x2, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_20_malformed_category", formula = treat ~ x1 + cat_var, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_21_extreme_propensities", formula = treat ~ x_ext, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_22_small_sample", formula = treat ~ x, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none"),
  list(id = "fix_23_no_eligible_match", formula = treat ~ x, link = "linear.logit", caliper = 0.01, std = FALSE, discard = "none"),
  list(id = "fix_24_duplicate_ids", formula = treat ~ age + bmi + sbp, link = "linear.logit", caliper = NULL, std = FALSE, discard = "none")
)

all_results <- list()

for (spec in fixture_specs) {
  fid <- spec$id
  csv_path <- file.path(base_dir, paste0(fid, ".csv"))
  df <- read.csv(csv_path, stringsAsFactors = FALSE)
  if ("x_cat" %in% names(df)) df$x_cat <- factor(df$x_cat)
  if ("cat_var" %in% names(df)) df$cat_var <- factor(df$cat_var)
  res <- list(
    id = fid,
    runtime = "NATIVE_R",
    r_version = R.version.string,
    status = "UNKNOWN",
    warnings = character(0),
    error = NULL
  )
  
  # Policy check for duplicate IDs
  if (anyDuplicated(df$id)) {
    res$status <- "CLINICALPSM_POLICY_REJECT"
    res$error <- "Duplicate row identifier detected: ClinicalPSM policy requires strictly unique patient/sample identifiers."
    all_results[[fid]] <- res
    next
  }
  
  rownames(df) <- df$id
  
  warnings_captured <- character(0)
  
  m_out <- NULL
  err_msg <- NULL
  
  withCallingHandlers({
    tryCatch({
      m_out <- MatchIt::matchit(
        formula = spec$formula,
        data = df,
        method = "nearest",
        distance = "glm",
        link = spec$link,
        estimand = "ATT",
        ratio = 1,
        replace = FALSE,
        m.order = "largest",
        discard = spec$discard,
        caliper = spec$caliper,
        std.caliper = spec$std
      )
    }, error = function(e) {
      err_msg <<- conditionMessage(e)
    })
  }, warning = function(w) {
    warnings_captured <<- c(warnings_captured, conditionMessage(w))
    invokeRestart("muffleWarning")
  })
  
  res$warnings <- warnings_captured
  
  if (!is.null(err_msg)) {
    res$status <- "ERROR"
    res$error <- err_msg
    all_results[[fid]] <- res
    next
  }
  
  res$status <- "SUCCESS"
  
  # Extract MatchIt model & results
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
  
  weights_map <- as.list(m_out$weights)
  subclass_map <- as.list(ifelse(is.na(m_out$subclass), "UNMATCHED", as.character(m_out$subclass)))
  
  # Model extraction
  glm_mod <- m_out$model
  coefs <- if (!is.null(glm_mod)) as.list(coef(glm_mod)) else list()
  converged <- if (!is.null(glm_mod)) glm_mod$converged else NA
  
  res$matching <- list(
    converged = converged,
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
  
  # Cobalt balance diagnostics
  if (res$matching$n_matched_pairs > 0) {
    bal <- tryCatch({
      cobalt::bal.tab(m_out, un = TRUE, binary = "raw", s.d.denom = "treated")
    }, error = function(e) NULL)
    
    if (!is.null(bal) && !is.null(bal$Balance)) {
      b_df <- as.data.frame(bal$Balance)
      res$cobalt_balance <- list(
        covariates = rownames(b_df),
        type = as.character(b_df$Type),
        diff_un = as.list(setNames(b_df$Diff.Un, rownames(b_df))),
        diff_adj = as.list(setNames(b_df$Diff.Adj, rownames(b_df))),
        v_ratio_un = if ("V.Ratio.Un" %in% names(b_df)) as.list(setNames(b_df$V.Ratio.Un, rownames(b_df))) else list(),
        v_ratio_adj = if ("V.Ratio.Adj" %in% names(b_df)) as.list(setNames(b_df$V.Ratio.Adj, rownames(b_df))) else list()
      )
    }
  } else {
    res$cobalt_balance <- list(note = "Zero matched pairs; cobalt bal.tab skipped")
  }
  
  all_results[[fid]] <- res
}

jsonlite::write_json(all_results, out_file, pretty = TRUE, auto_unbox = TRUE)
cat(sprintf("Native R execution completed: %d fixtures evaluated.\n", length(all_results)))
