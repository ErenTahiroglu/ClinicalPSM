#!/usr/bin/env Rscript

abort <- function(...) stop(sprintf(...), call. = FALSE)
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2L || args[[1L]] != "--outdir") abort("Usage: Rscript qualification.R --outdir <evidence-directory>")
outdir <- normalizePath(args[[2L]], mustWork = FALSE)
dir.create(outdir, recursive = TRUE, showWarnings = FALSE)
fixture_dir <- file.path(outdir, "fixtures")
spec_dir <- file.path(outdir, "specs")
matrix_dir <- file.path(outdir, "model-matrices")
dir.create(fixture_dir, recursive = TRUE, showWarnings = FALSE)
dir.create(spec_dir, recursive = TRUE, showWarnings = FALSE)
dir.create(matrix_dir, recursive = TRUE, showWarnings = FALSE)

script_arg <- grep("^--file=", commandArgs(FALSE), value = TRUE)
script_file <- normalizePath(sub("^--file=", "", script_arg[[1L]]), mustWork = TRUE)
a1_dir <- dirname(script_file)
repo_root <- normalizePath(file.path(a1_dir, "../../.."), mustWork = TRUE)
sha256 <- function(path) {
  if (!file.exists(path)) abort("Missing file for SHA-256: %s", path)
  out <- system2("sha256sum", shQuote(path), stdout = TRUE, stderr = TRUE)
  if (!length(out)) abort("sha256sum produced no output for %s", path)
  sub("[[:space:]].*$", "", out[[1L]])
}
sha_text <- function(value) {
  temp <- tempfile()
  on.exit(unlink(temp), add = TRUE)
  writeBin(charToRaw(enc2utf8(value)), temp)
  sha256(temp)
}
write_json <- function(value, path) {
  jsonlite::write_json(value, path, auto_unbox = TRUE, pretty = TRUE, digits = NA, null = "null", na = "null", force = TRUE)
}
write_csv_full_precision <- function(value, path) {
  prior_options <- options(digits = 17)
  on.exit(options(prior_options), add = TRUE)
  utils::write.csv(value, path, row.names = FALSE, fileEncoding = "UTF-8")
}
matrix_path <- file.path(a1_dir, "preregistration-matrix-v1.json")
pins_path <- file.path(a1_dir, "preregistration-pins-v1.json")
pins <- jsonlite::fromJSON(pins_path, simplifyVector = FALSE)
matrix_hash <- sha256(matrix_path)
if (!identical(matrix_hash, pins$preregistration_matrix$sha256)) abort("Preregistration matrix hash mismatch")
if (!identical(sha256(file.path(a1_dir, "fixture-generation-contract-v1.md")), pins$fixture_generation_contract$sha256)) abort("Fixture-generation contract hash mismatch")
clarification_pins <- jsonlite::fromJSON(file.path(a1_dir, "fixture-generation-clarification-pins-v1.1.json"), simplifyVector = FALSE)
if (!identical(clarification_pins$phase_baseline_sha, pins$phase_baseline_sha)) abort("Fixture-generation clarification baseline mismatch")
if (!identical(clarification_pins$matrix_sha256, pins$preregistration_matrix$sha256)) abort("Fixture-generation clarification matrix mismatch")
if (!identical(clarification_pins$base_generation_contract_sha256, pins$fixture_generation_contract$sha256)) abort("Fixture-generation clarification base-contract mismatch")
if (!identical(sha256(pins_path), clarification_pins$original_preregistration_pins_sha256)) abort("Original preregistration pins hash mismatch")
if (!identical(clarification_pins$clarification_path, "experiments/cp-stat-02/a1/fixture-generation-clarifications-v1.1.md")) abort("Unexpected fixture-generation clarification path")
if (!identical(clarification_pins$hypotheses_expected_classes_seeds_and_acceptance_rules_changed, FALSE)) abort("Clarification cannot change scientific expectations")
if (!identical(sha256(file.path(a1_dir, "fixture-generation-clarifications-v1.1.md")), clarification_pins$clarification_sha256)) abort("Fixture-generation clarification hash mismatch")
if (!identical(sha256(file.path(a1_dir, "CP-STAT-02-A1-PROTOCOL-v1.md")), pins$scientific_protocol$sha256)) abort("Scientific protocol hash mismatch")
correction_v12_pins_path <- file.path(a1_dir, "fixture-generation-correction-pins-v1.2.json")
correction_v12_pins <- jsonlite::fromJSON(correction_v12_pins_path, simplifyVector = FALSE)
if (!identical(correction_v12_pins$correction_sha256, sha256(file.path(a1_dir, "fixture-generation-clarifications-v1.2.md")))) abort("Fixture-generation v1.2 correction hash mismatch")
correction_pins_path <- file.path(a1_dir, "fixture-generation-correction-pins-v1.3.json")
correction_pins <- jsonlite::fromJSON(correction_pins_path, simplifyVector = FALSE)
if (!identical(correction_pins$state, "POST_SECOND_EXECUTION_IMPLEMENTATION_CORRECTION_PENDING_INDEPENDENT_REVIEW")) abort("Unexpected fixture-generation correction state")
if (!identical(correction_pins$phase_baseline_sha, pins$phase_baseline_sha) || !identical(correction_pins$preregistration_matrix_sha256, pins$preregistration_matrix$sha256) || !identical(correction_pins$base_generation_contract_sha256, pins$fixture_generation_contract$sha256)) abort("Fixture-generation correction provenance mismatch")
if (!identical(correction_pins$pre_run_clarification_v1_1_sha256, clarification_pins$clarification_sha256) || !identical(correction_pins$execution_correction_v1_2_sha256, correction_v12_pins$correction_sha256)) abort("Fixture-generation correction chain mismatch")
if (!identical(correction_pins$correction_path, "experiments/cp-stat-02/a1/fixture-generation-clarifications-v1.3.md") || !identical(sha256(file.path(a1_dir, "fixture-generation-clarifications-v1.3.md")), correction_pins$correction_sha256)) abort("Fixture-generation v1.3 correction hash mismatch")
if (!identical(correction_pins$hypotheses_expected_classes_seeds_and_acceptance_rules_changed, FALSE) || !identical(correction_pins$prior_run_results_preserved_without_relabeling, TRUE) || !identical(correction_pins$full_50_fixture_rerun_required, TRUE)) abort("Fixture-generation correction altered expectations or failed to preserve prior runs")
if (!identical(correction_pins$first_execution$workflow_run_id, "40093824481") || !identical(correction_pins$first_execution$commit_sha, "130e42d4b1101920b3bd2329237506b74d4487ae") || !identical(correction_pins$first_execution$artifact_id, "12559634424") || !identical(correction_pins$first_execution$github_artifact_digest, "sha256:41d4c31f0f5716f2e8c300a00783f5115c46c7581a96707505791e243add99b6") || !identical(correction_pins$first_execution$internal_evidence_archive_sha256, "53ffc77b534c6e2813608fd1b8337be81f3d42f3e5a0306f275e71eb0a346bde")) abort("First execution artifact identity mismatch")
if (!identical(correction_pins$second_execution$workflow_run_id, "40095086399") || !identical(correction_pins$second_execution$commit_sha, "4ed6a2fa4d60e28e57216fbf3f0d9e5de7dffde8") || !identical(correction_pins$second_execution$artifact_id, "12560637005") || !identical(correction_pins$second_execution$github_artifact_digest, "sha256:1d16956599423101c3731e0cca4da5cee6cb80a2ca19dc4f2d54f7456c8292d9") || !identical(correction_pins$second_execution$internal_evidence_archive_sha256, "a038be5a15c38e56dbbfddc6dd5d197a37a86e878876282978ce152e0a42985b")) abort("Second execution artifact identity mismatch")
if (!identical(sha256(file.path(a1_dir, "renv.lock")), pins$experimental_environment$renv_lock_sha256)) abort("Experimental renv lock hash mismatch")
if (!identical(sha256(file.path(a1_dir, "source-package-integrity.json")), pins$experimental_environment$source_archive_manifest_sha256)) abort("Package-source manifest hash mismatch")
solver_probe_pins <- jsonlite::fromJSON(file.path(a1_dir, "solver-status-probe-pins-v1.json"), simplifyVector = FALSE)
if (!identical(sha256(file.path(a1_dir, "solver-status-probe-preregistration-v1.md")), solver_probe_pins$supplement_sha256)) abort("Solver-status probe preregistration hash mismatch")
matrix <- jsonlite::fromJSON(matrix_path, simplifyVector = FALSE)
if (length(matrix$fixtures) != 50L || length(unique(vapply(matrix$fixtures, function(x) x$fixture_id, character(1)))) != 50L) abort("Preregistered matrix is not exactly 50 unique scenarios")
if (!identical(as.character(getRversion()), "4.6.0")) abort("R version must be exactly 4.6.0")
expected_packages <- c(detectseparation = "0.4.0", ROI = "1.0.2", ROI.plugin.lpsolve = "1.0.2", lpSolveAPI = "5.5.2.0.17.15", jsonlite = "2.0.0")
observed_packages <- vapply(names(expected_packages), function(name) as.character(utils::packageVersion(name)), character(1))
if (!identical(unname(observed_packages), unname(expected_packages))) abort("Experimental package versions do not match preregistration pins")

parse_n <- function(spec) {
  hits <- gregexpr("(^|[;[:space:]])n=([0-9]+)", spec$construction, perl = TRUE)
  parts <- regmatches(spec$construction, hits)[[1L]]
  if (length(parts) != 1L) abort("GENERATOR_SPEC_AMBIGUITY: %s has %s sample-size tokens", spec$fixture_id, length(parts))
  as.integer(sub("^.*n=", "", parts[[1L]]))
}
format_number <- function(x) {
  if (is.na(x)) return("NA")
  if (is.infinite(x)) return(if (x > 0) "Inf" else "-Inf")
  sprintf("%.17g", x)
}
matrix_rank <- function(x, tol = 1e-12) {
  if (!nrow(x) || !ncol(x)) return(0L)
  as.integer(qr(x, tol = tol, LAPACK = FALSE)$rank)
}
row_keys <- function(x) {
  apply(x, 1L, function(row) paste(vapply(row, format_number, character(1)), collapse = "|"))
}
capture_conditions <- function(expr) {
  warnings <- character()
  error <- NULL
  value <- withCallingHandlers(
    tryCatch(expr, error = function(e) {
      error <<- conditionMessage(e)
      NULL
    }),
    warning = function(w) {
      warnings <<- c(warnings, conditionMessage(w))
      invokeRestart("muffleWarning")
    }
  )
  list(value = value, warnings = as.list(warnings), error = error)
}

make_data <- function(spec) {
  n <- parse_n(spec)
  seed <- as.integer(spec$seed)
  profile <- spec$preregistered_profile
  truth <- spec$expected_separation
  set.seed(seed, kind = "Mersenne-Twister", normal.kind = "Inversion", sample.kind = "Rejection")
  has_x3 <- grepl("x3", spec$construction, fixed = TRUE)
  has_factor <- grepl("factor|sparse|reference|relevel|categorical", profile, ignore.case = TRUE) || grepl("factor|sparse|reference|relevel|categorical", spec$fixture_id, ignore.case = TRUE)
  factor_levels <- if (!has_factor) character() else if (grepl("scaled_relevelled", spec$fixture_id, fixed = TRUE)) c("low", "mid", "high") else c("A", "B", "C")
  factor_ref <- if (grepl("scaled_relevelled", spec$fixture_id, fixed = TRUE)) "high" else "A"
  k <- if (has_x3) 3L else 2L
  formula_terms <- c("x1", "x2", if (has_x3) "x3", if (has_factor) "x_cat")
  formula_text <- paste("treat ~", paste(formula_terms, collapse = " + "))
  x1 <- numeric()
  base_x2 <- numeric()
  base_x3 <- numeric()
  y <- integer()
  cat_values <- character()
  boundary_pair <- integer()
  anchor_count <- 0L

  if (truth == "COMPLETE_SEPARATION") {
    rare <- grepl("rare", profile, ignore.case = TRUE)
    treated_n <- if (grepl("unequal_classes_complete", spec$fixture_id, fixed = TRUE)) floor(n / 9) else if (rare) max(2L, floor(n * 0.05)) else floor(n / 2)
    y <- c(rep(1L, treated_n), rep(0L, n - treated_n))
    x1 <- c(runif(treated_n, 1, 2), runif(n - treated_n, -2, -1))
    base_x2 <- rnorm(n)
    base_x3 <- rnorm(n)
  } else if (truth == "QUASI_COMPLETE_SEPARATION") {
    rare <- grepl("rare", profile, ignore.case = TRUE)
    treated_n <- if (rare) max(2L, floor(n * 0.05)) else floor(n / 2)
    y <- c(1L, 0L, rep(1L, treated_n - 1L), rep(0L, n - treated_n - 1L))
    x1 <- c(0, 0, runif(treated_n - 1L, 1, 2), runif(n - treated_n - 1L, -2, -1))
    base_x2 <- rnorm(n)
    base_x2[1:2] <- 0
    base_x3 <- rnorm(n)
    base_x3[1:2] <- 0
    boundary_pair <- c(1L, 2L)
  } else if (truth == "OVERLAP_FINITE_MLE") {
    level_count <- if (has_factor) length(factor_levels) else 1L
    anchor_delta <- if (grepl("near_boundary_overlap_1e3", spec$fixture_id, fixed = TRUE)) 1e-3 else if (grepl("near_boundary_overlap_1e6", spec$fixture_id, fixed = TRUE)) 1e-6 else if (grepl("scale_and_small_margin", spec$fixture_id, fixed = TRUE)) 1e-4 else 1
    points <- matrix(0, nrow = k + 1L, ncol = k)
    for (j in seq_len(k)) points[j + 1L, j] <- if (j == 1L) anchor_delta else 1
    anchor_rows <- list()
    for (lev in seq_len(level_count)) {
      for (point_id in seq_len(nrow(points))) {
        for (treatment in 0:1) {
          anchor_rows[[length(anchor_rows) + 1L]] <- list(
            y = as.integer(treatment),
            x = points[point_id, ],
            cat = if (has_factor) factor_levels[[lev]] else NA_character_
          )
        }
      }
    }
    anchor_count <- length(anchor_rows)
    if (anchor_count > n) abort("GENERATOR_SPEC_AMBIGUITY: anchor set exceeds n for %s", spec$fixture_id)
    x1 <- vapply(anchor_rows, function(r) r$x[[1L]], numeric(1))
    base_x2 <- vapply(anchor_rows, function(r) r$x[[2L]], numeric(1))
    if (k == 3L) base_x3 <- vapply(anchor_rows, function(r) r$x[[3L]], numeric(1))
    y <- vapply(anchor_rows, function(r) r$y, integer(1))
    if (has_factor) cat_values <- vapply(anchor_rows, function(r) r$cat, character(1))
    extra_n <- n - anchor_count
    if (extra_n > 0L) {
      extra_x1 <- runif(extra_n, -3, 3)
      extra_x2 <- rnorm(extra_n)
      extra_x3 <- rnorm(extra_n)
      extra_y <- if (grepl("rare", profile, ignore.case = TRUE)) rep(0L, extra_n) else sample(c(0L, 1L), extra_n, replace = TRUE)
      if (grepl("poor_overlap|poor_balance|caliper_zero", profile, ignore.case = TRUE)) {
        extra_x1 <- ifelse(extra_y == 1L, runif(extra_n, 3, 6), runif(extra_n, -6, -3))
      }
      if (grepl("extreme|large_logits", profile, ignore.case = TRUE)) {
        extreme <- rep(c(-40, 40), length.out = extra_n)
        extra_x1 <- extreme
      }
      if (has_factor) {
        extra_cat <- sample(factor_levels, extra_n, replace = TRUE)
        cat_values <- c(cat_values, extra_cat)
      }
      x1 <- c(x1, extra_x1)
      base_x2 <- c(base_x2, extra_x2)
      if (k == 3L) base_x3 <- c(base_x3, extra_x3)
      y <- c(y, extra_y)
    }
  } else if (truth == "NOT_CLASSIFIABLE_INVALID_MODEL") {
    y <- rep(c(0L, 1L), length.out = n)
    x1 <- runif(n, -1, 1)
    base_x2 <- rnorm(n)
    base_x3 <- rnorm(n)
    if (grepl("missing", profile, ignore.case = TRUE)) x1[[1L]] <- NA_real_
    if (grepl("factor", profile, ignore.case = TRUE)) {
      has_factor <- TRUE
      factor_levels <- c("A", "B", "C")
      cat_values <- rep(factor_levels, length.out = n)
      cat_values[[1L]] <- "UNDECLARED"
    }
  } else {
    abort("Unknown expected separation class for %s", spec$fixture_id)
  }

  if (length(x1) != n || length(base_x2) != n || length(y) != n) abort("Generator cardinality mismatch for %s", spec$fixture_id)
  if (has_factor && length(cat_values) != n) {
    cat_values <- rep(factor_levels, length.out = n)
    if (length(boundary_pair)) cat_values[boundary_pair] <- factor_levels[[1L]]
  }
  z <- rnorm(n)
  if (truth == "OVERLAP_FINITE_MLE" && anchor_count > 0L) {
    point_z <- if (grepl("near_rank_deficient_overlap", spec$fixture_id, fixed = TRUE)) {
      c(0, 0, 0, 1)
    } else if (grepl("near_exact_correlation", profile, ignore.case = TRUE)) {
      (points[, 2L] - points[, 1L]) / 1e-6
    } else if (grepl("near_collinear|weak_information", profile, ignore.case = TRUE)) {
      (points[, 2L] - points[, 1L]) / 1e-5
    } else if (grepl("near_alias", profile, ignore.case = TRUE)) {
      (points[, 2L] - points[, 1L]) / 1e-7
    } else if (grepl("correlated", profile, ignore.case = TRUE)) {
      (points[, 2L] - points[, 1L]) / 0.1
    } else {
      NULL
    }
    if (!is.null(point_z)) {
      point_z <- rep_len(point_z, nrow(points))
      for (level_index in seq_len(level_count)) {
        for (point_id in seq_len(nrow(points))) {
          first <- (level_index - 1L) * nrow(points) * 2L + (point_id - 1L) * 2L + 1L
          z[first:(first + 1L)] <- point_z[[point_id]]
        }
      }
    }
  }
  if (length(boundary_pair) == 2L) z[boundary_pair] <- 0
  if (grepl("exact_alias|complete_alias|quasi_alias", profile, ignore.case = TRUE)) {
    base_x2 <- x1
  } else if (grepl("near_rank_deficient_overlap", spec$fixture_id, fixed = TRUE)) {
    base_x3 <- x1 + base_x2 + 1e-7 * z
  } else if (grepl("cpstat02a1_25_near_exact_correlation", spec$fixture_id, fixed = TRUE)) {
    base_x2 <- x1 + 1e-6 * z
  } else if (grepl("near_exact_correlation", profile, ignore.case = TRUE)) {
    base_x2 <- x1 + 1e-6 * z
  } else if (grepl("near_collinear|weak_information", profile, ignore.case = TRUE)) {
    base_x2 <- x1 + 1e-5 * z
  } else if (grepl("near_alias", profile, ignore.case = TRUE)) {
    base_x2 <- x1 + 1e-7 * z
  } else if (grepl("correlated", profile, ignore.case = TRUE)) {
    base_x2 <- x1 + 0.1 * z
  }
  if (has_x3 && !grepl("near_rank_deficient_overlap", spec$fixture_id, fixed = TRUE)) {
    if (grepl("exact_alias", profile, ignore.case = TRUE)) base_x3 <- x1 + base_x2
  }
  if (grepl("small_scale_complete", spec$fixture_id, fixed = TRUE)) x1 <- x1 * 1e-6
  if (grepl("large_scale_quasi", spec$fixture_id, fixed = TRUE)) x1 <- x1 * 1e6
  if (grepl("scaled_relevelled", spec$fixture_id, fixed = TRUE)) x1 <- x1 * 1e3
  if (grepl("heterogeneous_scale", profile, fixed = TRUE)) {
    x1 <- x1 * 1e-5
    base_x2 <- base_x2 * 1e5
  }
  if (grepl("scale_and_small_margin", spec$fixture_id, fixed = TRUE)) {
    x1 <- x1 * 1e-4
    base_x2 <- base_x2 * 1e4
  }
  if (grepl("large_logits|extreme", profile, ignore.case = TRUE) && truth != "OVERLAP_FINITE_MLE") x1 <- x1 * 10
  if (grepl("ties", profile, ignore.case = TRUE)) {
    x1 <- round(x1, 1)
    base_x2 <- round(base_x2, 1)
  }
  if (has_x3 && !length(base_x3)) base_x3 <- rnorm(n)
  if (has_factor && !length(cat_values)) cat_values <- rep(factor_levels, length.out = n)

  data <- data.frame(
    row_id = sprintf("sub_%04d", seq_len(n)),
    treat = y,
    x1 = x1,
    x2 = base_x2,
    stringsAsFactors = FALSE
  )
  if (has_x3) data$x3 <- base_x3
  if (has_factor && truth != "NOT_CLASSIFIABLE_INVALID_MODEL") {
    if (grepl("sparse_factor_complete", spec$fixture_id, fixed = TRUE)) {
      controls <- which(data$treat == 0L)
      treated <- which(data$treat == 1L)
      cat_values[controls] <- rep(c("A", "B"), length.out = length(controls))
      cat_values[treated] <- rep(c("A", "B"), length.out = length(treated))
      if (length(treated)) cat_values[treated[[1L]]] <- "C"
    }
    if (grepl("sparse_factor_quasi", spec$fixture_id, fixed = TRUE) && length(boundary_pair)) {
      cat_values[boundary_pair] <- "A"
      treated <- setdiff(which(data$treat == 1L), boundary_pair[[1L]])
      if (length(treated)) cat_values[treated[[1L]]] <- "C"
    }
    if (grepl("factor_reference_complete", spec$fixture_id, fixed = TRUE)) {
      controls <- which(data$treat == 0L)
      treated <- which(data$treat == 1L)
      cat_values[controls] <- "A"
      if (length(treated)) cat_values[treated] <- rep(c("B", "C"), length.out = length(treated))
    }
    factor_value <- factor(cat_values, levels = factor_levels)
    if (factor_ref != "A" && truth != "NOT_CLASSIFIABLE_INVALID_MODEL") factor_value <- stats::relevel(factor_value, ref = factor_ref)
    data$x_cat <- factor_value
  } else if (truth == "NOT_CLASSIFIABLE_INVALID_MODEL" && grepl("factor", profile, ignore.case = TRUE)) {
    data$x_cat <- cat_values
  }
  if (truth == "NOT_CLASSIFIABLE_INVALID_MODEL" && grepl("factor", profile, ignore.case = TRUE)) data$x_cat[[1L]] <- "UNDECLARED"
  anchor_pair_ids <- if (anchor_count > 0L) lapply(seq.int(1L, anchor_count, by = 2L), function(index) as.list(data$row_id[index:(index + 1L)])) else list()
  boundary_pair_ids <- if (length(boundary_pair) == 2L) as.list(data$row_id[boundary_pair]) else list()
  if (grepl("row_permutation|reordered", profile, ignore.case = TRUE)) data <- data[rev(seq_len(nrow(data))), , drop = FALSE]
  rownames(data) <- data$row_id
  attr(data, "formula_text") <- formula_text
  attr(data, "factor_levels_expected") <- factor_levels
  attr(data, "factor_reference_expected") <- factor_ref
  attr(data, "boundary_pair") <- boundary_pair
  attr(data, "anchor_count") <- anchor_count
  attr(data, "anchor_pair_ids") <- anchor_pair_ids
  attr(data, "boundary_pair_ids") <- boundary_pair_ids
  attr(data, "invalid_profile") <- if (truth == "NOT_CLASSIFIABLE_INVALID_MODEL" && grepl("missing", profile, ignore.case = TRUE)) "MISSING_COVARIATE" else if (truth == "NOT_CLASSIFIABLE_INVALID_MODEL") "INVALID_FACTOR_LEVEL" else NULL
  data
}

validate_input <- function(data, spec) {
  invalid <- attr(data, "invalid_profile")
  if (!is.null(invalid)) return(list(valid = FALSE, code = invalid))
  model_cols <- setdiff(names(data), "row_id")
  if (anyNA(data[, model_cols, drop = FALSE])) return(list(valid = FALSE, code = "MISSING_MODEL_VALUE"))
  if ("x_cat" %in% names(data) && any(!as.character(data$x_cat) %in% attr(data, "factor_levels_expected"))) {
    return(list(valid = FALSE, code = "UNDECLARED_FACTOR_LEVEL"))
  }
  if (!all(data$treat %in% c(0L, 1L)) || length(unique(data$treat)) != 2L) return(list(valid = FALSE, code = "INVALID_BINARY_RESPONSE"))
  list(valid = TRUE, code = "VALID")
}

serialize_coefficients <- function(values) {
  if (is.null(values)) return(list())
  lapply(seq_along(values), function(i) {
    value <- unname(values[[i]])
    list(term = names(values)[[i]], value = format_number(value), finite = is.finite(value))
  })
}

decode_lp_status <- function(code) {
  labels <- c(
    `0` = "OPTIMAL", `1` = "SUBOPTIMAL", `2` = "INFEASIBLE", `3` = "UNBOUNDED",
    `4` = "DEGENERATE", `5` = "NUMERICAL_FAILURE", `6` = "USER_ABORT", `7` = "TIMEOUT",
    `8` = "UNLISTED_STATUS_8", `9` = "PRESOLVED", `10` = "PROCESS_FAILURE", `11` = "PROCESS_BREAK",
    `12` = "FEASIBLE_FOUND", `13` = "NO_FEASIBLE_FOUND"
  )
  key <- as.character(as.integer(code))
  if (key %in% names(labels)) unname(labels[[key]]) else "UNKNOWN_STATUS_CODE"
}

threshold_interpretations <- function(objective, status_code) {
  thresholds <- c(1e-4, 1e-8)
  lapply(thresholds, function(threshold) {
    interpretation <- if (!(status_code %in% c(0L, 9L)) || is.null(objective) || !is.finite(objective)) {
      "UNRESOLVED_STATUS_OR_OBJECTIVE"
    } else if (objective <= 0) {
      "NONPOSITIVE_OBJECTIVE"
    } else if (objective <= threshold) {
      "POSITIVE_WITHIN_THRESHOLD_UNRESOLVED"
    } else {
      "ABOVE_THRESHOLD"
    }
    list(threshold = threshold, interpretation = interpretation)
  })
}

run_direct_lp <- function(x, y, kind) {
  n <- nrow(x)
  p <- ncol(x)
  signed <- sweep(x, 1L, ifelse(y == 1L, 1, -1), `*`)
  column_scale <- pmax(1, apply(abs(signed), 2L, max))
  column_normalized <- sweep(signed, 2L, column_scale, `/`)
  row_scale <- pmax(1, sqrt(rowSums(column_normalized^2)))
  normalized <- sweep(column_normalized, 1L, row_scale, `/`)
  objective_vector <- if (kind == "complete_margin") c(rep(0, p), 1) else colSums(normalized)
  variable_count <- length(objective_vector)
  settings <- list(sense = "max", timeout_seconds = 120L, verbose = "neutral", presolve_status_accepted = 9L)
  captured <- capture_conditions({
    lp <- lpSolveAPI::make.lp(0L, variable_count, verbose = "neutral")
    effective_control <- lpSolveAPI::lp.control(lp, sense = "max", timeout = 120L, verbose = "neutral")
    if (kind == "complete_margin") {
      max_margin_bound <- max(rowSums(abs(normalized)))
      lpSolveAPI::set.bounds(lp, lower = c(rep(-1, p), 0), upper = c(rep(1, p), max_margin_bound))
    } else {
      lpSolveAPI::set.bounds(lp, lower = rep(-1, p), upper = rep(1, p))
    }
    lpSolveAPI::set.objfn(lp, objective_vector)
    if (kind == "complete_margin") {
      for (row_index in seq_len(n)) lpSolveAPI::add.constraint(lp, c(normalized[row_index, ], -1), type = ">=", rhs = 0)
    } else {
      for (row_index in seq_len(n)) lpSolveAPI::add.constraint(lp, normalized[row_index, ], type = ">=", rhs = 0)
    }
    code <- as.integer(base::solve(lp))
    objective <- if (code %in% c(0L, 9L)) as.numeric(lpSolveAPI::get.objective(lp)) else NULL
    list(return_code = code, status = decode_lp_status(code), objective = objective, effective_control = effective_control)
  })
  solve_result <- captured$value
  status_code <- if (is.null(solve_result)) NA_integer_ else as.integer(solve_result$return_code)
  objective <- if (is.null(solve_result)) NULL else solve_result$objective
  list(
    kind = kind,
    settings = settings,
    effective_control = if (is.null(solve_result)) NULL else solve_result$effective_control,
    return_code = if (is.na(status_code)) NULL else status_code,
    status = if (is.na(status_code)) "R_ERROR" else decode_lp_status(status_code),
    failure_code = if (is.na(status_code)) "R_ERROR" else if (status_code %in% c(0L, 9L)) NULL else decode_lp_status(status_code),
    objective = objective,
    threshold_interpretations = threshold_interpretations(objective, status_code),
    warnings = captured$warnings,
    error = captured$error
  )
}

observe_direct_probe <- function(data, formula) {
  x <- stats::model.matrix(formula, data = data)
  y <- as.integer(data$treat)
  signed <- sweep(x, 1L, ifelse(y == 1L, 1, -1), `*`)
  column_scale <- pmax(1, apply(abs(signed), 2L, max))
  column_normalized <- sweep(signed, 2L, column_scale, `/`)
  row_scale <- pmax(1, sqrt(rowSums(column_normalized^2)))
  list(
    formulation = "column-scaled then row-scaled signed model matrix; positive scaling preserves existence of a separating direction",
    column_scale = as.list(column_scale),
    row_scale = as.list(row_scale),
    complete_margin = run_direct_lp(x, y, "complete_margin"),
    weak_direction = run_direct_lp(x, y, "weak_direction"),
    same_solver_as_candidate = TRUE,
    independent_solver_replication = FALSE
  )
}

assess_direct_probe <- function(expected_class, direct_probe) {
  assess_at <- function(threshold) {
    margin <- direct_probe$complete_margin
    weak <- direct_probe$weak_direction
    if (!(margin$status %in% c("OPTIMAL", "PRESOLVED")) || !(weak$status %in% c("OPTIMAL", "PRESOLVED")) || is.null(margin$objective) || is.null(weak$objective)) {
      return(list(threshold = threshold, classification = "SOLVER_STATUS_FAILURE", complete_margin_state = "UNRESOLVED", weak_direction_state = "UNRESOLVED"))
    }
    margin_state <- if (margin$objective > threshold) "POSITIVE_ABOVE_THRESHOLD" else if (margin$objective > 0) "POSITIVE_WITHIN_THRESHOLD" else "NONPOSITIVE"
    weak_state <- if (weak$objective > threshold) "POSITIVE_ABOVE_THRESHOLD" else if (weak$objective > 0) "POSITIVE_WITHIN_THRESHOLD" else "NONPOSITIVE"
    if (margin_state == "POSITIVE_WITHIN_THRESHOLD" || weak_state == "POSITIVE_WITHIN_THRESHOLD") {
      classification <- "UNRESOLVED_THRESHOLD"
    } else {
      consistent <- switch(
        expected_class,
        COMPLETE_SEPARATION = margin_state == "POSITIVE_ABOVE_THRESHOLD" && weak_state == "POSITIVE_ABOVE_THRESHOLD",
        QUASI_COMPLETE_SEPARATION = margin_state == "NONPOSITIVE" && weak_state == "POSITIVE_ABOVE_THRESHOLD",
        OVERLAP_FINITE_MLE = margin_state == "NONPOSITIVE" && weak_state == "NONPOSITIVE",
        FALSE
      )
      classification <- if (isTRUE(consistent)) "CONSTRUCTIVE_CLASS_SUPPORTED" else "NUMERICAL_OR_FORMULATION_DISCREPANCY"
    }
    list(threshold = threshold, classification = classification, complete_margin_state = margin_state, weak_direction_state = weak_state)
  }
  lapply(c(1e-4, 1e-8), assess_at)
}

observe_lp <- function(data, formula, tolerance) {
  warnings <- character()
  error <- NULL
  control <- detectseparation::detect_separation_control(
    implementation = "ROI",
    solver = "lpsolve",
    tolerance = tolerance,
    solver_control = list(),
    separation_type = TRUE
  )
  solver_configuration <- list(implementation = "ROI", solver = "lpsolve", tolerance = tolerance, solver_control = list(), separation_type = TRUE)
  fit <- withCallingHandlers(
    tryCatch(
      stats::glm(
        formula = formula,
        family = stats::binomial(link = "logit"),
        data = data,
        method = detectseparation::detect_separation,
        control = control
      ),
      error = function(e) {
        error <<- conditionMessage(e)
        NULL
      }
    ),
    warning = function(w) {
      warnings <<- c(warnings, conditionMessage(w))
      invokeRestart("muffleWarning")
    }
  )
  direct_probe <- observe_direct_probe(data, formula)
  if (!is.null(error)) return(list(status = "ERROR", class = "UNRESOLVED", outcome = NULL, complete = NULL, coefficients = list(), infinite_coefficient_names_and_signs = list(), solver_configuration = solver_configuration, warnings = as.list(warnings), error = error, solver_return_code = "NOT_EXPOSED_BY_PUBLIC_PACKAGE_API", solver_failure_code = "R_ERROR", direct_solver_probe = direct_probe))
  if (is.null(fit) || is.null(fit$outcome) || is.na(fit$outcome)) return(list(status = "INDETERMINATE", class = "UNRESOLVED", outcome = NULL, complete = if (is.null(fit)) NULL else fit$complete, coefficients = serialize_coefficients(if (!is.null(fit)) stats::coef(fit) else NULL), infinite_coefficient_names_and_signs = list(), solver_configuration = solver_configuration, warnings = as.list(warnings), error = NULL, solver_return_code = "NOT_EXPOSED_BY_PUBLIC_PACKAGE_API", solver_failure_code = "MISSING_OR_NA_METHOD_OUTCOME", direct_solver_probe = direct_probe))
  outcome <- isTRUE(fit$outcome)
  complete <- fit$complete
  class <- if (!outcome) "OVERLAP_FINITE_MLE" else if (isTRUE(complete)) "COMPLETE_SEPARATION" else if (identical(complete, FALSE)) "QUASI_COMPLETE_SEPARATION" else "UNRESOLVED"
  coeffs <- tryCatch(stats::coef(fit), error = function(e) NULL)
  complete_serialized <- if (is.null(complete) || length(complete) != 1L || is.na(complete)) NULL else as.logical(complete)
  infinite_coefficients <- if (is.null(coeffs) || is.null(names(coeffs))) list() else lapply(which(is.infinite(as.numeric(coeffs))), function(index) {
    list(term = names(coeffs)[[index]], sign = if (coeffs[[index]] > 0) "positive" else "negative")
  })
  list(
    status = if (outcome) "SEPARATED" else "OVERLAP",
    class = class,
    outcome = outcome,
    complete = complete_serialized,
    coefficients = serialize_coefficients(coeffs),
    infinite_coefficient_names_and_signs = infinite_coefficients,
    solver_configuration = solver_configuration,
    warnings = as.list(warnings),
    error = NULL,
    solver_return_code = "NOT_EXPOSED_BY_PUBLIC_PACKAGE_API",
    solver_failure_code = NULL,
    direct_solver_probe = direct_probe
  )
}

observe_glm <- function(data, formula) {
  captured <- capture_conditions(stats::glm(formula, family = stats::binomial(link = "logit"), data = data))
  fit <- captured$value
  if (is.null(fit)) return(list(status = "ERROR", converged = NULL, iterations = NULL, coefficients = list(), fitted_probability_range = list(), warnings = captured$warnings, error = captured$error))
  coefficient_capture <- capture_conditions(summary(fit)$coefficients)
  coef_mat <- coefficient_capture$value
  coefs <- if (is.null(coef_mat)) list() else lapply(seq_len(nrow(coef_mat)), function(i) {
    list(term = rownames(coef_mat)[[i]], estimate = format_number(coef_mat[i, "Estimate"]), standard_error = format_number(coef_mat[i, "Std. Error"]))
  })
  eta_capture <- capture_conditions(as.numeric(stats::predict(fit, type = "link")))
  probability_capture <- capture_conditions(as.numeric(stats::fitted(fit)))
  eta <- eta_capture$value
  p <- probability_capture$value
  list(
    status = "FIT",
    converged = isTRUE(fit$converged),
    iterations = as.integer(fit$iter),
    coefficients = coefs,
    summary_warnings = coefficient_capture$warnings,
    summary_error = coefficient_capture$error,
    linear_predictors = if (is.null(eta)) list() else as.list(vapply(eta, format_number, character(1))),
    linear_predictor_range = as.list(vapply(if (length(eta)) range(eta, na.rm = TRUE) else numeric(), format_number, character(1))),
    linear_predictor_warnings = eta_capture$warnings,
    linear_predictor_error = eta_capture$error,
    fitted_probabilities = if (is.null(p)) list() else as.list(vapply(p, format_number, character(1))),
    fitted_probability_range = as.list(vapply(if (length(p)) range(p, na.rm = TRUE) else numeric(), format_number, character(1))),
    fitted_probability_warnings = probability_capture$warnings,
    fitted_probability_error = probability_capture$error,
    warnings = captured$warnings,
    error = NULL
  )
}

proof_record <- function(data, formula, truth) {
  model_data <- data
  rownames(model_data) <- data$row_id
  x <- stats::model.matrix(formula, data = model_data)
  y <- model_data$treat
  rank_x <- matrix_rank(x)
  singular_values <- svd(x, nu = 0L, nv = 0L)$d
  keys <- row_keys(x)
  common_keys <- intersect(unique(keys[y == 0L]), unique(keys[y == 1L]))
  common_index <- which(keys %in% common_keys)
  common_rank <- if (length(common_index)) matrix_rank(x[common_index, , drop = FALSE]) else 0L
  anchor_pairs <- attr(data, "anchor_pair_ids")
  anchor_pair_exact <- if (length(anchor_pairs)) vapply(anchor_pairs, function(pair) {
    indices <- match(unlist(pair, use.names = FALSE), rownames(x))
    !anyNA(indices) && length(unique(y[indices])) == 2L && identical(unname(as.numeric(x[indices[[1L]], ])), unname(as.numeric(x[indices[[2L]], ])))
  }, logical(1)) else logical()
  anchor_row_indices <- if (length(anchor_pairs)) vapply(anchor_pairs, function(pair) match(unlist(pair, use.names = FALSE)[[1L]], rownames(x)), integer(1)) else integer()
  anchor_rank <- if (length(anchor_row_indices) && all(!is.na(anchor_row_indices))) matrix_rank(x[anchor_row_indices, , drop = FALSE]) else 0L
  boundary_pair <- attr(data, "boundary_pair_ids")
  boundary_indices <- if (length(boundary_pair)) match(unlist(boundary_pair, use.names = FALSE), rownames(x)) else integer()
  boundary_pair_exact <- length(boundary_indices) == 2L && !anyNA(boundary_indices) && length(unique(y[boundary_indices])) == 2L && identical(unname(as.numeric(x[boundary_indices[[1L]], ])), unname(as.numeric(x[boundary_indices[[2L]], ])))
  signed <- ifelse(y == 1L, 1, -1)
  separator_margins <- signed * x[, "x1"]
  proof_ok <- if (truth == "COMPLETE_SEPARATION") {
    all(separator_margins > 0)
  } else if (truth == "QUASI_COMPLETE_SEPARATION") {
    all(separator_margins >= 0) && any(separator_margins > 0) && boundary_pair_exact
  } else {
    length(anchor_pairs) > 0L && all(anchor_pair_exact) && anchor_rank == rank_x && common_rank == rank_x
  }
  list(
    model_matrix = x,
    rank = rank_x,
    rank_tolerance = 1e-12,
    singular_values = as.list(vapply(singular_values, format_number, character(1))),
    smallest_singular_value = if (length(singular_values)) as.numeric(min(singular_values)) else NULL,
    largest_singular_value = if (length(singular_values)) as.numeric(max(singular_values)) else NULL,
    singular_value_ratio = if (length(singular_values) && min(singular_values) > 0) as.numeric(max(singular_values) / min(singular_values)) else NULL,
    columns = as.list(colnames(x)),
    pivots = as.list(as.integer(qr(x, tol = 1e-12, LAPACK = FALSE)$pivot)),
    aliases = as.list(if (rank_x < ncol(x)) colnames(x)[qr(x, tol = 1e-12, LAPACK = FALSE)$pivot[(rank_x + 1L):ncol(x)]] else character()),
    common_row_count = length(common_index),
    common_row_rank = common_rank,
    anchor_pair_count = length(anchor_pairs),
    anchor_pairs_exact = if (truth == "OVERLAP_FINITE_MLE") all(anchor_pair_exact) else NULL,
    anchor_matrix_rank = if (truth == "OVERLAP_FINITE_MLE") anchor_rank else NULL,
    boundary_pair_exact = if (truth == "QUASI_COMPLETE_SEPARATION") boundary_pair_exact else NULL,
    witness_margin_min = min(separator_margins),
    witness_margin_max = max(separator_margins),
    witness_margins = as.list(vapply(separator_margins, format_number, character(1))),
    proof_ok = isTRUE(proof_ok)
  )
}

analytic_x1_class <- function(data) {
  controls <- data$x1[data$treat == 0L]
  treated <- data$x1[data$treat == 1L]
  if (!length(controls) || !length(treated) || anyNA(controls) || anyNA(treated)) {
    return(list(class = "NOT_CLASSIFIABLE", direction = NULL, strict_gap = NULL, boundary_tie = FALSE))
  }
  control_max <- max(controls)
  control_min <- min(controls)
  treated_max <- max(treated)
  treated_min <- min(treated)
  if (control_max < treated_min) return(list(class = "COMPLETE_SEPARATION", direction = "positive_x1", strict_gap = treated_min - control_max, boundary_tie = FALSE))
  if (treated_max < control_min) return(list(class = "COMPLETE_SEPARATION", direction = "negative_x1", strict_gap = control_min - treated_max, boundary_tie = FALSE))
  if (control_max == treated_min && (any(controls < control_max) || any(treated > treated_min))) return(list(class = "QUASI_COMPLETE_SEPARATION", direction = "positive_x1", strict_gap = 0, boundary_tie = TRUE))
  if (treated_max == control_min && (any(treated < treated_max) || any(controls > control_min))) return(list(class = "QUASI_COMPLETE_SEPARATION", direction = "negative_x1", strict_gap = 0, boundary_tie = TRUE))
  list(class = "OVERLAP_FINITE_MLE", direction = NULL, strict_gap = 0, boundary_tie = FALSE)
}

r_version <- as.character(getRversion())
package_versions <- as.list(observed_packages)
fixture_results <- vector("list", length(matrix$fixtures))
falsification_controls <- list()
for (i in seq_along(matrix$fixtures)) {
  spec <- matrix$fixtures[[i]]
  data <- make_data(spec)
  fixture_id <- spec$fixture_id
  spec_path <- file.path(spec_dir, paste0(fixture_id, ".json"))
  data_path <- file.path(fixture_dir, paste0(fixture_id, ".csv"))
  write_json(spec, spec_path)
  utils::write.csv(data, data_path, row.names = FALSE, na = "NA", fileEncoding = "UTF-8")
  validation <- validate_input(data, spec)
  spec_hash <- sha256(spec_path)
  input_hash <- sha256(data_path)
  formula_text <- attr(data, "formula_text")
  factor_levels <- attr(data, "factor_levels_expected")
  factor_reference <- attr(data, "factor_reference_expected")
  factor_contrast_info <- if ("x_cat" %in% names(data) && is.factor(data$x_cat)) {
    contrast_matrix <- stats::contrasts(data$x_cat)
    list(
      row_levels = as.list(rownames(contrast_matrix)),
      columns = as.list(colnames(contrast_matrix)),
      values_by_level = lapply(seq_len(nrow(contrast_matrix)), function(row_index) as.list(as.numeric(contrast_matrix[row_index, , drop = TRUE]))),
      sha256 = sha_text(paste(capture.output(dput(contrast_matrix)), collapse = "\n"))
    )
  } else NULL
  result <- list(
    fixture_id = fixture_id,
    expected_separation = spec$expected_separation,
    expected_mle_status = spec$expected_mle_status,
    expected_design_rank = spec$expected_design_rank,
    expected_product_policy = spec$expected_product_policy,
    independent_ground_truth = spec$independent_ground_truth,
    preregistered_comparison_rule = spec$comparison_rule,
    preregistered_falsification_control = spec$falsification_control,
    profile = spec$preregistered_profile,
    seed = as.integer(spec$seed),
    sample_size = as.integer(nrow(data)),
    spec_sha256 = spec_hash,
    spec_path = file.path("specs", basename(spec_path)),
    input_csv_sha256 = input_hash,
    input_csv_path = file.path("fixtures", basename(data_path)),
    row_order_sha256 = sha_text(paste(data$row_id, collapse = "\n")),
    response_sha256 = sha_text(paste(data$treat, collapse = "\n")),
    row_ids = as.list(data$row_id),
    response_values = as.list(as.integer(data$treat)),
    formula = formula_text,
    factor_levels = as.list(factor_levels),
    factor_reference = factor_reference,
    factor_contrasts = factor_contrast_info,
    validation = validation,
    detector_invoked = FALSE,
    ground_truth_proof = NULL,
    analytic_x1_crosscheck = NULL,
    matrix_rank = NULL,
    model_matrix_columns = list(),
    model_matrix_values = list(),
    model_matrix_sha256 = NULL,
    detector_runs = list(),
    glm_observation = NULL,
    matching_evaluated = FALSE,
    matching_policy_observation = "NOT_EVALUATED_BY_A1",
    status = "UNMEASURED",
    failure_codes = list()
  )
  if (!validation$valid) {
    expected_invalid <- spec$expected_separation == "NOT_CLASSIFIABLE_INVALID_MODEL"
    result$detector_invoked <- FALSE
    result$status <- if (expected_invalid && validation$code %in% c("MISSING_COVARIATE", "INVALID_FACTOR_LEVEL", "MISSING_MODEL_VALUE", "UNDECLARED_FACTOR_LEVEL")) "PASS" else "FAIL"
    if (result$status == "FAIL") result$failure_codes <- list("INVALID_INPUT_POLICY_MISMATCH")
    falsification_controls[[length(falsification_controls) + 1L]] <- list(
      fixture_id = fixture_id,
      control = "invalid_input_is_blocked_before_separation_classification",
      status = if (result$status == "PASS" && !result$detector_invoked) "PASS" else "FAIL"
    )
    fixture_results[[i]] <- result
    next
  }
  if (spec$expected_separation == "NOT_CLASSIFIABLE_INVALID_MODEL") {
    result$status <- "FAIL"
    result$failure_codes <- list("INVALID_FIXTURE_ACCEPTED")
    falsification_controls[[length(falsification_controls) + 1L]] <- list(
      fixture_id = fixture_id,
      control = "invalid_input_is_blocked_before_separation_classification",
      status = "FAIL"
    )
    fixture_results[[i]] <- result
    next
  }
  formula <- stats::as.formula(formula_text)
  proof <- tryCatch(proof_record(data, formula, spec$expected_separation), error = function(e) list(proof_error = conditionMessage(e), proof_ok = FALSE))
  result$ground_truth_proof <- proof[setdiff(names(proof), "model_matrix")]
  result$analytic_x1_crosscheck <- analytic_x1_class(data)
  if (!identical(result$analytic_x1_crosscheck$class, spec$expected_separation)) result$failure_codes <- c(result$failure_codes, list("ANALYTIC_X1_CROSSCHECK_MISMATCH"))
  x <- proof$model_matrix
  if (is.null(x)) {
    result$status <- "FAIL"
    result$failure_codes <- list("GROUND_TRUTH_PROOF_ERROR")
    falsification_controls[[length(falsification_controls) + 1L]] <- list(
      fixture_id = fixture_id,
      control = "ground_truth_precondition_blocks_candidate_method",
      status = if (!result$detector_invoked && result$status == "FAIL") "PASS" else "FAIL"
    )
    fixture_results[[i]] <- result
    next
  }
  model_path <- file.path(matrix_dir, paste0(fixture_id, ".csv"))
  matrix_frame <- data.frame(row_id = rownames(x), x, check.names = FALSE)
  write_csv_full_precision(matrix_frame, model_path)
  result$matrix_rank <- as.integer(proof$rank)
  result$model_matrix_columns <- proof$columns
  result$model_matrix_values <- lapply(seq_len(nrow(x)), function(row_index) as.list(vapply(x[row_index, ], format_number, character(1))))
  result$model_matrix_sha256 <- sha256(model_path)
  rank_pass <- if (spec$expected_design_rank == "full_rank") proof$rank == ncol(x) else if (spec$expected_design_rank == "rank_deficient") proof$rank < ncol(x) else TRUE
  if (!isTRUE(proof$proof_ok)) result$failure_codes <- c(result$failure_codes, list("CONSTRUCTIVE_GROUND_TRUTH_FAILED"))
  if (!rank_pass) result$failure_codes <- c(result$failure_codes, list("DESIGN_RANK_EXPECTATION_FAILED"))
  if (!isTRUE(proof$proof_ok) || !rank_pass || "ANALYTIC_X1_CROSSCHECK_MISMATCH" %in% unlist(result$failure_codes)) {
    result$status <- "FAIL"
    falsification_controls[[length(falsification_controls) + 1L]] <- list(
      fixture_id = fixture_id,
      control = "ground_truth_precondition_blocks_candidate_method",
      status = if (!result$detector_invoked && result$status == "FAIL") "PASS" else "FAIL"
    )
    fixture_results[[i]] <- result
    next
  }

  for (tolerance in c(1e-4, 1e-8)) {
    for (replicate in 1:2) {
      started <- proc.time()[["elapsed"]]
      observed <- observe_lp(data, formula, tolerance)
      elapsed <- proc.time()[["elapsed"]] - started
      observed$tolerance <- tolerance
      observed$replicate <- replicate
      observed$execution_id <- paste(fixture_id, format(tolerance, scientific = TRUE), replicate, Sys.getpid(), sep = "/")
      observed$started_at_utc <- format(Sys.time(), "%Y-%m-%dT%H:%M:%OS6Z", tz = "UTC")
      observed$process_id <- Sys.getpid()
      observed$elapsed_ms <- as.integer(round(elapsed * 1000))
      observed$observed_class <- observed$class
      observed$direct_probe_assessments <- assess_direct_probe(spec$expected_separation, observed$direct_solver_probe)
      result$detector_runs[[length(result$detector_runs) + 1L]] <- observed
    }
  }
  result$detector_invoked <- TRUE
  result$glm_observation <- observe_glm(data, formula)
  if (!is.null(result$glm_observation$error) || !is.null(result$glm_observation$summary_error) || !is.null(result$glm_observation$linear_predictor_error) || !is.null(result$glm_observation$fitted_probability_error)) result$failure_codes <- c(result$failure_codes, list("GLM_NUMERIC_DIAGNOSTIC_ERROR"))
  if (length(result$glm_observation$linear_predictors) != nrow(data) || length(result$glm_observation$fitted_probabilities) != nrow(data)) result$failure_codes <- c(result$failure_codes, list("GLM_NUMERIC_DIAGNOSTIC_CARDINALITY_MISMATCH"))
  runs <- result$detector_runs
  exact_classes <- vapply(runs, function(x) x$class, character(1))
  if (!all(exact_classes == spec$expected_separation)) result$failure_codes <- c(result$failure_codes, list("EXPECTED_SEPARATION_CLASS_MISMATCH"))
  for (run in runs) {
    direct <- run$direct_solver_probe
    if (is.null(direct)) {
      result$failure_codes <- c(result$failure_codes, list("DIRECT_SOLVER_PROBE_MISSING"))
    } else {
      if (!(direct$complete_margin$status %in% c("OPTIMAL", "PRESOLVED"))) result$failure_codes <- c(result$failure_codes, list("DIRECT_COMPLETE_MARGIN_SOLVER_NONOPTIMAL"))
      if (!(direct$weak_direction$status %in% c("OPTIMAL", "PRESOLVED"))) result$failure_codes <- c(result$failure_codes, list("DIRECT_WEAK_DIRECTION_SOLVER_NONOPTIMAL"))
      if (is.null(direct$complete_margin$objective) || !is.finite(direct$complete_margin$objective)) result$failure_codes <- c(result$failure_codes, list("DIRECT_COMPLETE_MARGIN_OBJECTIVE_MISSING"))
      if (is.null(direct$weak_direction$objective) || !is.finite(direct$weak_direction$objective)) result$failure_codes <- c(result$failure_codes, list("DIRECT_WEAK_DIRECTION_OBJECTIVE_MISSING"))
      relations <- vapply(run$direct_probe_assessments, function(x) x$classification, character(1))
      if (any(relations == "UNRESOLVED_THRESHOLD")) result$failure_codes <- c(result$failure_codes, list("DIRECT_PROBE_THRESHOLD_UNRESOLVED"))
      if (any(relations == "NUMERICAL_OR_FORMULATION_DISCREPANCY")) result$failure_codes <- c(result$failure_codes, list("DIRECT_PROBE_CONSTRUCTIVE_DISCREPANCY"))
      if (any(relations == "SOLVER_STATUS_FAILURE")) result$failure_codes <- c(result$failure_codes, list("DIRECT_PROBE_SOLVER_STATUS_FAILURE"))
    }
  }
  for (tolerance in c(1e-4, 1e-8)) {
    selected <- Filter(function(x) identical(as.numeric(x$tolerance), tolerance), runs)
    if (length(selected) != 2L) {
      result$failure_codes <- c(result$failure_codes, list("REPEAT_COUNT_MISMATCH"))
    } else {
      sig <- vapply(selected, function(x) {
        direct <- x$direct_solver_probe
        direct_sig <- if (is.null(direct)) "MISSING" else {
          cm <- if (is.null(direct$complete_margin$objective)) NA_real_ else direct$complete_margin$objective
          wd <- if (is.null(direct$weak_direction$objective)) NA_real_ else direct$weak_direction$objective
          assessments <- paste(vapply(x$direct_probe_assessments, function(a) paste(a$threshold, a$classification, a$complete_margin_state, a$weak_direction_state, sep = "/"), character(1)), collapse = ",")
          paste(direct$complete_margin$return_code, format_number(cm), direct$complete_margin$status, paste(unlist(direct$complete_margin$warnings), collapse = "|"), direct$complete_margin$error, direct$weak_direction$return_code, format_number(wd), direct$weak_direction$status, paste(unlist(direct$weak_direction$warnings), collapse = "|"), direct$weak_direction$error, assessments, sep = ":")
        }
        paste(x$status, x$class, x$outcome, x$complete, paste(vapply(x$coefficients, function(z) paste(z$term, z$value), character(1)), collapse = ","), paste(unlist(x$warnings), collapse = "|"), x$error, direct_sig, sep = "")
      }, character(1))
      if (!identical(sig[[1L]], sig[[2L]])) result$failure_codes <- c(result$failure_codes, list("NONREPEATABLE_RESULT"))
    }
  }
  expected_complete <- spec$expected_separation == "COMPLETE_SEPARATION"
  class_matches_expected <- function(actual, expected) is.character(actual) && length(actual) == 1L && is.character(expected) && length(expected) == 1L && identical(actual, expected)
  observed_comparison <- class_matches_expected(exact_classes[[1L]], spec$expected_separation)
  altered_expected <- if (expected_complete) "OVERLAP_FINITE_MLE" else "COMPLETE_SEPARATION"
  tampered_comparison <- class_matches_expected(exact_classes[[1L]], altered_expected)
  falsification_controls[[length(falsification_controls) + 1L]] <- list(
    fixture_id = fixture_id,
    control = "altered_expected_class_is_rejected",
    status = if (observed_comparison && !tampered_comparison) "PASS" else "FAIL"
  )
  result$status <- if (!length(result$failure_codes)) "PASS" else "FAIL"
  fixture_results[[i]] <- result
}

classes <- vapply(fixture_results, function(x) x$expected_separation, character(1))
statuses <- vapply(fixture_results, function(x) x$status, character(1))
expected_counts <- as.list(table(factor(classes, levels = unique(classes))))
status_counts <- as.list(table(factor(statuses, levels = c("PASS", "FAIL", "UNMEASURED"))))
valid_rows <- Filter(function(x) x$detector_invoked, fixture_results)
fp <- sum(vapply(valid_rows, function(x) x$expected_separation == "OVERLAP_FINITE_MLE" && any(vapply(x$detector_runs, function(r) r$class %in% c("COMPLETE_SEPARATION", "QUASI_COMPLETE_SEPARATION"), logical(1))), logical(1)))
fn <- sum(vapply(valid_rows, function(x) x$expected_separation %in% c("COMPLETE_SEPARATION", "QUASI_COMPLETE_SEPARATION") && any(vapply(x$detector_runs, function(r) r$class == "OVERLAP_FINITE_MLE", logical(1))), logical(1)))
unresolved <- sum(vapply(valid_rows, function(x) any(vapply(x$detector_runs, function(r) r$class == "UNRESOLVED" || any(vapply(r$direct_probe_assessments, function(a) a$classification == "UNRESOLVED_THRESHOLD", logical(1))), logical(1))), logical(1)))
direct_threshold_unresolved <- sum(vapply(valid_rows, function(x) any(vapply(x$detector_runs, function(r) any(vapply(r$direct_probe_assessments, function(a) a$classification == "UNRESOLVED_THRESHOLD", logical(1))), logical(1))), logical(1)))
elapsed <- unlist(lapply(valid_rows, function(x) vapply(x$detector_runs, function(r) r$elapsed_ms, integer(1))))
direct_statuses <- unlist(lapply(valid_rows, function(fixture) unlist(lapply(fixture$detector_runs, function(run) c(run$direct_solver_probe$complete_margin$status, run$direct_solver_probe$weak_direction$status)))))
direct_relations <- unlist(lapply(valid_rows, function(fixture) unlist(lapply(fixture$detector_runs, function(run) vapply(run$direct_probe_assessments, function(assessment) assessment$classification, character(1))))))
mutation_source <- fixture_results[[1L]]
mutation_expected <- mutation_source$expected_separation
mutation_baseline <- length(mutation_source$detector_runs) == 4L && all(vapply(mutation_source$detector_runs, function(run) identical(run$class, mutation_expected), logical(1)))
mutation_copy <- lapply(mutation_source$detector_runs, identity)
mutation_copy[[1L]]$class <- "OVERLAP_FINITE_MLE"
mutation_rejected <- !all(vapply(mutation_copy, function(run) identical(run$class, mutation_expected), logical(1)))
controls <- list(
  positive_complete = if (fixture_results[[1L]]$status == "PASS" && fixture_results[[1L]]$expected_separation == "COMPLETE_SEPARATION") "PASS" else "FAIL",
  positive_quasi = if (fixture_results[[5L]]$status == "PASS" && fixture_results[[5L]]$expected_separation == "QUASI_COMPLETE_SEPARATION") "PASS" else "FAIL",
  negative_overlap = if (fixture_results[[9L]]$status == "PASS" && fixture_results[[9L]]$expected_separation == "OVERLAP_FINITE_MLE") "PASS" else "FAIL",
  invalid_input_lp_not_invoked = if (all(vapply(fixture_results[47:48], function(x) x$status == "PASS" && !x$detector_invoked, logical(1)))) "PASS" else "FAIL",
  result_mutation_falsification = if (mutation_baseline && mutation_rejected) "PASS" else "FAIL",
  direct_solver_status_capture = if (length(direct_statuses) == length(valid_rows) * 8L && all(direct_statuses %in% c("OPTIMAL", "PRESOLVED"))) "PASS" else "FAIL",
  direct_constructive_crosscheck = if (length(direct_relations) == length(valid_rows) * 8L && all(direct_relations == "CONSTRUCTIVE_CLASS_SUPPORTED")) "PASS" else "FAIL",
  repeatability = if (all(vapply(valid_rows, function(x) !("NONREPEATABLE_RESULT" %in% unlist(x$failure_codes)), logical(1)))) "PASS" else "FAIL",
  tolerance_sensitivity = if (all(vapply(valid_rows, function(x) length(unique(vapply(x$detector_runs, function(r) r$class, character(1)))) == 1L, logical(1)))) "PASS" else "FAIL"
)
overall <- if (all(statuses == "PASS") && all(unlist(controls) == "PASS")) "PASS" else "FAIL"
report <- list(
  schema = "CP-STAT-02-A1-NATIVE-LP-QUALIFICATION-v2",
  evidence_class = "EXPERIMENTAL_NATIVE_R_METHOD_QUALIFICATION_NOT_PRODUCTION",
  verdict = overall,
  commit_sha = system2("git", c("-C", shQuote(repo_root), "rev-parse", "HEAD"), stdout = TRUE)[[1L]],
  workflow_run_id = Sys.getenv("GITHUB_RUN_ID", unset = "LOCAL"),
  workflow_url = if (nzchar(Sys.getenv("GITHUB_SERVER_URL")) && nzchar(Sys.getenv("GITHUB_REPOSITORY")) && nzchar(Sys.getenv("GITHUB_RUN_ID"))) paste0(Sys.getenv("GITHUB_SERVER_URL"), "/", Sys.getenv("GITHUB_REPOSITORY"), "/actions/runs/", Sys.getenv("GITHUB_RUN_ID")) else "LOCAL",
  phase_baseline_sha = pins$phase_baseline_sha,
  preregistration_sha256 = matrix_hash,
  generation_contract_sha256 = sha256(file.path(a1_dir, "fixture-generation-contract-v1.md")),
  generation_clarification_sha256 = clarification_pins$clarification_sha256,
  fixture_generation_execution_correction = list(
    state = correction_pins$state,
    correction_path = correction_pins$correction_path,
    correction_sha256 = correction_pins$correction_sha256,
    correction_pins_sha256 = sha256(correction_pins_path),
    correction_commit_sha = system2("git", c("-C", shQuote(repo_root), "rev-parse", "HEAD"), stdout = TRUE)[[1L]],
    first_execution = correction_pins$first_execution,
    second_execution = correction_pins$second_execution,
    expected_classes_seeds_and_acceptance_rules_changed = correction_pins$hypotheses_expected_classes_seeds_and_acceptance_rules_changed
  ),
  r_version = r_version,
  rng_configuration = as.list(RNGkind()),
  package_versions = package_versions,
  implementation = list(package = "detectseparation", version = "0.4.0", api = "pre-fit detect_separation via stats::glm", implementation = "ROI", solver = "lpsolve", solver_package = "lpSolveAPI 5.5.2.0-17.15", solver_engine_version = "5.5.2.0 as identified by the lpSolveAPI documentation; no runtime engine-version getter is exposed by its documented API", feasibility_tolerances = list(1e-4, 1e-8), separation_type = TRUE, raw_solver_status = "NOT_EXPOSED_BY_PUBLIC_PACKAGE_API", supplemental_probe = "lpSolveAPI explicit bounded formulation, same lp_solve engine, two LP problems per call"),
  counts = list(
    preregistered = length(fixture_results),
    evaluated = length(fixture_results),
    valid_input_models = sum(vapply(fixture_results, function(x) x$expected_separation != "NOT_CLASSIFIABLE_INVALID_MODEL", logical(1))),
    invalid_input_models = sum(vapply(fixture_results, function(x) x$expected_separation == "NOT_CLASSIFIABLE_INVALID_MODEL", logical(1))),
    ground_truth_proven = sum(vapply(fixture_results, function(x) isTRUE(x$ground_truth_proof$proof_ok), logical(1))),
    ground_truth_failed = sum(vapply(fixture_results, function(x) "CONSTRUCTIVE_GROUND_TRUTH_FAILED" %in% unlist(x$failure_codes), logical(1))),
    method_evaluated_models = length(valid_rows),
    status = status_counts,
    expected_class_counts = expected_counts,
    false_positive_fixtures = fp,
    false_negative_fixtures = fn,
    unresolved_fixtures = unresolved,
    direct_threshold_unresolved_fixtures = direct_threshold_unresolved,
    detectseparation_calls = length(valid_rows) * 4L,
    direct_lp_problems = length(valid_rows) * 8L,
    direct_lp_solver_status_counts = as.list(table(direct_statuses)),
    direct_probe_relation_counts = as.list(table(direct_relations)),
    repeats_per_tolerance = 2L,
    median_lp_elapsed_ms = if (length(elapsed)) stats::median(elapsed) else NULL,
    maximum_lp_elapsed_ms = if (length(elapsed)) max(elapsed) else NULL
  ),
  controls = controls,
  falsification_controls = falsification_controls,
  fixtures = fixture_results,
  limitations = list(
    browser_webr_feasibility = "UNMEASURED",
    matching_and_cobalt_scenarios = "NOT_EVALUATED_BY_A1",
    public_solver_native_return_code = "NOT_EXPOSED_BY_PUBLIC_PACKAGE_API",
    supplemental_lp_solve_status = "Captured from lpSolveAPI::solve S3 dispatch; shares backend with candidate and is not independent solver validation",
    no_production_detector = TRUE,
    no_production_dependency_added = TRUE,
    no_causal_validity_claim = TRUE
  )
)
report_path <- file.path(outdir, "a1-qualification-results.json")
write_json(report, report_path)
session_path <- file.path(outdir, "session-info.txt")
writeLines(capture.output(utils::sessionInfo()), session_path, useBytes = TRUE)
summary_path <- file.path(outdir, "a1-qualification-report.md")
lines <- c(
  "# CP-STAT-02-A1 Native LP Qualification",
  "",
  paste0("Verdict: **", overall, "**"),
  paste0("Commit: ", report$commit_sha),
  paste0("Workflow: ", report$workflow_url),
  paste0("Generator execution correction: post-second-run v1.3; SHA-256 ", correction_pins$correction_sha256, "; first and second artifacts ", correction_pins$first_execution$artifact_id, " and ", correction_pins$second_execution$artifact_id, " remain preserved"),
  paste0("Valid input models: ", report$counts$valid_input_models, "; ground-truth proofs passed/failed: ", report$counts$ground_truth_proven, "/", report$counts$ground_truth_failed, "; method-evaluated models: ", report$counts$method_evaluated_models),
  paste0("Preregistered/evaluated scenarios: ", length(fixture_results), "/", length(fixture_results)),
  paste0("Fixture statuses: ", paste(names(status_counts), unlist(status_counts), collapse = "; ")),
  paste0("Class counts: ", paste(names(expected_counts), unlist(expected_counts), collapse = "; ")),
  paste0("False positives: ", fp, "; false negatives: ", fn, "; unresolved (including direct-threshold uncertainty): ", unresolved, "; direct-threshold-uncertain fixtures: ", direct_threshold_unresolved),
  paste0("detectseparation calls: ", report$counts$detectseparation_calls, "; direct LP problems: ", report$counts$direct_lp_problems, "; median combined ms: ", report$counts$median_lp_elapsed_ms, "; max combined ms: ", report$counts$maximum_lp_elapsed_ms),
  paste0("Direct solver statuses: ", paste(names(report$counts$direct_lp_solver_status_counts), unlist(report$counts$direct_lp_solver_status_counts), collapse = "; ")),
  paste0("Direct probe relations: ", paste(names(report$counts$direct_probe_relation_counts), unlist(report$counts$direct_probe_relation_counts), collapse = "; ")),
  "",
  "## Controls",
  "",
  paste0("- ", names(controls), ": ", unlist(controls)),
  "",
  "## Per-scenario outcomes",
  "",
  "| Fixture | Expected class | Observed classes (1e-4 / 1e-8, repeats) | Direct-probe relation counts | Rank | GLM converged | Status | Failure codes |",
  "|---|---|---|---|---:|---|---|---|"
)
for (fixture in fixture_results) {
  observed <- if (length(fixture$detector_runs)) paste(vapply(fixture$detector_runs, function(x) x$class, character(1)), collapse = " / ") else "LP not invoked"
  direct_relations <- if (length(fixture$detector_runs)) vapply(fixture$detector_runs, function(run) paste(vapply(run$direct_probe_assessments, function(a) a$classification, character(1)), collapse = ","), character(1)) else character()
  direct_summary <- if (length(direct_relations)) paste(direct_relations, collapse = " / ") else "LP not invoked"
  converged <- if (is.null(fixture$glm_observation)) "n/a" else as.character(fixture$glm_observation$converged)
  rank_value <- if (is.null(fixture$matrix_rank)) "n/a" else as.character(fixture$matrix_rank)
  failure_text <- if (length(fixture$failure_codes)) paste(unlist(fixture$failure_codes), collapse = ", ") else ""
  lines <- c(lines, paste0("| ", fixture$fixture_id, " | ", fixture$expected_separation, " | ", observed, " | ", direct_summary, " | ", rank_value, " | ", converged, " | ", fixture$status, " | ", failure_text, " |"))
}
lines <- c(lines,
  "",
  "## Interpretation and limits",
  "",
  "This is native R experimental evidence for the pinned detectseparation 0.4.0 LP method. It is not production implementation, browser feasibility, a universal detector certification, positivity assessment, matching qualification, or causal validation.",
  "The method's public object reports a method-level outcome; no portable low-level solver return code is exposed. A separate bounded lpSolveAPI probe records its public status codes and objectives, but uses the same lp_solve engine and is not an independent solver replication.",
  "Direct-probe thresholds label normalized objectives only. Positive values within a threshold remain UNRESOLVED; these thresholds do not rewrite mathematical ground truth or the detectseparation classification. See the machine-readable record for exact settings and raw values."
)
writeLines(lines, summary_path, useBytes = TRUE)
if (overall != "PASS") {
  message("A1 native LP qualification has FAIL rows; raw outcomes were written and remain failures.")
  quit(save = "no", status = 1L)
}
message(sprintf("A1 native LP qualification PASS: %s scenarios; %s detectseparation calls; %s direct LP problems.", length(fixture_results), report$counts$detectseparation_calls, report$counts$direct_lp_problems))
