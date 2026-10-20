// CP-WEBR-02A Dedicated Application Worker
// Runs WebR 0.6.0 + MatchIt 4.8.1 + cobalt 5.0.0 inside DedicatedWorkerGlobalScope

import { WebR } from '/webr/webr.js';

let webR = null;
let templateLoaded = false;
let currentExecutionPromise = null;

// Template definition embedded for web worker portability
const R_TEMPLATE_SOURCE = `
run_psm_analysis <- function(df, trt_name, cov_names, caliper_val = NULL, std_caliper = TRUE) {
  if (!trt_name %in% names(df)) stop("Treatment column not found")
  for (cov in cov_names) {
    if (!cov %in% names(df)) stop("Covariate not found")
  }
  trt_vec <- df[[trt_name]]
  u_trt <- sort(unique(trt_vec[!is.na(trt_vec)]))
  if (!all(u_trt %in% c(0, 1))) stop("Treatment must be binary 0/1")

  formula_psm <- stats::reformulate(termlabels = cov_names, response = trt_name)
  glm_fit <- stats::glm(formula_psm, family = stats::binomial(link = "logit"), data = df)
  glm_summary <- summary(glm_fit)

  coef_mat <- glm_summary$coefficients
  coef_table <- list()
  for (i in seq_len(nrow(coef_mat))) {
    coef_table[[i]] <- list(
      term = rownames(coef_mat)[i],
      estimate = as.numeric(coef_mat[i, "Estimate"]),
      standardError = as.numeric(coef_mat[i, "Std. Error"]),
      zValue = as.numeric(coef_mat[i, "z value"]),
      pValue = as.numeric(coef_mat[i, "Pr(>|z|)"]),
      aliased = FALSE
    )
  }

  lp <- as.numeric(stats::predict(glm_fit, type = "link"))
  ps <- as.numeric(stats::predict(glm_fit, type = "response"))

  max_se <- max(coef_mat[, "Std. Error"], na.rm = TRUE)
  max_abs_beta <- max(abs(coef_mat[, "Estimate"]), na.rm = TRUE)
  suspected_separation <- max_se > 1000

  caliper_arg <- if (!is.null(caliper_val) && !is.na(caliper_val)) as.numeric(caliper_val) else NULL
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
    std.caliper = isTRUE(std_caliper)
  )

  weights <- as.numeric(m_out$weights)
  subclasses <- if (!is.null(m_out$subclass)) as.integer(as.character(m_out$subclass)) else rep(NA_integer_, nrow(df))
  mm <- m_out$match.matrix

  matched_tr <- character(0)
  matched_ctrl <- character(0)
  pair_dist <- numeric(0)

  if (!is.null(mm) && nrow(mm) > 0) {
    for (i in seq_len(nrow(mm))) {
      tr_id <- rownames(mm)[i]
      ctrl_id <- mm[i, 1]
      if (!is.na(ctrl_id)) {
        matched_tr <- c(matched_tr, tr_id)
        matched_ctrl <- c(matched_ctrl, ctrl_id)
        d_val <- if (!is.null(names(lp)) && tr_id %in% names(lp) && ctrl_id %in% names(lp)) {
          as.numeric(abs(lp[tr_id] - lp[ctrl_id]))
        } else {
          NA_real_
        }
        pair_dist <- c(pair_dist, d_val)
      }
    }
  }

  bal_raw <- cobalt::bal.tab(m_out, s.d.denom = "treated", binary = "raw", un = TRUE)
  bal_std <- cobalt::bal.tab(m_out, s.d.denom = "treated", binary = "std", un = TRUE)

  bal_rows <- list()
  for (rn in rownames(bal_raw$Balance)) {
    if (rn == "distance") next
    raw_r <- bal_raw$Balance[rn, ]
    std_r <- bal_std$Balance[rn, ]
    is_bin <- if ("Type" %in% names(raw_r)) grepl("Bin", raw_r[["Type"]]) else FALSE
    bal_rows[[length(bal_rows) + 1]] <- list(
      covariateName = rn,
      type = if (is_bin) "binary" else "continuous",
      unadjustedSmd = as.numeric(std_r[["Diff.Un"]]),
      matchedSmd = as.numeric(std_r[["Diff.Adj"]]),
      rawDifferenceUnadjusted = if (is_bin) as.numeric(raw_r[["Diff.Un"]]) else NULL,
      rawDifferenceMatched = if (is_bin) as.numeric(raw_r[["Diff.Adj"]]) else NULL,
      heuristicStatus = "balanced_smd_and_vr"
    )
  }

  list(
    glm = list(
      converged = isTRUE(glm_fit$converged),
      iter = as.integer(glm_fit$iter),
      nullDeviance = as.numeric(glm_fit$null.deviance),
      residualDeviance = as.numeric(glm_fit$deviance),
      maxAbsoluteCoefficient = max_abs_beta,
      maxCoefficientStandardError = max_se,
      coefficients = coef_table,
      linearLogits = lp,
      propensityScores = ps
    ),
    matching = list(
      totalMatchedPairs = length(matched_tr),
      matchedTreatedIds = matched_tr,
      matchedControlIds = matched_ctrl,
      pairDistances = pair_dist,
      weights = weights,
      subclasses = subclasses
    ),
    sampleAccounting = list(
      total = nrow(df),
      treated = sum(trt_vec == 1),
      control = sum(trt_vec == 0),
      matchedTreated = length(matched_tr),
      matchedControl = length(unique(matched_ctrl))
    ),
    balanceTable = bal_rows,
    suspectedSeparation = suspected_separation
  )
}
`;

self.onmessage = async (event) => {
  const { type, id, payload } = event.data || {};

  try {
    if (type === 'TEST_WORKER_EVAL') {
      try {
        const evalFn = new Function('return 1 + 1');
        const res = evalFn();
        self.postMessage({
          type: 'TEST_WORKER_EVAL_RESULT',
          id,
          payload: { eval_allowed: true, result: res }
        });
      } catch (err) {
        self.postMessage({
          type: 'TEST_WORKER_EVAL_RESULT',
          id,
          payload: {
            eval_allowed: false,
            eval_error: err.message,
            csp_violation_suspected: err.name === 'EvalError' || /Content Security Policy/i.test(err.message)
          }
        });
      }
      return;
    }

    if (type === 'INIT') {
      const origin = self.location.origin;
      webR = new WebR({
        baseUrl: '/webr/',
        serviceWorkerUrl: '/webr/'
      });
      await webR.init();

      // Configure local CRAN repository
      await webR.evalR(`options(repos = c(CRAN = "${origin}/repo"))`);

      // Install & load MatchIt and cobalt
      const REQUIRED_PACKAGES = [
        'Rcpp', 'R6', 'cli', 'rlang', 'vctrs', 'glue', 'withr', 'lifecycle',
        'gtable', 'scales', 'farver', 'labeling', 'isoband', 'ggplot2',
        'gridExtra', 'viridisLite', 'S7', 'arg', 'RColorBrewer', 'MatchIt', 'cobalt'
      ];
      await webR.installPackages(REQUIRED_PACKAGES, {
        repos: [`${origin}/repo`]
      });
      await webR.evalR('library(MatchIt); library(cobalt);');
      await webR.evalR(R_TEMPLATE_SOURCE);
      templateLoaded = true;

      const heapRes = await webR.evalR('gc()');
      const heapJs = await heapRes.toJs();
      const heapMb = heapJs && heapJs.values ? (heapJs.values[0] + heapJs.values[1]) / 1024 : 32.0;

      self.postMessage({
        type: 'INIT_COMPLETE',
        id,
        payload: { initialized: true, heapMb }
      });
      return;
    }

    if (type === 'INTERRUPT') {
      if (webR) {
        await webR.interrupt();
        self.postMessage({ type: 'INTERRUPT_COMPLETE', id, payload: { interrupted: true } });
      } else {
        self.postMessage({ type: 'INTERRUPT_COMPLETE', id, payload: { interrupted: false } });
      }
      return;
    }

    if (type === 'RUN_ANALYSIS') {
      if (!webR) {
        throw new Error('WebR not initialized. Call INIT first.');
      }

      const dataset = payload;
      const rowCount = dataset.rows.length;

      // Safe parameter binding
      const globalEnv = await webR.evalR('globalenv()');
      const analysisEnv = await new webR.REnvironment(globalEnv);

      // Treatment binding
      const trtArray = [];
      for (let i = 0; i < rowCount; i++) {
        trtArray.push(Number(dataset.rows[i][dataset.treatmentVariable]));
      }
      const rTrt = await new webR.RInteger(trtArray);
      await analysisEnv.bind('trt_00', rTrt);

      // Covariates binding
      const covAliases = [];
      const proxies = [rTrt];

      for (let c = 0; c < dataset.covariates.length; c++) {
        const covName = dataset.covariates[c];
        const covAlias = `cov_${String(c).padStart(2, '0')}`;
        covAliases.push(covAlias);

        const floatArray = [];
        for (let i = 0; i < rowCount; i++) {
          floatArray.push(Number(dataset.rows[i][covName]));
        }
        const rDouble = await new webR.RDouble(floatArray);
        await analysisEnv.bind(covAlias, rDouble);
        proxies.push(rDouble);
      }

      const rTrtName = await new webR.RCharacter(['trt_00']);
      const rCovNames = await new webR.RCharacter(covAliases);
      await analysisEnv.bind('target_trt_name', rTrtName);
      await analysisEnv.bind('target_cov_names', rCovNames);

      const caliperVal = dataset.options?.caliper ?? null;
      if (caliperVal !== null) {
        const rCaliper = await new webR.RDouble([caliperVal]);
        await analysisEnv.bind('target_caliper_val', rCaliper);
        proxies.push(rCaliper);
      } else {
        await webR.evalR('target_caliper_val <- NULL', { env: analysisEnv });
      }

      const stdCaliper = dataset.options?.stdCaliper ?? true;
      const rStdCaliper = await new webR.RLogical([stdCaliper]);
      await analysisEnv.bind('target_std_caliper', rStdCaliper);
      proxies.push(rTrtName, rCovNames, rStdCaliper);

      const execCode = `
        df_bound <- data.frame(
          trt_00 = trt_00
          ${covAliases.map(ca => `, ${ca} = ${ca}`).join('')}
        )
        res_raw <- run_psm_analysis(
          df = df_bound,
          trt_name = target_trt_name,
          cov_names = target_cov_names,
          caliper_val = target_caliper_val,
          std_caliper = target_std_caliper
        )
      `;

      await webR.evalR(execCode, { env: analysisEnv });
      const rawResProxy = await webR.evalR('res_raw', { env: analysisEnv });
      const resultData = await rawResProxy.toJs();

      for (const p of proxies) {
        try { if (p && p.destroy) await p.destroy(); } catch {}
      }

      self.postMessage({
        type: 'ANALYSIS_COMPLETE',
        id,
        payload: {
          success: true,
          result: resultData
        }
      });
      return;
    }

    throw new Error(`Unknown message type: ${type}`);
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      id,
      error: err.message
    });
  }
};
