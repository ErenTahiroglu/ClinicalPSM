// Diagnostic-only WebR execution in a shadow Dedicated Worker. It is not the
// production worker and its output must not be described as production output.
import { WebR, ChannelType } from "/assets/webr/webr.js";

let runtime;

function serializeNode(node) {
  if (node === null || typeof node !== "object") return node;
  if (node.type === "null") return null;
  if (Array.isArray(node)) {
    const values = node.map(serializeNode);
    // WebR toJs can represent an R scalar as a one-element JS array (including
    // list members). Preserve vectors, but serialize scalar values as scalars
    // so fixture IDs, booleans, and numeric fields retain their R semantics.
    return values.length === 1 ? values[0] : values;
  }
  if (Object.hasOwn(node, "values") && Object.hasOwn(node, "type")) {
    const values = (node.values || []).map(serializeNode);
    if (node.names && node.names.length === values.length) {
      return Object.fromEntries(node.names.map((name, index) => [name, values[index]]));
    }
    return values;
  }
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, serializeNode(value)]));
}

function rQuote(value) {
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\n", "\\n")}'`;
}

function diagnosticCode(fixture) {
  const file = `/tmp/${fixture.id}.csv`;
  const formula = rQuote(fixture.formula);
  return `
    options(digits = 17)
    data <- utils::read.csv(${rQuote(file)}, check.names = FALSE, stringsAsFactors = FALSE)
    rownames(data) <- as.character(data$id)
    formula <- stats::as.formula(${formula})
    warnings <- character()
    fit <- withCallingHandlers(
      stats::glm(formula, data = data, family = stats::binomial()),
      warning = function(w) { warnings <<- c(warnings, conditionMessage(w)); invokeRestart("muffleWarning") }
    )
    sm <- summary(fit)
    x <- stats::model.matrix(formula, data = data)
    y <- stats::model.response(stats::model.frame(formula, data = data))
    weighted_x <- x * sqrt(stats::weights(fit, type = "working"))
    info <- crossprod(weighted_x)
    q <- fit$qr
    r <- qr.R(q)
    qr_cov_pivot <- tryCatch(chol2inv(r), error = function(e) NULL)
    qr_cov <- NULL
    if (!is.null(qr_cov_pivot)) {
      qr_cov <- matrix(NA_real_, length(q$pivot), length(q$pivot), dimnames = list(colnames(x), colnames(x)))
      qr_cov[q$pivot, q$pivot] <- qr_cov_pivot
    }
    mat <- function(z) list(row_names = rownames(z), column_names = colnames(z),
      values = lapply(seq_len(nrow(z)), function(i) as.list(unname(z[i, , drop = TRUE]))),
      decimal17 = lapply(seq_len(nrow(z)), function(i) as.list(sprintf("%.17g", z[i, ]))))
    vals <- function(z) list(names = names(z), values = as.list(unname(z)),
      decimal17 = if (is.numeric(z)) as.list(ifelse(is.finite(z), sprintf("%.17g", z), NA_character_)) else NULL)
    svdvals <- function(z) tryCatch(svd(z, nu = 0L, nv = 0L)$d, error = function(e) numeric())
    cond <- function(z) { d <- svdvals(z); if (!length(d) || min(d) == 0) Inf else max(d) / min(d) }
    scaled <- sweep(weighted_x, 2L, ifelse(sqrt(colSums(weighted_x^2)) == 0, 1, sqrt(colSums(weighted_x^2))), "/")
    list(
      id = ${rQuote(fixture.id)},
      input = list(row_ids = rownames(x), row_count = nrow(x), formula = deparse(formula), treatment = as.list(y)),
      glm = list(warnings = warnings, coefficients = vals(stats::coef(fit)),
        summary_coefficients = mat(sm$coefficients), vcov = mat(stats::vcov(fit)),
        covariance_unscaled = mat(sm$cov.unscaled), covariance_scaled = mat(sm$cov.scaled),
        se_from_vcov = vals(sqrt(diag(stats::vcov(fit)))), converged = isTRUE(fit$converged),
        iter = as.integer(fit$iter), rank = as.integer(fit$rank), deviance = unname(fit$deviance),
        null_deviance = unname(fit$null.deviance), linear_predictors = vals(fit$linear.predictors),
        fitted_values = vals(fit$fitted.values),
        fitted_probability_range = list(minimum = min(fit$fitted.values), maximum = max(fit$fitted.values)),
        working_weights = vals(stats::weights(fit, type = "working")),
        prior_weights = vals(stats::weights(fit, type = "prior")), boundary = isTRUE(fit$boundary),
        aliased = as.list(is.na(stats::coef(fit)))),
      model_matrix = list(row_ids = rownames(x), columns = colnames(x), values = mat(x), response = vals(y)),
      factorization = list(qr_rank = as.integer(q$rank), pivot = as.list(as.integer(q$pivot)),
        qraux = vals(q$qraux), tolerance = unname(q$tol), r_factor = mat(r),
        qr_covariance_reconstruction_from_stored_R = if (is.null(qr_cov)) NULL else mat(qr_cov),
        qr_covariance_reconstruction_matches_unscaled = if (is.null(qr_cov)) NULL else isTRUE(all.equal(qr_cov, sm$cov.unscaled, tolerance = 1e-12)),
        information_matrix_from_final_working_weights = mat(info),
        normal_equation_inverse_diagnostic_only = tryCatch(mat(solve(info)), error = function(e) NULL),
        condition = list(weighted_model_matrix = list(value = cond(weighted_x), singular_values = as.list(svdvals(weighted_x))),
          column_scaled_weighted_model_matrix = list(value = cond(scaled), singular_values = as.list(svdvals(scaled))),
          unscaled_information_matrix_eigenvalue_ratio = tryCatch({ e <- eigen(info, symmetric = TRUE, only.values = TRUE)$values; if (min(abs(e)) == 0) Inf else max(abs(e)) / min(abs(e)) }, error = function(e) NA_real_),
          information_eigenvalues = tryCatch(as.list(eigen(info, symmetric = TRUE, only.values = TRUE)$values), error = function(e) list()),
          weighted_column_norms = vals(sqrt(colSums(weighted_x^2))))),
      environment = list(r_version = R.version.string, r_platform = R.version$platform,
        locale = Sys.getlocale(), timezone = Sys.timezone(), extSoftVersion = as.list(extSoftVersion()),
        session_info = paste(capture.output(utils::sessionInfo()), collapse = "\\n"))
    )
  `;
}

self.onmessage = async event => {
  const message = event.data || {};
  if (message.type !== "RUN") return;
  try {
    const isolated = Boolean(self.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined");
    const selectedChannel = isolated ? "SharedArrayBuffer" : "PostMessage";
    const channelType = isolated ? ChannelType.SharedArrayBuffer : ChannelType.PostMessage;
    runtime = new WebR({ baseUrl: "/assets/webr/", repoUrl: "/assets/repo", channelType });
    await runtime.init();
    const results = [];
    for (const fixture of message.fixtures) {
      const file = `/tmp/${fixture.id}.csv`;
      await runtime.FS.writeFile(file, new TextEncoder().encode(fixture.csv));
      const raw = await runtime.evalR(diagnosticCode(fixture));
      const record = serializeNode(await raw.toJs({ depth: 0 }));
      await runtime.destroy(raw);
      results.push(record);
    }
    const environmentRaw = await runtime.evalR(`list(r_version=R.version.string, r_platform=R.version$platform,
      extSoftVersion=as.list(extSoftVersion()), locale=Sys.getlocale(), session_info=paste(capture.output(utils::sessionInfo()), collapse="\\n"))`);
    const rEnvironment = serializeNode(await environmentRaw.toJs({ depth: 0 }));
    await runtime.destroy(environmentRaw);
    self.postMessage({
      type: "RESULT",
      evidence_classification: "WEBR_DIAGNOSTIC_SHADOW_EXECUTION",
      replicate: message.replicate,
      runtime: {
        webr_version: message.webrVersion,
        channel: selectedChannel,
        channel_type_value: channelType,
        page_cross_origin_isolated: message.pageCrossOriginIsolated,
        worker_cross_origin_isolated: self.crossOriginIsolated,
        shared_array_buffer_available: typeof SharedArrayBuffer !== "undefined",
        r_environment: rEnvironment
      },
      fixtures: results
    });
    await runtime.close();
    runtime = undefined;
  } catch (error) {
    self.postMessage({ type: "ERROR", replicate: message.replicate, error: String(error?.stack || error) });
    try { runtime?.close(); } catch {}
  }
};
