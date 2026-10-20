# CP-WEBR-02A Trusted Static R Computation Template
# Pinned to: R 4.6.0, MatchIt 4.8.1, cobalt 5.0.0
# Governing standard: docs/science/CP-WEBR-01-CANONICAL-RESULT-CONTRACT.md

run_psm_analysis <- function(df, trt_name, cov_names, caliper_val = NULL, std_caliper = TRUE) {
  # 1. Validation & Formula Construction
  if (!trt_name %in% names(df)) {
    stop(paste("Treatment column not found in data frame:", trt_name))
  }
  for (cov in cov_names) {
    if (!cov %in% names(df)) {
      stop(paste("Covariate column not found in data frame:", cov))
    }
  }

  trt_vec <- df[[trt_name]]
  u_trt <- sort(unique(trt_vec[!is.na(trt_vec)]))
  if (!all(u_trt %in% c(0, 1))) {
    stop(paste("Treatment must be binary indicator with values in {0, 1}. Observed:", paste(u_trt, collapse = ", ")))
  }

  # Build formula safely using stats::reformulate
  formula_psm <- stats::reformulate(termlabels = cov_names, response = trt_name)

  # 2. Logistic GLM Model Fitting
  glm_fit <- stats::glm(
    formula = formula_psm,
    family = stats::binomial(link = "logit"),
    data = df
  )

  glm_summary <- summary(glm_fit)
  glm_converged <- isTRUE(glm_fit$converged)
  glm_iter <- as.integer(glm_fit$iter)
  glm_null_dev <- as.numeric(glm_fit$null.deviance)
  glm_res_dev <- as.numeric(glm_fit$deviance)

  # Extract coefficients table
  coef_mat <- glm_summary$coefficients
  coef_terms <- rownames(coef_mat)
  coef_table <- list()
  for (i in seq_along(coef_terms)) {
    term_name <- coef_terms[i]
    coef_table[[i]] <- list(
      term = term_name,
      estimate = as.numeric(coef_mat[i, "Estimate"]),
      standardError = as.numeric(coef_mat[i, "Std. Error"]),
      zValue = as.numeric(coef_mat[i, "z value"]),
      pValue = as.numeric(coef_mat[i, "Pr(>|z|)"]),
      aliased = FALSE
    )
  }

  # Check for aliased/dropped terms
  aliased_terms <- if (!is.null(glm_summary$aliased) && is.logical(glm_summary$aliased)) {
    names(which(glm_summary$aliased))
  } else if (!is.null(coef(glm_fit))) {
    names(which(is.na(coef(glm_fit))))
  } else {
    character(0)
  }
  for (at in aliased_terms) {
    coef_table[[length(coef_table) + 1]] <- list(
      term = at,
      estimate = NULL,
      standardError = NULL,
      zValue = NULL,
      pValue = NULL,
      aliased = TRUE
    )
  }

  # Linear logit predictors and response probabilities
  lp <- as.numeric(stats::predict(glm_fit, type = "link"))
  ps <- as.numeric(stats::predict(glm_fit, type = "response"))

  # Separation symptoms detection (CP-WEBR-01 §3.2)
  # Note: Algorithmic convergence (deviance delta < 1e-8) is decoupled from mathematical separation!
  max_se <- max(coef_mat[, "Std. Error"], na.rm = TRUE)
  max_abs_beta <- max(abs(coef_mat[, "Estimate"]), na.rm = TRUE)
  has_extreme_se <- max_se > 1000
  has_boundary_ps <- any(ps < 1e-6 | ps > (1 - 1e-6), na.rm = TRUE)
  suspected_separation <- has_extreme_se || (has_boundary_ps && max_se > 500)

  # 3. MatchIt 1:1 Nearest-Neighbor Matching
  caliper_arg <- if (!is.null(caliper_val) && !is.na(caliper_val)) as.numeric(caliper_val) else NULL
  std_caliper_bool <- isTRUE(std_caliper)

  m_out <- MatchIt::matchit(
    formula = formula_psm,
    data = df,
    method = "nearest",
    distance = "glm",
    link = "linear.logit",
    estimand = "ATT",
    m.order = "largest",
    replace = FALSE,
    ratio = 1,
    caliper = caliper_arg,
    std.caliper = std_caliper_bool
  )

  weights <- as.numeric(m_out$weights)
  subclasses <- if (!is.null(m_out$subclass)) {
    as.integer(as.character(m_out$subclass))
  } else {
    rep(NA_integer_, nrow(df))
  }

  # Match matrix parsing
  mm <- m_out$match.matrix
  treated_row_names <- rownames(mm)
  matched_treated_ids <- character(0)
  matched_control_ids <- character(0)
  pair_distances <- numeric(0)

  if (!is.null(mm) && nrow(mm) > 0) {
    for (i in seq_len(nrow(mm))) {
      tr_id <- treated_row_names[i]
      ctrl_id <- mm[i, 1]
      if (!is.na(ctrl_id)) {
        matched_treated_ids <- c(matched_treated_ids, tr_id)
        matched_control_ids <- c(matched_control_ids, ctrl_id)
        pair_dist <- if (!is.null(names(lp)) && tr_id %in% names(lp) && ctrl_id %in% names(lp)) {
          as.numeric(abs(lp[tr_id] - lp[ctrl_id]))
        } else {
          NA_real_
        }
        pair_distances <- c(pair_distances, pair_dist)
      }
    }
  }

  total_matched_pairs <- length(matched_treated_ids)

  # Sample accounting
  total_units <- nrow(df)
  total_treated <- sum(trt_vec == 1, na.rm = TRUE)
  total_control <- sum(trt_vec == 0, na.rm = TRUE)
  matched_treated_count <- total_matched_pairs
  matched_control_count <- length(unique(matched_control_ids))
  unmatched_treated_count <- total_treated - matched_treated_count
  unmatched_control_count <- total_control - matched_control_count
  discarded_treated_count <- if (!is.null(m_out$discarded)) sum(m_out$discarded[trt_vec == 1]) else 0
  discarded_control_count <- if (!is.null(m_out$discarded)) sum(m_out$discarded[trt_vec == 0]) else 0
  treated_retention_rate <- if (total_treated > 0) matched_treated_count / total_treated else 0.0

  # 4. cobalt Balance Diagnostics (ATT, binary raw vs std distinguishable)
  bal_raw <- cobalt::bal.tab(m_out, s.d.denom = "treated", binary = "raw", un = TRUE)
  bal_std <- cobalt::bal.tab(m_out, s.d.denom = "treated", binary = "std", un = TRUE)

  bal_table_raw <- bal_raw$Balance
  bal_table_std <- bal_std$Balance

  balance_rows <- list()
  cov_row_names <- rownames(bal_table_raw)

  for (rn in cov_row_names) {
    if (rn == "distance") next

    raw_row <- bal_table_raw[rn, ]
    std_row <- bal_table_std[rn, ]

    is_binary <- if ("Type" %in% names(raw_row)) grepl("Bin", raw_row[["Type"]]) else FALSE

    unadj_diff <- if (is_binary) as.numeric(raw_row[["Diff.Un"]]) else as.numeric(std_row[["Diff.Un"]])
    adj_diff <- if (is_binary) as.numeric(raw_row[["Diff.Adj"]]) else as.numeric(std_row[["Diff.Adj"]])

    vr_un <- if ("V.Ratio.Un" %in% names(std_row) && !is.na(std_row[["V.Ratio.Un"]])) as.numeric(std_row[["V.Ratio.Un"]]) else NULL
    vr_adj <- if ("V.Ratio.Adj" %in% names(std_row) && !is.na(std_row[["V.Ratio.Adj"]])) as.numeric(std_row[["V.Ratio.Adj"]]) else NULL

    smd_red <- if (!is.na(unadj_diff) && unadj_diff != 0 && !is.na(adj_diff)) {
      (1 - abs(adj_diff) / abs(unadj_diff)) * 100
    } else {
      NULL
    }

    # Heuristic balance status
    h_status <- "balanced_smd_and_vr"
    abs_smd <- abs(adj_diff)
    if (is.na(abs_smd) || abs_smd > 0.20) {
      h_status <- "imbalanced_smd"
    } else if (abs_smd > 0.10) {
      h_status <- "borderline_smd"
    } else if (!is.null(vr_adj) && !is.na(vr_adj) && (vr_adj < 0.5 || vr_adj > 2.0)) {
      h_status <- "residual_variance_disparity"
    }

    balance_rows[[length(balance_rows) + 1]] <- list(
      covariateName = rn,
      type = if (is_binary) "binary" else "continuous",
      unadjustedTreatedMean = if ("M.0.Un" %in% names(raw_row) && "M.1.Un" %in% names(raw_row)) as.numeric(raw_row[["M.1.Un"]]) else NULL,
      unadjustedControlMean = if ("M.0.Un" %in% names(raw_row) && "M.1.Un" %in% names(raw_row)) as.numeric(raw_row[["M.0.Un"]]) else NULL,
      matchedTreatedMean = if ("M.0.Adj" %in% names(raw_row) && "M.1.Adj" %in% names(raw_row)) as.numeric(raw_row[["M.1.Adj"]]) else NULL,
      matchedControlMean = if ("M.0.Adj" %in% names(raw_row) && "M.1.Adj" %in% names(raw_row)) as.numeric(raw_row[["M.0.Adj"]]) else NULL,
      unadjustedSmd = as.numeric(std_row[["Diff.Un"]]),
      rawDifferenceUnadjusted = if (is_binary) as.numeric(raw_row[["Diff.Un"]]) else NULL,
      matchedSmd = as.numeric(std_row[["Diff.Adj"]]),
      rawDifferenceMatched = if (is_binary) as.numeric(raw_row[["Diff.Adj"]]) else NULL,
      smdReductionPercent = smd_red,
      unadjustedVarianceRatio = vr_un,
      matchedVarianceRatio = vr_adj,
      heuristicStatus = h_status
    )
  }

  # 5. Rubin's B and Rubin's R
  rubin_b <- NULL
  rubin_r <- NULL
  if (total_matched_pairs > 1) {
    matched_mask <- weights > 0
    lp_t_adj <- lp[matched_mask & trt_vec == 1]
    lp_c_adj <- lp[matched_mask & trt_vec == 0]
    lp_t_unadj <- lp[trt_vec == 1]
    lp_c_unadj <- lp[trt_vec == 0]

    var_t_unadj <- stats::var(lp_t_unadj, na.rm = TRUE)
    var_c_unadj <- stats::var(lp_c_unadj, na.rm = TRUE)
    pooled_var <- (var_t_unadj + var_c_unadj) / 2

    if (!is.na(pooled_var) && pooled_var > 0) {
      rubin_b <- as.numeric(abs(mean(lp_t_adj, na.rm = TRUE) - mean(lp_c_adj, na.rm = TRUE)) / sqrt(pooled_var))
    }

    var_t_adj <- stats::var(lp_t_adj, na.rm = TRUE)
    var_c_adj <- stats::var(lp_c_adj, na.rm = TRUE)
    if (!is.na(var_c_adj) && var_c_adj > 0) {
      rubin_r <- as.numeric(var_t_adj / var_c_adj)
    }
  }

  # 6. Publication Status & Warnings Ledger
  warnings_ledger <- list()
  publication_reasons <- character(0)
  verdict <- "OUTPUT_READY"

  if (suspected_separation) {
    warnings_ledger[[length(warnings_ledger) + 1]] <- list(
      code = "WARN_SUSPECTED_SEPARATION",
      message = "Suspected complete or quasi-complete separation in propensity model: extreme coefficients or standard errors observed.",
      severity = "fatal",
      impactDescription = "Propensity scores collapse to boundaries; model coefficients unstable. Publication output restricted."
    )
    publication_reasons <- c(publication_reasons, "Suspected complete separation: numerical instability prevents certified publication.")
    verdict <- "OUTPUT_GENERATION_RESTRICTED"
  }

  if (length(aliased_terms) > 0) {
    warnings_ledger[[length(warnings_ledger) + 1]] <- list(
      code = "WARN_RANK_DEFICIENT",
      message = paste("Rank deficient design matrix: dropped collinear terms:", paste(aliased_terms, collapse = ", ")),
      severity = "warning",
      impactDescription = "Covariate collinearity detected."
    )
    publication_reasons <- c(publication_reasons, "Rank deficiency in design matrix.")
    verdict <- "OUTPUT_GENERATION_RESTRICTED"
  }

  if (total_matched_pairs == 0) {
    warnings_ledger[[length(warnings_ledger) + 1]] <- list(
      code = "WARN_OFF_SUPPORT",
      message = "Zero eligible matched pairs found within support / caliper bounds.",
      severity = "fatal",
      impactDescription = "No matched sample could be formed."
    )
    publication_reasons <- c(publication_reasons, "Zero eligible matched pairs.")
    verdict <- "OUTPUT_GENERATION_RESTRICTED"
  } else if (treated_retention_rate < 0.50) {
    warnings_ledger[[length(warnings_ledger) + 1]] <- list(
      code = "WARN_CALIPER_ATTRITION",
      message = paste0("Over 50% of treated units discarded (retention rate: ", sprintf("%.1f%%", treated_retention_rate * 100), ")."),
      severity = "warning",
      impactDescription = "Substantial sample reduction may limit generalizability of ATT estimand."
    )
  }

  list(
    glm = list(
      converged = glm_converged,
      iter = glm_iter,
      nullDeviance = glm_null_dev,
      residualDeviance = glm_res_dev,
      maxAbsoluteCoefficient = max_abs_beta,
      maxCoefficientStandardError = max_se,
      coefficients = coef_table,
      linearLogits = lp,
      propensityScores = ps
    ),
    matching = list(
      totalMatchedPairs = total_matched_pairs,
      matchedTreatedIds = matched_treated_ids,
      matchedControlIds = matched_control_ids,
      pairDistances = pair_distances,
      weights = weights,
      subclasses = subclasses
    ),
    sampleAccounting = list(
      importedTotal = total_units,
      completeCases = total_units,
      treatedTotal = total_treated,
      controlTotal = total_control,
      matchedTreatedCount = matched_treated_count,
      matchedControlCount = matched_control_count,
      unmatchedTreatedCount = unmatched_treated_count,
      unmatchedControlCount = unmatched_control_count,
      discardedTreatedCount = discarded_treated_count,
      discardedControlCount = discarded_control_count,
      treatedRetentionRate = treated_retention_rate
    ),
    balanceTable = balance_rows,
    rubin = list(
      b = rubin_b,
      r = rubin_r
    ),
    publicationStatus = list(
      verdict = verdict,
      reasons = publication_reasons,
      outputGenerationAllowed = (verdict == "OUTPUT_READY")
    ),
    warnings = warnings_ledger,
    suspectedSeparation = suspected_separation
  )
}
