#!/usr/bin/env Rscript

options(warn = 1)

required_versions <- c(R = "4.6.0", MatchIt = "4.8.1", cobalt = "5.0.0")
cran <- "https://cran.r-project.org"
repo_root <- normalizePath(Sys.getenv("GITHUB_WORKSPACE", getwd()), mustWork = TRUE)
closure_dir <- file.path(repo_root, "experiments", "cp-webr-02-closure")
fixture_dir <- file.path(repo_root, "experiments", "cp-webr-02a", "fixtures")
mode <- Sys.getenv("CP_WEBR_CLOSURE_MODE", "verify")
project_dir <- normalizePath(Sys.getenv("CP_WEBR_RENV_PROJECT", closure_dir), mustWork = TRUE)
report_path <- Sys.getenv("CP_WEBR_FEASIBILITY_REPORT", file.path(project_dir, paste0("native-feasibility-", mode, ".json")))

abort <- function(...) stop(sprintf(...), call. = FALSE)

sha256_file <- function(path) {
  result <- system2("sha256sum", shQuote(path), stdout = TRUE, stderr = TRUE)
  status <- attr(result, "status")
  if (!is.null(status) && status != 0L) abort("sha256sum failed for %s", path)
  sub("\\s+.*$", "", result[[1L]])
}

capture_warnings <- function(expr) {
  warnings <- character()
  value <- withCallingHandlers(
    expr,
    warning = function(w) {
      warnings <<- c(warnings, conditionMessage(w))
      invokeRestart("muffleWarning")
    }
  )
  list(value = value, warnings = warnings)
}

load_fixture <- function(id) {
  config_path <- file.path(fixture_dir, paste0(id, ".json"))
  csv_path <- file.path(fixture_dir, paste0(id, ".csv"))
  if (!file.exists(config_path) || !file.exists(csv_path)) abort("Missing preserved input for %s", id)
  config <- jsonlite::fromJSON(config_path, simplifyVector = FALSE)
  data <- utils::read.csv(csv_path, check.names = FALSE, stringsAsFactors = FALSE, na.strings = "NA")

  factor_refs <- config$extra_meta$factor_ref
  if (length(factor_refs)) {
    for (variable in names(factor_refs)) {
      if (!variable %in% names(data)) abort("Configured factor %s is absent in %s", variable, id)
      observed <- unique(as.character(data[[variable]]))
      reference <- as.character(factor_refs[[variable]])
      levels <- c(reference, setdiff(observed, reference))
      data[[variable]] <- factor(as.character(data[[variable]]), levels = levels)
    }
  }

  list(config = config, data = data, config_path = config_path, csv_path = csv_path)
}

run_native_probe <- function(id) {
  fixture <- load_fixture(id)
  config <- fixture$config
  data <- fixture$data
  formula <- stats::as.formula(config$formula)

  glm_call <- capture_warnings(stats::glm(
    formula,
    data = data,
    family = stats::binomial(link = "logit"),
    na.action = stats::na.fail
  ))
  glm_fit <- glm_call$value
  if (!inherits(glm_fit, "glm") || length(stats::coef(glm_fit)) == 0L) abort("stats::glm did not produce a usable model for %s", id)

  match_args <- list(
    formula = formula,
    data = data,
    method = config$method,
    distance = config$distance,
    link = config$link,
    replace = config$replace,
    m.order = config$m_order,
    ratio = config$ratio
  )
  if (is.numeric(config$caliper) && length(config$caliper) > 0L) {
    match_args$caliper <- config$caliper
    match_args$std.caliper <- isTRUE(config$std_caliper)
  }
  match_call <- capture_warnings(do.call(MatchIt::matchit, match_args))
  match_fit <- match_call$value
  if (!inherits(match_fit, "matchit")) abort("MatchIt::matchit did not produce a matchit object for %s", id)

  balance_std <- cobalt::bal.tab(match_fit, s.d.denom = "treated", binary = "std", un = TRUE)
  balance_raw <- cobalt::bal.tab(match_fit, s.d.denom = "treated", binary = "raw", un = TRUE)
  if (is.null(balance_std$Balance) || nrow(balance_std$Balance) < 1L) abort("cobalt::bal.tab returned no balance rows for %s", id)
  if (is.null(balance_raw$Balance) || nrow(balance_raw$Balance) < 1L) abort("raw cobalt::bal.tab returned no balance rows for %s", id)

  contrast_info <- list()
  factor_columns <- names(data)[vapply(data, is.factor, logical(1L))]
  for (variable in factor_columns) {
    contrast_info[[variable]] <- list(
      levels = levels(data[[variable]]),
      reference_level = levels(data[[variable]])[[1L]],
      contrast_columns = colnames(stats::contrasts(data[[variable]]))
    )
  }

  list(
    id = id,
    classification = "NATIVE_FUNCTIONS_EXECUTED_NO_GOLDEN_VALUES_EMITTED",
    fixture_hashes = list(csv_sha256 = sha256_file(fixture$csv_path), config_sha256 = sha256_file(fixture$config_path)),
    input_rows = nrow(data),
    official_calls = c("stats::glm", "MatchIt::matchit", "cobalt::bal.tab(binary=std)", "cobalt::bal.tab(binary=raw)"),
    execution_checks = list(
      glm_class = class(glm_fit),
      glm_converged = isTRUE(glm_fit$converged),
      glm_term_names = names(stats::coef(glm_fit)),
      matchit_class = class(match_fit),
      matchit_matrix_present = !is.null(match_fit$match.matrix),
      standard_balance_rows = rownames(balance_std$Balance),
      raw_balance_rows = rownames(balance_raw$Balance),
      factor_contrasts = contrast_info
    ),
    warning_text = list(glm = glm_call$warnings, matchit = match_call$warnings)
  )
}

if (!identical(mode, "verify")) abort("Only read-only verify mode is permitted; lock and references are never generated here")
if (!requireNamespace("jsonlite", quietly = TRUE)) abort("jsonlite is required to read the preserved fixture metadata")

manifest_path <- file.path(closure_dir, "source-package-integrity.json")
manifest <- jsonlite::fromJSON(manifest_path, simplifyVector = FALSE)
lock_path <- file.path(closure_dir, "renv.lock")
lock_sha256 <- sha256_file(lock_path)
if (!identical(lock_sha256, manifest$renv_lock_sha256)) abort("renv.lock SHA-256 differs from the source integrity manifest")
if (length(manifest$packages) != manifest$package_count) abort("Source package manifest count is inconsistent")
if (manifest$package_count != length(jsonlite::fromJSON(lock_path, simplifyVector = FALSE)$Packages)) {
  abort("Source package manifest does not cover every renv.lock entry")
}
manifest_packages <- setNames(vapply(manifest$packages, `[[`, character(1L), "version"), vapply(manifest$packages, `[[`, character(1L), "name"))
if (!all(c("MatchIt", "cobalt") %in% names(manifest_packages)) ||
    !identical(unname(manifest_packages[["MatchIt"]]), required_versions[["MatchIt"]]) ||
    !identical(unname(manifest_packages[["cobalt"]]), required_versions[["cobalt"]])) {
  abort("Source package manifest has unexpected MatchIt or cobalt versions")
}

if (!identical(as.character(getRversion()), required_versions[["R"]])) {
  abort("Required native R %s, found %s", required_versions[["R"]], as.character(getRversion()))
}
for (package in c("MatchIt", "cobalt")) {
  if (!requireNamespace(package, quietly = TRUE)) abort("Required official package %s is unavailable", package)
  actual <- as.character(utils::packageVersion(package))
  if (!identical(actual, required_versions[[package]])) abort("Required %s %s, found %s", package, required_versions[[package]], actual)
}
if (!requireNamespace("jsonlite", quietly = TRUE)) abort("jsonlite is required to read the preserved fixture metadata")

fixture_ids <- c("fix_01_well_conditioned", "fix_02_mixed_types")
probe_results <- lapply(fixture_ids, run_native_probe)

session_output <- capture.output(utils::sessionInfo())
blas_line <- grep("^BLAS:", session_output, value = TRUE)
lapack_line <- grep("^LAPACK:", session_output, value = TRUE)
blas_output <- if (length(blas_line)) trimws(sub("^BLAS:", "", blas_line[[1L]])) else NA_character_
lapack_output <- if (length(lapack_line)) trimws(sub("^LAPACK:", "", lapack_line[[1L]])) else NA_character_
report <- list(
  schema_version = 1L,
  gate = "A_NATIVE_R_FEASIBILITY",
  status = "PASS",
  mode = mode,
  commit_sha = Sys.getenv("GITHUB_SHA", "LOCAL_UNCOMMITTED"),
  runtime = list(
    rscript_version = R.version$version.string,
    getRversion = as.character(getRversion()),
    platform = R.version$platform,
    package_versions = list(MatchIt = as.character(utils::packageVersion("MatchIt")), cobalt = as.character(utils::packageVersion("cobalt")), jsonlite = as.character(utils::packageVersion("jsonlite"))),
    renv_version = if (requireNamespace("renv", quietly = TRUE)) as.character(utils::packageVersion("renv")) else NA_character_,
    sessionInfo = session_output,
    BLAS = blas_output,
    LAPACK = lapack_output,
    locale = Sys.getlocale(),
    l10n_info = l10n_info()
  ),
  source_archive_manifest = list(
    package_count = manifest$package_count,
    renv_lock_sha256 = lock_sha256,
    manifest_sha256 = sha256_file(manifest_path)
  ),
  fixtures = probe_results,
  emitted_numeric_golden_values = FALSE,
  reference_generation_attempted = FALSE
)
dir.create(dirname(report_path), recursive = TRUE, showWarnings = FALSE)
jsonlite::write_json(report, report_path, auto_unbox = TRUE, pretty = TRUE, null = "null", digits = NA)

cat("Rscript --version: ")
cat(R.version$version.string, "\n", sep = "")
cat("getRversion(): ", as.character(getRversion()), "\n", sep = "")
cat("MatchIt: ", as.character(utils::packageVersion("MatchIt")), "\n", sep = "")
cat("cobalt: ", as.character(utils::packageVersion("cobalt")), "\n", sep = "")
cat("Probe fixtures executed: ", paste(fixture_ids, collapse = ", "), "\n", sep = "")
cat("Report written: ", report_path, "\n", sep = "")
