// CP-WEBR-01B Dedicated Application Worker
// Implements safe parameter binding with REnvironment, typed proxies, and static R templates

import { WebR } from '/webr/webr.js';

let webr = null;
let initialized = false;

const REQUIRED_PACKAGES = [
  'Rcpp', 'R6', 'cli', 'rlang', 'vctrs', 'glue', 'withr', 'lifecycle',
  'gtable', 'scales', 'farver', 'labeling', 'isoband', 'ggplot2',
  'gridExtra', 'viridisLite', 'S7', 'arg', 'RColorBrewer', 'MatchIt', 'cobalt'
];

self.onmessage = async (e) => {
  const { type, payload, id } = e.data;

  try {
    if (type === 'PING') {
      self.postMessage({ id, type: 'PONG', execution_context: 'DedicatedWorker' });
      return;
    }

    if (type === 'INIT') {
      const t0 = performance.now();
      webr = new WebR({
        baseUrl: '/webr/',
        serviceWorkerUrl: '/webr/'
      });
      await webr.init();

      const tPkg0 = performance.now();
      await webr.installPackages(REQUIRED_PACKAGES, {
        repos: [self.location.origin + '/repo']
      });
      await webr.evalR('library(MatchIt); library(cobalt)');
      const pkgTime = performance.now() - tPkg0;
      initialized = true;

      const rVer = (await (await webr.evalR('R.version.string')).toJs()).values[0];
      const rHeapMb = (await (await webr.evalR('sum(gc()[,2])')).toJs()).values[0];

      self.postMessage({
        id,
        type: 'INIT_SUCCESS',
        execution_context: 'DedicatedWorker',
        r_version: rVer,
        r_heap_memory_mb: rHeapMb,
        wasm_linear_memory_bytes: null, // Private WebAssembly memory; reported as UNMEASURED
        init_duration_ms: performance.now() - t0,
        pkg_install_duration_ms: pkgTime,
        cross_origin_isolated: self.crossOriginIsolated
      });
      return;
    }

    if (type === 'RUN_BOUND_PIPELINE') {
      if (!initialized) throw new Error('DedicatedWorker: WebR not initialized');

      const {
        row_ids,
        trt_01,
        covariates,
        covariate_aliases,
        factor_aliases,
        options
      } = payload;

      const t0 = performance.now();

      // 1. Create isolated REnvironment and bind all parameters
      const env = await new webr.REnvironment();

      await env.bind('row_ids', await new webr.RCharacter(row_ids));
      await env.bind('trt_01', await new webr.RInteger(trt_01));
      await env.bind('covariate_aliases', await new webr.RCharacter(covariate_aliases));
      await env.bind('factor_aliases', await new webr.RCharacter(factor_aliases));

      for (const alias of covariate_aliases) {
        const covData = covariates[alias];
        if (covData.type === 'factor') {
          await env.bind(alias, await new webr.RCharacter(covData.values));
          await env.bind(`${alias}_levels`, await new webr.RCharacter(covData.levels));
        } else {
          await env.bind(alias, await new webr.RDouble(covData.values));
        }
      }

      await env.bind('link_str', await new webr.RCharacter(options.link || 'linear.logit'));
      await env.bind('estimand_str', await new webr.RCharacter(options.estimand || 'ATT'));
      await env.bind('m_order_str', await new webr.RCharacter(options.m_order || 'largest'));
      await env.bind('std_caliper_bool', await new webr.RLogical(options.std_caliper === true));

      if (options.caliper !== null && options.caliper !== undefined) {
        await env.bind('caliper_val', await new webr.RDouble(Number(options.caliper)));
      } else {
        await env.bind('caliper_val', webr.objs.null);
      }

      // 2. Execute 100% Constant Static R Script Template
      const staticTemplate = `
        df <- data.frame(row.names = row_ids)
        df[['trt_01']] <- as.integer(trt_01)
        for (alias in covariate_aliases) {
          raw_val <- get(alias)
          if (alias %in% factor_aliases) {
            levs <- get(paste0(alias, '_levels'))
            df[[alias]] <- factor(raw_val, levels = levs)
          } else {
            df[[alias]] <- as.numeric(raw_val)
          }
        }

        # Check sentinels in R dataframe directly
        sentinels_in_df <- any(grepl("SYNTH_PT_", rownames(df))) || any(grepl("FACTOR_LEVEL_", unlist(df)))

        # Build formula safely via reformulate
        fml <- stats::reformulate(termlabels = covariate_aliases, response = "trt_01")

        m_out <- MatchIt::matchit(
          formula = fml,
          data = df,
          method = "nearest",
          distance = "glm",
          link = link_str,
          estimand = estimand_str,
          m.order = m_order_str,
          caliper = if (is.null(caliper_val)) NULL else caliper_val,
          std.caliper = std_caliper_bool,
          replace = FALSE,
          ratio = 1
        )

        bal_tab <- cobalt::bal.tab(m_out, un = TRUE)
        bal_mat <- as.matrix(bal_tab$Balance)

        # Extract matched pairs
        match_mat <- m_out$match.matrix
        treated_names <- rownames(match_mat)
        matched_pairs <- list()
        pair_idx <- 1

        for (i in seq_along(treated_names)) {
          t_id <- treated_names[i]
          c_id <- match_mat[i, 1]
          if (!is.na(c_id)) {
            matched_pairs[[pair_idx]] <- list(
              treated = t_id,
              control = c_id,
              treated_ps = as.numeric(m_out$distance[t_id]),
              control_ps = as.numeric(m_out$distance[c_id])
            )
            pair_idx <- pair_idx + 1
          }
        }

        list(
          sentinels_verified_in_df = sentinels_in_df,
          nn = as.list(as.data.frame(m_out$nn)),
          matched_pairs = matched_pairs,
          balance_cols = colnames(bal_mat),
          balance_rows = rownames(bal_mat),
          balance_values = as.vector(bal_mat),
          r_heap_mb = sum(gc()[,2])
        )
      `;

      const evalRes = await webr.evalR(staticTemplate, { env });
      const jsResult = await evalRes.toJs();

      // Deallocate intermediate env
      await webr.destroy(env);

      self.postMessage({
        id,
        type: 'PIPELINE_SUCCESS',
        result: jsResult,
        duration_ms: performance.now() - t0
      });
      return;
    }

    if (type === 'TRIGGER_PROHIBITED_LEAK_WORKER') {
      try {
        const resp = await fetch('/api/prohibited-leak-worker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leak: 'PROHIBITED_WORKER_EGRESS', sentinel: payload.sentinel })
        });
        self.postMessage({ id, type: 'PROHIBITED_LEAK_RESPONSE', status: resp.status });
      } catch (err) {
        self.postMessage({ id, type: 'PROHIBITED_LEAK_BLOCKED', error: err.message });
      }
      return;
    }

    if (type === 'TRIGGER_FALSIFICATION') {
      try {
        const resp = await fetch('/api/mock-falsification-sink', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            falsification: true,
            sentinel: payload.sentinel || 'FALSIFICATION_SENTINEL_PAYLOAD_339a1c',
            timestamp: Date.now()
          })
        });
        const data = await resp.json();
        self.postMessage({ id, type: 'FALSIFICATION_RESPONSE', status: resp.status, data });
      } catch (err) {
        self.postMessage({ id, type: 'FALSIFICATION_NETWORK_ERROR', error: err.message });
      }
      return;
    }

    if (type === 'CLOSE_WEBR') {
      if (webr) {
        webr.close();
        webr = null;
        initialized = false;
      }
      self.postMessage({ id, type: 'WEBR_CLOSED' });
      return;
    }

    throw new Error(`Unknown message type: ${type}`);
  } catch (error) {
    self.postMessage({
      id,
      type: 'WORKER_ERROR',
      error: error.message,
      stack: error.stack
    });
  }
};
