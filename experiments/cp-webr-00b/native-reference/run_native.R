# CP-WEBR-00B R1 Native R Oracle Runner
# Executes 25 golden fixtures against native R 4.6.0 + MatchIt 4.8.1 + cobalt 5.0.0

suppressPackageStartupMessages({
  library(MatchIt)
  library(cobalt)
  library(jsonlite)
})

base_dir <- "experiments/cp-webr-00b/fixtures"
out_file <- "experiments/cp-webr-00b/native-reference/native_results.json"

manifest_file <- file.path(base_dir, "fixtures_manifest.json")
manifest <- jsonlite::read_json(manifest_file, simplifyVector = FALSE)
fixture_specs <- manifest$fixtures

all_results <- list()

for (spec in fixture_specs) {
  fid <- spec$id
  csv_path <- file.path(base_dir, paste0(fid, ".csv"))
  df <- read.csv(csv_path, stringsAsFactors = FALSE)

  res <- list(
    id = fid,
    runtime = "NATIVE_R",
    r_version = R.version.string,
    status = "UNKNOWN",
    warning_categories = character(0),
    warnings = character(0),
    error_category = NULL,
    error = NULL,
    clinicalpsm_policy = if (!is.null(spec$extra_meta$clinicalpsm_policy)) spec$extra_meta$clinicalpsm_policy else "ACCEPT"
  )

  # Explicit ClinicalPSM Policy check for duplicate row IDs
  if (anyDuplicated(df$id)) {
    res$status <- "CLINICALPSM_POLICY_REJECT"
    res$error_category <- "DUPLICATE_IDENTIFIER"
    res$error <- "Duplicate row identifier detected: ClinicalPSM policy requires strictly unique patient/sample identifiers."
    all_results[[fid]] <- res
    next
  }

  rownames(df) <- df$id

  # Handle factor variables and explicit reference levels
  if ("x_cat" %in% names(df)) {
    ref_lvl <- if (!is.null(spec$extra_meta$factor_ref$x_cat)) spec$extra_meta$factor_ref$x_cat else "low"
    df$x_cat <- relevel(factor(df$x_cat, levels = c("low", "med", "high")), ref = ref_lvl)
  }
  if ("cat_var" %in% names(df)) {
    df$cat_var <- factor(df$cat_var)
  }

  warnings_captured <- character(0)
  m_out <- NULL
  err_msg <- NULL

  formula_obj <- as.formula(spec$formula)

  withCallingHandlers({
    tryCatch({
      m_out <- MatchIt::matchit(
        formula = formula_obj,
        data = df,
        method = spec$method,
        distance = spec$distance,
        link = spec$link,
        estimand = "ATT",
        ratio = spec$ratio,
        replace = spec$replace,
        m.order = spec$m_order,
        discard = spec$discard,
        caliper = spec$caliper,
        std.caliper = spec$std_caliper
      )
    }, error = function(e) {
      err_msg <<- conditionMessage(e)
    })
  }, warning = function(w) {
    warnings_captured <<- c(warnings_captured, conditionMessage(w))
    invokeRestart("muffleWarning")
  })

  res$warnings <- warnings_captured

  # Classify warning categories
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
  res$warning_categories <- unique(warning_cats)

  if (!is.null(err_msg)) {
    res$status <- "EXPECTED_REFERENCE_ERROR"
    if (!is.null(spec$extra_meta$error_category)) {
      res$error_category <- spec$extra_meta$error_category
    } else {
      res$error_category <- "EXECUTION_ERROR"
    }
    res$error <- err_msg
    all_results[[fid]] <- res
    next
  }

  # Zero matches handling
  mm <- m_out$match.matrix
  treated_units <- rownames(mm)
  matched_pairs <- list()
  for (t_id in treated_units) {
    c_id <- mm[t_id, 1]
    if (!is.na(c_id)) {
      matched_pairs[[t_id]] <- c_id
    }
  }

  if (length(matched_pairs) == 0 && spec$expected_status == "EXPECTED_ZERO_MATCHES") {
    res$status <- "EXPECTED_ZERO_MATCHES"
  } else if (length(warnings_captured) > 0) {
    res$status <- "SUCCESS_WITH_WARNING"
  } else {
    res$status <- "SUCCESS"
  }

  discarded_units <- names(m_out$discarded)[m_out$discarded]
  if (is.null(discarded_units)) discarded_units <- character(0)

  weights_map <- as.list(m_out$weights)
  subclass_map <- as.list(ifelse(is.na(m_out$subclass), "UNMATCHED", as.character(m_out$subclass)))

  # Model extraction (GLM)
  glm_mod <- m_out$model
  coefs <- if (!is.null(glm_mod)) as.list(coef(glm_mod)) else list()
  converged <- if (!is.null(glm_mod)) glm_mod$converged else NA
  rank <- if (!is.null(glm_mod)) glm_mod$rank else NA
  aliased <- if (!is.null(glm_mod)) as.list(summary(glm_mod)$aliased) else list()
  mm_cols <- if (!is.null(glm_mod)) colnames(model.matrix(glm_mod)) else character(0)

  # Check factor contrasts
  contrasts_list <- list()
  if (!is.null(glm_mod) && !is.null(glm_mod$contrasts)) {
    for (cname in names(glm_mod$contrasts)) {
      contrasts_list[[cname]] <- glm_mod$contrasts[[cname]]
    }
  }

  res$matching <- list(
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

  # Cobalt Balance Diagnostics (both raw and std binary)
  extract_bal <- function(binary_mode) {
    if (res$matching$n_matched_pairs == 0) return(NULL)
    bal <- tryCatch({
      cobalt::bal.tab(m_out, un = TRUE, binary = binary_mode, s.d.denom = "treated")
    }, error = function(e) NULL)

    if (is.null(bal) || is.null(bal$Balance)) return(NULL)
    b_df <- as.data.frame(bal$Balance)
    raw_covs <- rownames(b_df)
    # Canonical covariate names (normalize distance_<num> to distance)
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

  res$cobalt_balance_raw <- extract_bal("raw")
  res$cobalt_balance_std <- extract_bal("std")

  all_results[[fid]] <- res
}

jsonlite::write_json(all_results, out_file, pretty = TRUE, auto_unbox = TRUE, null = "null", na = "string")
cat(sprintf("Native R execution completed: %d fixtures evaluated.\n", length(all_results)))
