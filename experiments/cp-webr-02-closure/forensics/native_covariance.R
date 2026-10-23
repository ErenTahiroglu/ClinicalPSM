#!/usr/bin/env Rscript

# Diagnostic-only native R covariance and separation evidence. This does not
# source the ClinicalPSM template and does not generate or update a reference.
options(warn = 1, digits = 17)

abort <- function(...) stop(sprintf(...), call. = FALSE)
sha256_file <- function(path) {
  if (!file.exists(path)) abort("Missing file for SHA-256: %s", path)
  out <- system2("sha256sum", shQuote(path), stdout = TRUE, stderr = TRUE)
  status <- attr(out, "status")
  if (!is.null(status) && status != 0L) abort("sha256sum failed: %s", path)
  sub("\\s+.*$", "", out[[1L]])
}
parse_args <- function(args) {
  result <- list(output = NULL, replicate = NULL)
  while (length(args)) {
    key <- args[[1L]]
    args <- args[-1L]
    if (!length(args)) abort("Missing value for %s", key)
    if (key == "--output") result$output <- args[[1L]]
    else if (key == "--replicate") result$replicate <- as.integer(args[[1L]])
    else abort("Unknown argument: %s", key)
    args <- args[-1L]
  }
  if (is.null(result$output) || is.null(result$replicate) || result$replicate < 1L) {
    abort("Usage: Rscript native_covariance.R --output <new-json> --replicate <positive-integer>")
  }
  result
}
json_numeric <- function(x) {
  if (is.null(x)) return(NULL)
  if (is.matrix(x)) return(lapply(seq_len(nrow(x)), function(i) as.list(unname(x[i, , drop = TRUE]))))
  if (is.data.frame(x)) return(lapply(seq_len(nrow(x)), function(i) as.list(x[i, , drop = FALSE])))
  if (length(x) == 1L) return(unname(x[[1L]]))
  as.list(unname(x))
}
named_values <- function(x) {
  if (is.null(x)) return(NULL)
  list(names = names(x), values = json_numeric(unname(x)),
       decimal17 = if (is.numeric(x)) as.list(ifelse(is.finite(x), sprintf("%.17g", x), NA_character_)) else NULL)
}
matrix_record <- function(x, row_names = rownames(x), col_names = colnames(x)) {
  list(row_names = row_names, column_names = col_names,
       values = lapply(seq_len(nrow(x)), function(i) as.list(unname(x[i, , drop = TRUE]))),
       decimal17 = lapply(seq_len(nrow(x)), function(i) as.list(sprintf("%.17g", x[i, ]))))
}
capture_warnings <- function(expr) {
  warnings <- character()
  value <- withCallingHandlers(expr, warning = function(w) {
    warnings <<- c(warnings, conditionMessage(w))
    invokeRestart("muffleWarning")
  })
  list(value = value, warnings = warnings)
}
condition_summary <- function(x) {
  if (is.null(x)) return(list(status = "UNMEASURED", reason = "not produced"))
  list(status = "MEASURED", values = json_numeric(x))
}

args <- parse_args(commandArgs(trailingOnly = TRUE))
if (file.exists(args$output)) abort("Refusing to overwrite diagnostic output: %s", args$output)
if (as.character(getRversion()) != "4.6.0") abort("Expected native R 4.6.0; found %s", as.character(getRversion()))
if (as.character(utils::packageVersion("jsonlite")) != "2.0.0") abort("Expected diagnostic jsonlite 2.0.0")
if (as.character(utils::packageVersion("detectseparation")) != "0.4.0") abort("Expected isolated detectseparation 0.4.0")

root <- normalizePath(Sys.getenv("GITHUB_WORKSPACE", getwd()), mustWork = TRUE)
closure <- file.path(root, "experiments", "cp-webr-02-closure")
forensics <- file.path(closure, "forensics")
fixture_dir <- file.path(root, "experiments", "cp-webr-02a", "fixtures")
fixture_integrity_path <- file.path(closure, "fixture-integrity.json")
manifest_path <- file.path(fixture_dir, "fixtures_manifest.json")
integrity <- jsonlite::fromJSON(fixture_integrity_path, simplifyVector = FALSE)
manifest <- jsonlite::fromJSON(manifest_path, simplifyVector = FALSE)
if (!identical(sha256_file(manifest_path), integrity$manifest_sha256)) abort("Frozen manifest hash mismatch")

fixture_ids <- c("fix_15_quasi_separation", "fix_16_complete_separation")
fixture_specs <- lapply(fixture_ids, function(id) {
  matches <- Filter(function(x) identical(x$id, id), manifest$fixtures)
  if (length(matches) != 1L) abort("Expected one frozen manifest entry for %s", id)
  matches[[1L]]
})
names(fixture_specs) <- fixture_ids

read_fixture <- function(id) {
  csv <- file.path(fixture_dir, paste0(id, ".csv"))
  config_path <- file.path(fixture_dir, paste0(id, ".json"))
  pin <- Filter(function(x) identical(x$id, id), integrity$fixtures)[[1L]]
  if (!identical(sha256_file(csv), pin$csv_sha256) || !identical(sha256_file(config_path), pin$config_sha256)) {
    abort("Frozen input hash mismatch for %s", id)
  }
  data <- utils::read.csv(csv, check.names = FALSE, stringsAsFactors = FALSE)
  config <- jsonlite::fromJSON(config_path, simplifyVector = FALSE)
  if (anyDuplicated(as.character(data$id))) abort("Unexpected duplicate row ID in %s", id)
  rownames(data) <- as.character(data$id)
  list(data = data, config = config, csv = csv, config_path = config_path)
}

condition_number <- function(matrix) {
  singular <- tryCatch(svd(matrix, nu = 0L, nv = 0L)$d, error = function(e) NULL)
  if (is.null(singular) || !length(singular) || min(singular) == 0) return(list(value = Inf, singular_values = singular))
  list(value = max(singular) / min(singular), singular_values = singular)
}

fit_diagnostic <- function(id) {
  input <- read_fixture(id)
  data <- input$data
  formula <- stats::as.formula(input$config$formula)
  glm_capture <- capture_warnings(stats::glm(formula, data = data, family = stats::binomial()))
  fit <- glm_capture$value
  summary_fit <- summary(fit)
  x <- stats::model.matrix(formula, data = data)
  y <- stats::model.response(stats::model.frame(formula, data = data))
  row_ids <- rownames(x)
  weights <- stats::weights(fit, type = "working")
  prior_weights <- stats::weights(fit, type = "prior")
  weighted_x <- x * sqrt(weights)
  column_norms <- sqrt(colSums(weighted_x^2))
  scaled_weighted_x <- sweep(weighted_x, 2L, ifelse(column_norms == 0, 1, column_norms), "/")
  raw_condition <- condition_number(weighted_x)
  scaled_condition <- condition_number(scaled_weighted_x)
  information <- crossprod(weighted_x)
  info_eigen <- tryCatch(eigen(information, symmetric = TRUE, only.values = TRUE)$values, error = function(e) NULL)
  info_condition <- if (is.null(info_eigen) || min(abs(info_eigen)) == 0) Inf else max(abs(info_eigen)) / min(abs(info_eigen))

  qr <- fit$qr
  r_factor <- qr.R(qr)
  qr_covariance_pivoted <- tryCatch(chol2inv(r_factor), error = function(e) NULL)
  qr_covariance <- NULL
  if (!is.null(qr_covariance_pivoted)) {
    qr_covariance <- matrix(NA_real_, nrow = length(qr$pivot), ncol = length(qr$pivot),
                             dimnames = list(colnames(x), colnames(x)))
    qr_covariance[qr$pivot, qr$pivot] <- qr_covariance_pivoted
  }
  normal_equation_covariance <- tryCatch(solve(information), error = function(e) NULL)
  vcov_fit <- stats::vcov(fit)
  summary_coefficients <- summary_fit$coefficients

  list(
    fixture = id,
    classification = if (id == "fix_15_quasi_separation") "SEPARATION_CLASSIFICATION_TARGET" else "KNOWN_COMPLETE_SEPARATION_CONTROL",
    input = list(csv_sha256 = sha256_file(input$csv), config_sha256 = sha256_file(input$config_path),
                 row_ids = row_ids, row_count = nrow(data), row_order_sha256_input = sha256_file(input$csv),
                 formula = input$config$formula, response = as.character(data$treat)),
    glm = list(
      warnings = glm_capture$warnings,
      coefficients = named_values(stats::coef(fit)),
      summary_coefficients = matrix_record(summary_coefficients),
      vcov = matrix_record(vcov_fit),
      covariance_unscaled = matrix_record(summary_fit$cov.unscaled),
      covariance_scaled = matrix_record(summary_fit$cov.scaled),
      se_from_vcov = named_values(sqrt(diag(vcov_fit))),
      fit_converged = isTRUE(fit$converged), iter = as.integer(fit$iter), rank = as.integer(fit$rank),
      deviance = unname(fit$deviance), null_deviance = unname(fit$null.deviance),
      linear_predictors = named_values(fit$linear.predictors), fitted_values = named_values(fit$fitted.values),
      fitted_probability_range = list(minimum = min(fit$fitted.values), maximum = max(fit$fitted.values)),
      working_weights = named_values(weights), prior_weights = named_values(prior_weights),
      boundary = isTRUE(fit$boundary), aliased = is.na(stats::coef(fit))
    ),
    model_matrix = list(row_ids = row_ids, columns = colnames(x), values = matrix_record(x), response = named_values(y)),
    association_structure = if (id == "fix_15_quasi_separation") list(
      treatment_by_x_quasi = matrix_record(table(factor(data$treat, levels = c(0, 1)), factor(data$x_quasi, levels = c(0, 1)))),
      x_norm_by_x_quasi = lapply(c(0, 1), function(level) {
        values <- data$x_norm[data$x_quasi == level]
        list(x_quasi = level, n = length(values), minimum = min(values), maximum = max(values), mean = mean(values))
      }),
      interpretation_scope = "Observed table and marginal ranges only; not a separation diagnosis"
    ) else NULL,
    factorization = list(
      qr_rank = as.integer(qr$rank), pivot = as.integer(qr$pivot), qraux = named_values(qr$qraux),
      tolerance = unname(qr$tol), r_factor = matrix_record(r_factor),
      qr_covariance_reconstruction_from_stored_R = if (is.null(qr_covariance)) NULL else matrix_record(qr_covariance),
      qr_covariance_reconstruction_matches_unscaled = if (is.null(qr_covariance)) NULL else isTRUE(all.equal(qr_covariance, summary_fit$cov.unscaled, tolerance = 1e-12)),
      information_matrix_from_final_working_weights = matrix_record(information),
      normal_equation_inverse_diagnostic_only = if (is.null(normal_equation_covariance)) NULL else matrix_record(normal_equation_covariance),
      condition = list(
        weighted_model_matrix = list(value = raw_condition$value, singular_values = json_numeric(raw_condition$singular_values)),
        column_scaled_weighted_model_matrix = list(value = scaled_condition$value, singular_values = json_numeric(scaled_condition$singular_values)),
        unscaled_information_matrix_eigenvalue_ratio = info_condition,
        information_eigenvalues = json_numeric(info_eigen),
        weighted_column_norms = named_values(stats::setNames(column_norms, colnames(x)))
      )
    ),
    environment = list(
      r_version = R.version.string, r_platform = R.version$platform,
      locale = Sys.getlocale(), timezone = Sys.timezone(),
      extSoftVersion = as.list(extSoftVersion()),
      session_info = paste(capture.output(utils::sessionInfo()), collapse = "\n"),
      package_versions = list(jsonlite = as.character(utils::packageVersion("jsonlite")),
                              detectseparation = as.character(utils::packageVersion("detectseparation")),
                              ROI = as.character(utils::packageVersion("ROI")),
                              ROI.plugin.lpsolve = as.character(utils::packageVersion("ROI.plugin.lpsolve")),
                              lpSolveAPI = as.character(utils::packageVersion("lpSolveAPI")))
    )
  )
}

run_separation <- function(data, formula, tolerance) {
  model_matrix <- stats::model.matrix(formula, data = data)
  response <- stats::model.response(stats::model.frame(formula, data = data))
  control <- detectseparation::detect_separation_control(
    implementation = "ROI", solver = "lpsolve", tolerance = tolerance,
    solver_control = list(), separation_type = TRUE
  )
  captured <- capture_warnings(stats::glm(formula, data = data,
    family = stats::binomial(link = "logit"), method = detectseparation::detect_separation,
    control = control
  ))
  result <- captured$value
  separation <- if (is.na(result$outcome)) "INDETERMINATE" else if (!isTRUE(result$outcome)) "NO" else "YES"
  type_unknown <- is.null(result$complete) || length(result$complete) == 0L || is.na(result$complete[[1L]])
  complete <- if (separation == "NO") "NO" else if (type_unknown) "INDETERMINATE" else if (isTRUE(result$complete[[1L]])) "YES" else "NO"
  quasi <- if (separation == "NO") "NO" else if (type_unknown) "INDETERMINATE" else if (isTRUE(result$complete[[1L]])) "NO" else "YES"
  estimates <- stats::coef(result)
  list(
    overall_separation = separation,
    complete_separation = complete,
    quasi_complete_separation = quasi,
    finite_mle_by_coefficient = lapply(names(estimates), function(name) {
      list(term = name, detector_value = if (is.finite(estimates[[name]])) estimates[[name]] else if (estimates[[name]] > 0) "Inf" else "-Inf",
           finite_mle = is.finite(estimates[[name]]))
    }),
    detector = list(package = "detectseparation", version = as.character(utils::packageVersion("detectseparation")),
      method = "Konis linear programming via ROI::ROI.plugin.lpsolve; separation_type LP maximizes minimum transformed margin",
      implementation = control$implementation, solver = control$solver,
      feasibility_tolerance = tolerance, separation_type = control$separation_type,
      solver_control = control$solver_control, outcome = isTRUE(result$outcome),
      complete_field = result$complete, warnings = captured$warnings,
      model_matrix_columns = colnames(model_matrix), row_ids = rownames(model_matrix),
      model_matrix = matrix_record(model_matrix), response = named_values(response),
      returned_infinite_direction = list(names = names(estimates), values = as.list(vapply(estimates, function(value) {
        if (is.finite(value)) sprintf("%.17g", value) else if (value > 0) "Inf" else "-Inf"
      }, character(1L)))))
  )
}

quasi <- read_fixture("fix_15_quasi_separation")
complete_fixture <- read_fixture("fix_16_complete_separation")
complete_positive <- data.frame(
  id = sprintf("sep_%02d", seq_len(8L)),
  treat = c(rep(0, 4L), rep(1, 4L)),
  x = c(-4, -3, -2, -1, 1, 2, 3, 4)
)
rownames(complete_positive) <- complete_positive$id
overlap_negative <- data.frame(
  id = sprintf("overlap_%02d", seq_len(10L)),
  treat = rep(c(0, 1), 5L),
  x = rep(-2:2, each = 2L)
)
rownames(overlap_negative) <- overlap_negative$id

# Instrumentation positive control: maxit=1 is used only on this separate,
# known separated control to force an ordinary stats::glm warning. The frozen
# fixture fits retain glm's unchanged default controls.
warning_positive_capture <- capture_warnings(stats::glm(treat ~ x, data = complete_positive,
  family = stats::binomial(link = "logit"), control = stats::glm.control(maxit = 1L)))
if (!length(warning_positive_capture$warnings)) abort("GLM warning-capture positive control produced no warning")

separation_assessment <- list(
  target = lapply(c(1e-4, 1e-8), function(tol) run_separation(quasi$data, stats::as.formula(quasi$config$formula), tol)),
  fix_16_known_complete_fixture = lapply(c(1e-4, 1e-8), function(tol) run_separation(complete_fixture$data, stats::as.formula(complete_fixture$config$formula), tol)),
  positive_control_known_complete = lapply(c(1e-4, 1e-8), function(tol) run_separation(complete_positive, treat ~ x, tol)),
  negative_control_known_overlap = lapply(c(1e-4, 1e-8), function(tol) run_separation(overlap_negative, treat ~ x, tol)),
  warning_capture_positive_control = list(
    control = "known complete separation, stats::glm with maxit=1 solely to force a warning",
    formula = "treat ~ x", captured_warnings = warning_positive_capture$warnings,
    capture_status = if (length(warning_positive_capture$warnings)) "PASS" else "FAIL"
  ),
  control_data = list(
    positive = list(row_ids = rownames(complete_positive), treatment = complete_positive$treat, x = complete_positive$x),
    negative = list(row_ids = rownames(overlap_negative), treatment = overlap_negative$treat, x = overlap_negative$x)
  )
)

output <- list(
  schema = "CP-WEBR-02-CLOSURE-1-E2-native-diagnostic-v1",
  evidence_classification = "RESEARCH_DIAGNOSTIC_NOT_APPROVED_GOLDEN_REFERENCE",
  commit_sha = trimws(system2("git", c("rev-parse", "HEAD"), stdout = TRUE)),
  replicate = args$replicate,
  oracle_source_sha256 = sha256_file(file.path(forensics, "native_covariance.R")),
  template_sha256 = sha256_file(file.path(root, "experiments", "cp-webr-02a", "adapter", "r_template.R")),
  fixture_manifest_sha256 = sha256_file(manifest_path),
  fixtures = list(
    fix_15_quasi_separation = fit_diagnostic("fix_15_quasi_separation"),
    fix_16_complete_separation = fit_diagnostic("fix_16_complete_separation")
  ),
  separation_assessment = separation_assessment
)
json <- jsonlite::toJSON(output, auto_unbox = TRUE, null = "null", na = "null", digits = NA, pretty = TRUE)
dir.create(dirname(args$output), recursive = TRUE, showWarnings = FALSE)
writeLines(json, args$output, useBytes = TRUE)
cat(sprintf("Wrote native diagnostic replicate %d: %s\n", args$replicate, args$output))
