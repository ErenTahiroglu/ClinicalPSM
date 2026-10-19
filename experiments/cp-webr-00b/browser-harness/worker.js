// CP-WEBR-00B Dedicated Application Worker
// Execution context: DedicatedWorkerGlobalScope
// Encapsulates WebR runtime, MatchIt 4.8.1, cobalt 5.0.0
// Explicitly isolated from the browser Window main thread

import { WebR } from '/webr/webr.js';

let webr = null;
let initialized = false;
let currentWorkloadPromise = null;

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

      // Install packages from self-hosted local repo
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
        wasm_linear_memory_bytes: null, // Private to WebR internal worker; reported as explicit null / UNMEASURED
        init_duration_ms: performance.now() - t0,
        pkg_install_duration_ms: pkgTime,
        cross_origin_isolated: self.crossOriginIsolated
      });
      return;
    }

    if (type === 'RUN_PIPELINE') {
      if (!initialized) throw new Error('DedicatedWorker: WebR is not initialized');
      const { csvData, formula, link, caliper, std_caliper, discard } = payload;

      const t0 = performance.now();

      // 1. JS to R Transfer
      const tJs2R0 = performance.now();
      await webr.FS.writeFile('/tmp/data.csv', new TextEncoder().encode(csvData));
      const js2RTime = performance.now() - tJs2R0;

      // 2. Matching & GLM Execution
      const tMatch0 = performance.now();
      const cal_val = (caliper === null || caliper === undefined) ? 'NULL' : Number(caliper);
      const std_val = std_caliper ? 'TRUE' : 'FALSE';
      const rScript = `
        df <- read.csv('/tmp/data.csv', stringsAsFactors = FALSE)
        rownames(df) <- df$id
        for (col in names(df)) {
          if (is.character(df[[col]]) && col != "id") {
            df[[col]] <- as.factor(df[[col]])
          }
        }
        m_out <- MatchIt::matchit(
          as.formula("${formula}"),
          data = df,
          method = "nearest",
          distance = "glm",
          link = "${link || 'linear.logit'}",
          caliper = ${cal_val},
          std.caliper = ${std_val},
          discard = "${discard || 'none'}",
          replace = FALSE,
          ratio = 1
        )
        matched_pairs_list <- list()
        if (!is.null(m_out$match.matrix)) {
          for (t_id in rownames(m_out$match.matrix)) {
            c_id <- m_out$match.matrix[t_id, 1]
            if (!is.na(c_id)) {
              matched_pairs_list[[length(matched_pairs_list) + 1]] <- list(treatment = t_id, control = c_id)
            }
          }
        }
        list(
          n_pairs = length(matched_pairs_list)
        )
      `;
      const matchResObj = await webr.evalR(rScript);
      const matchTime = performance.now() - tMatch0;

      // 3. Cobalt Execution
      const tCobalt0 = performance.now();
      const cobaltScript = `
        b_raw <- cobalt::bal.tab(m_out, un = TRUE, binary = "raw", continuous = "std", s.d.denom = "treated")
        b_std <- cobalt::bal.tab(m_out, un = TRUE, binary = "std", continuous = "std", s.d.denom = "treated")
        b_df <- as.data.frame(b_raw$Balance)
        raw_covs <- rownames(b_df)
        canon_covs <- ifelse(grepl("^distance", raw_covs), "distance", raw_covs)
        list(
          covariates = canon_covs,
          diff_un = as.list(setNames(b_df$Diff.Un, canon_covs)),
          diff_adj = as.list(setNames(b_df$Diff.Adj, canon_covs))
        )
      `;
      const cobaltResObj = await webr.evalR(cobaltScript);
      const cobaltTime = performance.now() - tCobalt0;

      // 4. Result Serialization
      const tSer0 = performance.now();
      const matchJs = await matchResObj.toJs();
      const cobaltJs = await cobaltResObj.toJs();
      const rHeapMb = (await (await webr.evalR('sum(gc()[,2])')).toJs()).values[0];
      const serTime = performance.now() - tSer0;

      const totalTime = performance.now() - t0;

      self.postMessage({
        id,
        type: 'PIPELINE_SUCCESS',
        execution_context: 'DedicatedWorker',
        timings: {
          total_ms: totalTime,
          js_to_r_ms: js2RTime,
          matching_ms: matchTime,
          cobalt_ms: cobaltTime,
          serialization_ms: serTime
        },
        r_heap_memory_mb: rHeapMb,
        wasm_linear_memory_bytes: null, // UNMEASURED across worker boundary
        n_pairs: matchJs.values[0].values[0],
        cobalt: cobaltJs.values
      });
      return;
    }

    if (type === 'START_LONG_WORKLOAD') {
      if (!initialized) throw new Error('DedicatedWorker: WebR not initialized');
      // Starts measurable long-running loop in WebR
      currentWorkloadPromise = webr.evalR('for (i in 1:1e8) { Sys.sleep(0.02) }');
      self.postMessage({ id, type: 'WORKLOAD_STARTED', execution_context: 'DedicatedWorker' });
      try {
        await currentWorkloadPromise;
      } catch {
        // Workload cancelled/interrupted as expected
      } finally {
        currentWorkloadPromise = null;
      }
      return;
    }

    if (type === 'INTERRUPT') {
      const t0 = performance.now();
      if (webr) {
        await webr.interrupt();
      }
      // Verify cessation and verify worker recovery with simple arithmetic
      const recoveryObj = await webr.evalR('40 + 2');
      const recoveredVal = (await recoveryObj.toJs()).values[0];
      const latency = performance.now() - t0;

      self.postMessage({
        id,
        type: 'INTERRUPT_SUCCESS',
        execution_context: 'DedicatedWorker',
        interrupt_latency_ms: latency,
        recovered: recoveredVal === 42
      });
      return;
    }

    if (type === 'TRIGGER_PROHIBITED_EGRESS') {
      // Negative Control B: Worker-originated prohibited egress containing synthetic sentinel
      const { url, sentinel } = payload;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Sentinel-Worker': sentinel
          },
          body: JSON.stringify({ sentinel_payload: sentinel })
        });
        self.postMessage({
          id,
          type: 'PROHIBITED_EGRESS_RESPONSE',
          execution_context: 'DedicatedWorker',
          status: res.status
        });
      } catch (err) {
        self.postMessage({
          id,
          type: 'PROHIBITED_EGRESS_BLOCKED',
          execution_context: 'DedicatedWorker',
          error: err.message
        });
      }
      return;
    }

    throw new Error(`DedicatedWorker: Unknown message type "${type}"`);
  } catch (err) {
    self.postMessage({
      id,
      type: 'ERROR',
      execution_context: 'DedicatedWorker',
      error: err.message,
      stack: err.stack
    });
  }
};
