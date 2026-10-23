#!/usr/bin/env Rscript

# Builds or restores a temporary renv project. The project lives in RUNNER_TEMP;
# only its lockfile and verified CRAN archive manifest are retained as evidence.
abort <- function(...) stop(sprintf(...), call. = FALSE)
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 6L || !identical(args[c(TRUE, FALSE)], c("--project", "--lockfile", "--bootstrap-lock"))) {
  abort("Usage: Rscript provision.R --project <temp-project> --lockfile <committed-lock-or-none> --bootstrap-lock <temp-output-lock>")
}
project <- normalizePath(args[[2L]], mustWork = FALSE)
committed_lock <- args[[4L]]
bootstrap_lock <- normalizePath(args[[6L]], mustWork = FALSE)
if (!requireNamespace("renv", quietly = TRUE)) abort("renv must be available from the already restored closure provisioning project")
dir.create(project, recursive = TRUE, showWarnings = FALSE)
# `fs` is a transitive dependency of the isolated detectseparation diagnostic
# environment. Its source supports bundling libuv when Ubuntu headers are not
# available; this flag is local to this temporary package provisioning path.
Sys.setenv(USE_BUNDLED_LIBUV = "1")
cat("USE_BUNDLED_LIBUV=1 (isolated diagnostic package build only)\n")

if (file.exists(committed_lock)) {
  renv::init(project = project, bare = TRUE, force = TRUE)
  file.copy(committed_lock, file.path(project, "renv.lock"), overwrite = TRUE)
  renv::restore(project = project, lockfile = file.path(project, "renv.lock"), prompt = FALSE)
  source <- "committed-forensics-renv-lock"
  lock_output <- file.path(project, "renv.lock")
} else {
  renv::init(project = project, bare = TRUE, force = TRUE)
  renv::install(c("detectseparation@0.4.0", "jsonlite@2.0.0"), project = project)
  renv::snapshot(project = project, lockfile = bootstrap_lock, type = "all", prompt = FALSE, force = TRUE)
  source <- "first-run-bootstrap-lock-candidate"
  lock_output <- bootstrap_lock
}

lock_contents <- jsonlite::fromJSON(lock_output, simplifyVector = FALSE)
locked_packages <- lock_contents$Packages
locked_version <- function(name) {
  entry <- locked_packages[[name]]
  if (is.null(entry)) return(NA_character_)
  as.character(entry$Version)
}
if (!identical(locked_version("detectseparation"), "0.4.0") || !identical(locked_version("jsonlite"), "2.0.0")) {
  abort("Forensic renv lock must record detectseparation 0.4.0 and jsonlite 2.0.0; snapshot was incomplete")
}

lib <- renv::paths$library(project = project)
cat(sprintf("project=%s\n", project))
cat(sprintf("library=%s\n", lib))
cat(sprintf("lock=%s\n", lock_output))
cat(sprintf("lock_source=%s\n", source))
cat(sprintf("detectseparation=%s\n", as.character(utils::packageVersion("detectseparation", lib.loc = lib))))
cat(sprintf("jsonlite=%s\n", as.character(utils::packageVersion("jsonlite", lib.loc = lib))))
