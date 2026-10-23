#!/usr/bin/env Rscript

# Independent native-host oracle candidate. This file deliberately does not
# source the ClinicalPSM R template or import WebR/adapter reference values.
options(warn = 1)

abort <- function(...) stop(sprintf(...), call. = FALSE)
sha256_file <- function(path) {
  if (!file.exists(path)) abort("Missing file for SHA-256: %s", path)
  out <- system2("sha256sum", shQuote(path), stdout = TRUE, stderr = TRUE)
  status <- attr(out, "status")
  if (!is.null(status) && status != 0L) abort("sha256sum failed: %s", path)
  sub("\\s+.*$", "", out[[1L]])
}
sha256_text <- function(text) {
  path <- tempfile("cp-webr-native-oracle-text-")
  connection <- file(path, open = "wb")
  writeBin(charToRaw(enc2utf8(text)), connection)
  close(connection)
  on.exit(unlink(path), add = TRUE)
  sha256_file(path)
}
capture <- function(expr) {
  warnings <- character()
  value <- tryCatch(
    withCallingHandlers(expr, warning = function(w) {
      warnings <<- c(warnings, conditionMessage(w))
      invokeRestart("muffleWarning")
    }),
    error = function(e) structure(list(message = conditionMessage(e), class = class(e)), class = "oracle_error")
  )
  list(value = value, warnings = warnings)
}
as_json_safe <- function(x) {
  if (is.numeric(x)) {
    x[!is.finite(x)] <- NA_real_
    return(x)
  }
  if (is.list(x)) return(lapply(x, as_json_safe))
  x
}
named_numeric <- function(x) {
  if (is.null(x)) return(list())
  vals <- as.list(as.numeric(x))
  names(vals) <- names(x) %||% as.character(seq_along(vals))
  vals
}
`%||%` <- function(x, y) if (is.null(x)) y else x
scalar_or_null <- function(x) {
  if (is.null(x) || length(x) == 0L || (is.numeric(x) && !is.finite(x[[1L]])) || is.na(x[[1L]])) return(NULL)
  unname(x[[1L]])
}
vector_map <- function(x, ids) {
  if (is.null(x)) return(list())
  vals <- as.list(unname(x))
  names(vals) <- names(x) %||% ids[seq_along(vals)]
  vals
}
term_vars <- function(formula) {
  rhs <- strsplit(sub("^[^~]+~", "", formula), "\\+")[[1L]]
  trimws(rhs)
}
parse_output <- function(args) {
  if (length(args) != 2L || args[[1L]] != "--output") {
    abort("Usage: Rscript native_oracle.R --output <new-candidate-json-path>")
  }
  normalizePath(args[[2L]], mustWork = FALSE)
}

args <- commandArgs(trailingOnly = TRUE)
output_path <- parse_output(args)
if (file.exists(output_path)) abort("Refusing to overwrite existing candidate reference: %s", output_path)

root <- normalizePath(Sys.getenv("GITHUB_WORKSPACE", getwd()), mustWork = TRUE)
closure <- file.path(root, "experiments", "cp-webr-02-closure")
fixture_dir <- file.path(root, "experiments", "cp-webr-02a", "fixtures")
manifest_path <- file.path(fixture_dir, "fixtures_manifest.json")
manifest <- jsonlite::fromJSON(manifest_path, simplifyVector = FALSE)
source_manifest_path <- file.path(closure, "source-package-integrity.json")
source_manifest <- jsonlite::fromJSON(source_manifest_path, simplifyVector = FALSE)
fixture_integrity_path <- file.path(closure, "fixture-integrity.json")
fixture_integrity <- jsonlite::fromJSON(fixture_integrity_path, simplifyVector = FALSE)
lock_path <- file.path(closure, "renv.lock")
oracle_path <- file.path(closure, "native_oracle.R")
frozen_template_path <- file.path(root, "experiments", "cp-webr-02a", "adapter", "r_template.R")

if (manifest$fixture_count != 25L || length(manifest$fixtures) != 25L) abort("Expected exactly 25 preserved fixture entries")
if (as.character(getRversion()) != "4.6.0") abort("Native R 4.6.0 required, found %s", as.character(getRversion()))
if (as.character(utils::packageVersion("MatchIt")) != "4.8.1") abort("MatchIt 4.8.1 required")
if (as.character(utils::packageVersion("cobalt")) != "5.0.0") abort("cobalt 5.0.0 required")
if (!identical(sha256_file(lock_path), source_manifest$renv_lock_sha256)) abort("renv.lock hash mismatch")
if (length(source_manifest$packages) != source_manifest$package_count) abort("source package manifest count mismatch")
if (!identical(sha256_file(manifest_path), fixture_integrity$manifest_sha256)) abort("Preserved fixture manifest hash differs from the closure integrity pin")
if (length(fixture_integrity$fixtures) != 25L || fixture_integrity$fixture_count != 25L) abort("Closure fixture integrity pin must cover 25 entries")
for (pinned in fixture_integrity$fixtures) {
  csv_path <- file.path(fixture_dir, paste0(pinned$id, ".csv"))
  config_path <- file.path(fixture_dir, paste0(pinned$id, ".json"))
  if (!identical(sha256_file(csv_path), pinned$csv_sha256) || !identical(sha256_file(config_path), pinned$config_sha256)) {
    abort("Frozen fixture input hash mismatch: %s", pinned$id)
  }
}

read_fixture <- function(spec) {
  id <- spec$id
  csv <- file.path(fixture_dir, paste0(id, ".csv"))
  cfg <- file.path(fixture_dir, paste0(id, ".json"))
  if (!file.exists(csv) || !file.exists(cfg)) abort("Missing preserved CSV/config for %s", id)
  data <- utils::read.csv(csv, check.names = FALSE, stringsAsFactors = FALSE,
                          na.strings = "NA", colClasses = "character", strip.white = FALSE)
  config <- jsonlite::fromJSON(cfg, simplifyVector = FALSE)
  data[] <- lapply(data, function(column) {
    text <- as.character(column)
    observed <- text[!is.na(text) & nzchar(trimws(text))]
    suppressWarnings(observed_num <- as.numeric(observed))
    is_numeric <- length(observed) > 0L && all(is.finite(observed_num))
    if (is_numeric) {
      suppressWarnings(num <- as.numeric(text))
      num[!is.na(text) & !nzchar(trimws(text))] <- NA_real_
      num
    } else text
  })
  if (!"id" %in% names(data)) abort("Fixture %s has no explicit id column", id)
  # Preserve the actual id column exactly. Duplicate IDs are an expected
  # product-policy rejection fixture, so give only that invalid input unique
  # temporary R row names; it returns before any model is fitted.
  source_ids <- as.character(data$id)
  rownames(data) <- if (anyDuplicated(source_ids)) paste0("input_row_", seq_along(source_ids)) else source_ids
  list(data = data, config = config, csv = csv, config_path = cfg)
}

make_native_factors <- function(data, config, id) {
  refs <- config$extra_meta$factor_ref %||% list()
  covs <- term_vars(config$formula)
  factor_meta <- list()
  for (variable in covs) {
    value <- data[[variable]]
    if (is.null(value)) abort("%s formula variable is absent: %s", id, variable)
    if (is.character(value)) {
      observed <- unique(value[!is.na(value)])
      levels <- if (id %in% c("fix_02_mixed_types", "fix_03_ref_level_change") && variable == "x_cat") {
        c("low", "med", "high")
      } else sort(observed, method = "radix")
      reference <- refs[[variable]] %||% if (length(levels)) levels[[1L]] else NULL
      data[[variable]] <- factor(value, levels = levels)
      if (!is.null(reference) && reference %in% levels) data[[variable]] <- stats::relevel(data[[variable]], ref = reference)
      contrast_matrix <- stats::contrasts(data[[variable]])
      contrast_values <- lapply(seq_len(ncol(contrast_matrix)), function(column) as.list(unname(contrast_matrix[, column])))
      names(contrast_values) <- colnames(contrast_matrix)
      factor_meta[[variable]] <- list(
        declared_levels = levels,
        effective_factor_levels = levels(data[[variable]]),
        reference_level = reference,
        contrasts = as.list(contrast_matrix),
        contrast_row_levels = rownames(contrast_matrix),
        contrast_matrix = contrast_values,
        contrast_columns = colnames(contrast_matrix)
      )
    } else if (is.factor(value)) {
      contrast_matrix <- stats::contrasts(value)
      contrast_values <- lapply(seq_len(ncol(contrast_matrix)), function(column) as.list(unname(contrast_matrix[, column])))
      names(contrast_values) <- colnames(contrast_matrix)
      factor_meta[[variable]] <- list(declared_levels = levels(value), effective_factor_levels = levels(value), reference_level = levels(value)[[1L]],
        contrasts = as.list(contrast_matrix), contrast_row_levels = rownames(contrast_matrix),
        contrast_matrix = contrast_values, contrast_columns = colnames(contrast_matrix))
    }
  }
  list(data = data, factor_metadata = factor_meta)
}

extract_balance <- function(fit, binary_mode) {
  result <- cobalt::bal.tab(fit, s.d.denom = "treated", binary = binary_mode, un = TRUE)
  tab <- result$Balance
  if (is.null(tab) || !nrow(tab)) return(list(rows = list(), cobalt_class = class(result), balance_columns = character()))
  rows <- lapply(seq_len(nrow(tab)), function(i) {
    row <- tab[i, , drop = FALSE]
    cells <- lapply(names(row), function(nm) scalar_or_null(row[[nm]]))
    names(cells) <- names(row)
    c(list(term = rownames(tab)[[i]]), cells)
  })
  names(rows) <- rownames(tab)
  list(rows = rows, cobalt_class = class(result), balance_columns = names(tab))
}

native_fixture <- function(spec) {
  id <- spec$id
  read <- read_fixture(spec)
  data <- read$data
  row_ids <- as.character(data$id)
  ids_unique <- !anyDuplicated(trimws(row_ids)) && all(nzchar(trimws(row_ids)))
  expected <- spec$expected_status
  product_policy <- switch(id,
    fix_19_missing_values = list(status = "FAIL_CLOSED_MISSING_COVARIATE_REQUIRED", basis = "current adapter rejects missing covariates before R"),
    fix_19b_missing_treatment = list(status = "FAIL_CLOSED_MISSING_TREATMENT_REQUIRED", basis = "current adapter rejects missing treatment before R"),
    fix_20_malformed_category = list(status = "REJECT_BLANK_OR_UNLISTED_CATEGORICAL_OBSERVATIONS", basis = "historical manifest SUCCESS is retained; current adapter policy rejects blank/unlisted values"),
    fix_24_duplicate_ids = list(status = "REJECT_DUPLICATE_UNIT_IDS_BEFORE_COMPUTATION", basis = "current adapter rejects duplicate IDs before R"),
    fix_23_no_eligible_match = list(status = "ZERO_MATCHES_MUST_FAIL_SAFELY", basis = "zero-match application outcome is not a numeric match matrix"),
    list(status = "APPLY_MANIFEST_AND_WARNING_POLICY", basis = "preserved fixture classification")
  )
  base <- list(
    id = id,
    manifest_expected_status = expected,
    native_classification = NULL,
    product_policy = product_policy,
    fixture_sha256 = list(csv = sha256_file(read$csv), config = sha256_file(read$config_path)),
    input_identity = list(row_count = nrow(data), row_ids = row_ids, ids_unique_nonblank = ids_unique,
                          treatment_values = as.list(data[["treat"]] %||% numeric()),
                          semantic_covariate_names = term_vars(read$config$formula)),
    configuration = list(formula = read$config$formula, method = read$config$method,
      distance = read$config$distance, link = read$config$link, ratio = read$config$ratio,
      replace = read$config$replace, m_order = read$config$m_order,
      caliper = scalar_or_null(read$config$caliper), std_caliper = read$config$std_caliper,
      discard = read$config$discard, estimand = "ATT")
  )

  if (identical(id, "fix_24_duplicate_ids")) {
    base$native_classification <- "NOT_RUN_PRODUCT_POLICY_REJECTION"
    base$native_execution <- list(status = "NOT_RUN", reason = "duplicate IDs are rejected by ClinicalPSM before computation; no native result is used to waive that input policy")
    return(base)
  }

  factorized <- make_native_factors(data, read$config, id)
  data <- factorized$data
  formula <- stats::as.formula(read$config$formula)
  glm_capture <- capture(stats::glm(formula, data = data, family = stats::binomial(link = "logit")))
  glm_fit <- glm_capture$value
  if (inherits(glm_fit, "oracle_error")) {
    base$native_classification <- if (grepl("missing|NA", glm_fit$message, ignore.case = TRUE)) "NATIVE_GLM_ERROR_MISSINGNESS_OBSERVED" else "NATIVE_GLM_ERROR"
    base$native_execution <- list(status = "ERROR", stage = "stats::glm", message = glm_fit$message,
                                  condition_class = glm_fit$class, warnings = glm_capture$warnings,
                                  product_policy_classification = product_policy$status)
    return(base)
  }

  coefficients <- stats::coef(glm_fit)
  coefficient_table <- summary(glm_fit)$coefficients
  max_standard_error <- if ("Std. Error" %in% colnames(coefficient_table)) suppressWarnings(max(coefficient_table[, "Std. Error"], na.rm = TRUE)) else NA_real_
  max_absolute_coefficient <- if ("Estimate" %in% colnames(coefficient_table)) suppressWarnings(max(abs(coefficient_table[, "Estimate"]), na.rm = TRUE)) else NA_real_
  coefficient_names <- names(coefficients)
  glm_coefficients <- lapply(coefficient_names, function(term) {
    if (is.na(coefficients[[term]]) || !term %in% rownames(coefficient_table)) {
      return(list(term = term, estimate = NULL, standard_error = NULL, z_value = NULL, p_value = NULL, aliased = TRUE))
    }
    row <- coefficient_table[term, ]
    list(term = term, estimate = unname(row[["Estimate"]]), standard_error = unname(row[["Std. Error"]]),
         z_value = unname(row[["z value"]]), p_value = unname(row[["Pr(>|z|)"]]), aliased = FALSE)
  })
  names(glm_coefficients) <- coefficient_names
  prediction_capture <- capture(list(
    linear_logits = stats::predict(glm_fit, type = "link"),
    propensity_scores = stats::predict(glm_fit, type = "response")
  ))

  match_args <- list(formula = formula, data = data, method = read$config$method,
                     distance = read$config$distance, link = read$config$link,
                     estimand = "ATT", m.order = read$config$m_order,
                     replace = read$config$replace, ratio = read$config$ratio,
                     std.caliper = isTRUE(read$config$std_caliper),
                     discard = read$config$discard %||% "none")
  if (is.numeric(read$config$caliper) && length(read$config$caliper)) {
    match_args$caliper <- read$config$caliper
  }
  match_capture <- capture(do.call(MatchIt::matchit, match_args))
  match_fit <- match_capture$value
  if (inherits(match_fit, "oracle_error")) {
    base$native_classification <- if (identical(id, "fix_23_no_eligible_match")) "NATIVE_ZERO_MATCH_ERROR" else "NATIVE_MATCHIT_ERROR"
    base$native_execution <- list(status = "ERROR", stage = "MatchIt::matchit", message = match_fit$message,
      condition_class = match_fit$class, warnings = c(glm_capture$warnings, match_capture$warnings),
      glm = list(converged = isTRUE(glm_fit$converged), coefficients = glm_coefficients,
                 factor_contrasts = factorized$factor_metadata))
    return(base)
  }

  matrix <- match_fit$match.matrix
  pairs <- list()
  if (!is.null(matrix) && length(matrix) && nrow(matrix) > 0L) {
    for (i in seq_len(nrow(matrix))) {
      treated_id <- rownames(matrix)[[i]]
      control_id <- as.character(matrix[i, 1L])
      if (!is.na(control_id) && nzchar(control_id)) pairs[[treated_id]] <- control_id
    }
  }
  weights <- match_fit$weights
  subclasses <- if (!is.null(match_fit$subclass)) as.integer(as.character(match_fit$subclass)) else rep(NA_integer_, nrow(data))
  if (is.null(names(subclasses))) names(subclasses) <- rownames(data)
  distance <- match_fit$distance
  if (!is.null(distance) && is.null(names(distance))) names(distance) <- rownames(data)
  pair_distance <- lapply(names(pairs), function(treated_id) {
    control_id <- pairs[[treated_id]]
    if (is.null(distance) || is.null(names(distance)) || !treated_id %in% names(distance) || !control_id %in% names(distance)) return(NULL)
    abs(unname(distance[[treated_id]]) - unname(distance[[control_id]]))
  })
  names(pair_distance) <- names(pairs)
  bal_raw <- capture(extract_balance(match_fit, "raw"))
  bal_std <- capture(extract_balance(match_fit, "std"))
  n_treated <- sum(data$treat == 1, na.rm = TRUE)
  n_control <- sum(data$treat == 0, na.rm = TRUE)
  matched_treated <- length(pairs)
  matched_control_ids <- unname(unlist(pairs, use.names = FALSE))
  complete_rows <- if ("treat" %in% names(data)) sum(stats::complete.cases(data[c("treat", term_vars(read$config$formula))])) else nrow(data)
  discarded <- match_fit$discarded
  discarded_treated <- if (!is.null(discarded)) sum(discarded & data$treat == 1, na.rm = TRUE) else 0L
  discarded_control <- if (!is.null(discarded)) sum(discarded & data$treat == 0, na.rm = TRUE) else 0L
  matched_weights <- sum(weights > 0, na.rm = TRUE)
  unmatched_treated <- max(0L, n_treated - matched_treated - discarded_treated)
  unmatched_control <- max(0L, n_control - length(unique(matched_control_ids)) - discarded_control)

  rubin_b <- NULL
  rubin_r <- NULL
  lp <- prediction_capture$value$linear_logits
  if (!inherits(prediction_capture$value, "oracle_error") && length(pairs) > 1L && length(lp) == nrow(data)) {
    names(lp) <- rownames(data) %||% row_ids
    matched_ids <- unique(c(names(pairs), matched_control_ids))
    treated_lp_all <- lp[data$treat == 1]
    control_lp_all <- lp[data$treat == 0]
    treated_lp_matched <- lp[data$treat == 1 & rownames(data) %in% matched_ids]
    control_lp_matched <- lp[data$treat == 0 & rownames(data) %in% matched_ids]
    pooled_var <- (stats::var(treated_lp_all) + stats::var(control_lp_all)) / 2
    if (is.finite(pooled_var) && pooled_var > 0) rubin_b <- abs(mean(treated_lp_matched) - mean(control_lp_matched)) / sqrt(pooled_var)
    control_var <- stats::var(control_lp_matched)
    if (is.finite(control_var) && control_var > 0) rubin_r <- stats::var(treated_lp_matched) / control_var
  }

  warnings <- list(glm = glm_capture$warnings, matchit = match_capture$warnings,
                   cobalt_raw = if (inherits(bal_raw$value, "oracle_error")) bal_raw$value$message else bal_raw$warnings,
                   cobalt_std = if (inherits(bal_std$value, "oracle_error")) bal_std$value$message else bal_std$warnings)
  zero_matches <- length(pairs) == 0L
  base$native_classification <- if (identical(id, "fix_23_no_eligible_match") && zero_matches) "NATIVE_ZERO_MATCH_RESULT" else if (length(unlist(warnings)) > 0L) "NATIVE_SUCCESS_WITH_WARNINGS" else "NATIVE_SUCCESS"
  base$native_execution <- list(
    status = if (zero_matches) "ZERO_MATCHES" else "SUCCESS",
    official_functions = c("stats::glm", "MatchIt::matchit", "cobalt::bal.tab(binary=raw)", "cobalt::bal.tab(binary=std)"),
    input_identity = list(row_ids = row_ids, treatment = as.list(data$treat), row_id_order_sha256 = sha256_text(paste(row_ids, collapse = "\n")),
                          model_frame_row_ids = as.list(rownames(stats::model.frame(glm_fit))),
                          omitted_row_ids = setdiff(row_ids, rownames(stats::model.frame(glm_fit)))),
    factor_reference_and_contrasts = factorized$factor_metadata,
    glm = list(converged = isTRUE(glm_fit$converged), iterations = glm_fit$iter,
      rank = glm_fit$rank, model_matrix_columns = colnames(stats::model.matrix(glm_fit)), aliased_terms = names(which(is.na(coefficients))),
      coefficients = glm_coefficients, maximum_standard_error = scalar_or_null(max_standard_error),
      maximum_absolute_coefficient = scalar_or_null(max_absolute_coefficient),
      linear_logits = vector_map(prediction_capture$value$linear_logits, row_ids),
      propensity_scores = vector_map(prediction_capture$value$propensity_scores, row_ids),
      null_deviance = scalar_or_null(glm_fit$null.deviance), residual_deviance = scalar_or_null(glm_fit$deviance)),
    matchit = list(configuration = match_args, distances = vector_map(distance, names(distance) %||% row_ids),
      ordered_matched_pairs = pairs, pair_distances = pair_distance,
      effective_caliper_width_raw = scalar_or_null(match_fit$caliper),
      weights = vector_map(weights, row_ids), subclasses = vector_map(subclasses, row_ids),
      matched_rows = matched_weights,
      sample_accounting = list(imported_total = nrow(data), complete_cases = complete_rows,
        treated_total = n_treated, control_total = n_control, matched_pair_count = length(pairs),
        matched_control_count = length(unique(matched_control_ids)), unmatched_treated_count = unmatched_treated,
        unmatched_control_count = unmatched_control, discarded_treated_count = discarded_treated,
        discarded_control_count = discarded_control)),
    cobalt = list(raw = if (inherits(bal_raw$value, "oracle_error")) list(error = bal_raw$value$message) else bal_raw$value,
                  standardized = if (inherits(bal_std$value, "oracle_error")) list(error = bal_std$value$message) else bal_std$value),
    diagnostics = list(rubin_b = rubin_b, rubin_r = rubin_r,
      missing_semantics = "non-finite/unavailable numeric values serialized as JSON null; never coerced to zero"),
    warnings = warnings,
    native_vs_product_interpretation = list(
      native_observation = if (identical(id, "fix_20_malformed_category")) "native R factor handling recorded independently; product policy still rejects blank/unlisted categories" else base$native_classification,
      product_policy_status = product_policy$status,
      historical_manifest_status = expected)
  )
  base
}

if (!requireNamespace("jsonlite", quietly = TRUE)) abort("jsonlite is required")
fixtures <- lapply(manifest$fixtures, native_fixture)
if (length(fixtures) != 25L || anyDuplicated(vapply(fixtures, `[[`, character(1L), "id"))) abort("Native oracle did not produce 25 unique fixture entries")
session <- capture.output(utils::sessionInfo())
candidate <- list(
  schema_version = 1L,
  evidence_class = "CANDIDATE_NATIVE_GOLDEN_PENDING_INDEPENDENT_RED_TEAM_ACCEPTANCE",
  status = "CANDIDATE_GENERATED",
  generated_at_utc = format(Sys.time(), tz = "UTC", usetz = TRUE),
  commit_sha = Sys.getenv("GITHUB_SHA", "LOCAL_UNCOMMITTED"),
  provenance = list(
    oracle_source_path = "experiments/cp-webr-02-closure/native_oracle.R",
    oracle_source_sha256 = sha256_file(oracle_path),
    frozen_template_sha256 = sha256_file(frozen_template_path),
    fixture_manifest_path = "experiments/cp-webr-02a/fixtures/fixtures_manifest.json",
    fixture_manifest_sha256 = sha256_file(manifest_path),
    fixture_integrity_sha256 = sha256_file(fixture_integrity_path),
    renv_lock_sha256 = sha256_file(lock_path),
    source_package_manifest_sha256 = sha256_file(source_manifest_path),
    source_package_manifest = source_manifest,
    rscript_version = R.version$version.string,
    r_version = as.character(getRversion()),
    package_versions = list(MatchIt = as.character(utils::packageVersion("MatchIt")), cobalt = as.character(utils::packageVersion("cobalt")), jsonlite = as.character(utils::packageVersion("jsonlite"))),
    session_info = session,
    blas = sub("^BLAS:\\s*", "", grep("^BLAS:", session, value = TRUE)[1L] %||% NA_character_),
    lapack = sub("^LAPACK:\\s*", "", grep("^LAPACK:", session, value = TRUE)[1L] %||% NA_character_),
    locale = Sys.getlocale(),
    timezone = Sys.timezone(),
    fixture_inputs = lapply(fixtures, function(f) list(id = f$id, csv_sha256 = f$fixture_sha256$csv, config_sha256 = f$fixture_sha256$config)),
    reference_origin = "generated from preserved fixture CSV/config using native-host official R packages; no ClinicalPSM template, adapter, or WebR golden values imported"
  ),
  fixture_count = length(fixtures),
  tolerances = list(
    source = "CP-WEBR-02A-R1.2a-TEST-CONTRACT §4: eps <= 1e-4 for approved numeric parity families; exact identity for IDs, factors, pairs, integer accounting and weights; no tolerance relaxation after results",
    model_coefficients = 1e-4,
    glm_diagnostic_values = list(value = 1e-4, justification = "preregistered before parity evaluation from CP-WEBR-02A R1.2a's global eps <= 1e-4 constraint for native glm deviance and derived coefficient diagnostics"),
    propensity_scores_and_linear_logits = 1e-4,
    matching_distances_and_pair_distances = 1e-4,
    cobalt_smd_raw_difference_and_variance_ratio = 1e-4,
    rubin_b_r = list(value = 1e-4, justification = "preregistered from CP-WEBR-02A R1.2a's global eps <= 1e-4 constraint for this 02A fixture family; the separate E1 demo tolerance 0.001 is not applied"),
    matching_weights = "exact structural equality (weights are keyed identities; existing 02A contract requires exact weight parity)",
    rubin_diagnostics = "compared with preregistered rubin_b_r tolerance above when both values are finite; undefined values must remain JSON null"
  ),
  fixtures = fixtures
)
dir.create(dirname(output_path), recursive = TRUE, showWarnings = FALSE)
jsonlite::write_json(as_json_safe(candidate), output_path, auto_unbox = TRUE, pretty = TRUE,
                     null = "null", na = "null", digits = NA)
cat("Candidate native oracle written (not frozen): ", output_path, "\n", sep = "")
cat("Candidate fixture count: ", length(fixtures), "\n", sep = "")
cat("Oracle SHA-256: ", candidate$provenance$oracle_source_sha256, "\n", sep = "")
cat("Manifest SHA-256: ", candidate$provenance$fixture_manifest_sha256, "\n", sep = "")
