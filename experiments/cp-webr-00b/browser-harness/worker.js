// CP-WEBR-00B Browser Web Worker
// Executes WebR 0.6.0, MatchIt 4.8.1, cobalt 5.0.0 inside the browser environment

import { WebR } from '/webr/webr.mjs';

let webr = null;
let initialized = false;

self.onmessage = async (e) => {
  const { type, payload, id } = e.data;

  try {
    if (type === 'INIT') {
      const t0 = performance.now();
      webr = new WebR({
        baseUrl: '/webr/',
        serviceWorkerUrl: '/webr/'
      });
      await webr.init();

      // Install packages from self-hosted local repo
      const tPkg0 = performance.now();
      await webr.installPackages(['MatchIt', 'cobalt', 'jsonlite'], {
        repos: [self.location.origin + '/repo']
      });
      await webr.evalR('library(MatchIt); library(cobalt); library(jsonlite)');
      const pkgTime = performance.now() - tPkg0;
      initialized = true;

      const rVer = (await (await webr.evalR('R.version.string')).toJs()).values[0];
      const wasmMemory = webr._instance ? (webr._instance.HEAP8 ? webr._instance.HEAP8.length : null) : null;

      self.postMessage({
        id,
        type: 'INIT_SUCCESS',
        r_version: rVer,
        wasm_memory_bytes: wasmMemory,
        init_duration_ms: performance.now() - t0,
        pkg_install_duration_ms: pkgTime,
        cross_origin_isolated: self.crossOriginIsolated
      });
      return;
    }

    if (type === 'RUN_PIPELINE') {
      if (!initialized) throw new Error('WebR worker not initialized');
      const { csvData, formula, link, caliper, std_caliper, discard } = payload;

      const t0 = performance.now();

      // 1. JS to R Transfer
      const tJs2R0 = performance.now();
      await webr.FS.writeFile('/tmp/data.csv', new TextEncoder().encode(csvData));
      const js2RTime = performance.now() - tJs2R0;

      // 2. Matching & GLM Execution
      const tMatch0 = performance.now();
      const rScript = `
        df <- read.csv('/tmp/data.csv', stringsAsFactors = FALSE)
        rownames(df) <- df$id

        m_out <- MatchIt::matchit(
          formula = as.formula("${formula}"),
          data = df,
          method = "nearest",
          distance = "glm",
          link = "${link || 'linear.logit'}",
          estimand = "ATT",
          ratio = 1,
          replace = FALSE,
          m.order = "largest",
          discard = "${discard || 'none'}",
          caliper = ${caliper === null || caliper === undefined ? 'NULL' : caliper},
          std.caliper = ${std_caliper ? 'TRUE' : 'FALSE'}
        )
      `;
      await webr.evalR(rScript);
      const matchTime = performance.now() - tMatch0;

      // 3. Cobalt Execution
      const tCobalt0 = performance.now();
      const balScript = `
        bal_raw <- cobalt::bal.tab(m_out, un = TRUE, binary = "raw", s.d.denom = "treated")
        bal_std <- cobalt::bal.tab(m_out, un = TRUE, binary = "std", s.d.denom = "treated")

        b_df <- as.data.frame(bal_raw$Balance)
        raw_covs <- rownames(b_df)
        canon_covs <- ifelse(grepl("^distance", raw_covs), "distance", raw_covs)

        list(
          n_pairs = sum(!is.na(m_out$match.matrix[,1])),
          covariates = canon_covs,
          diff_un = as.list(setNames(b_df$Diff.Un, canon_covs)),
          diff_adj = as.list(setNames(b_df$Diff.Adj, canon_covs))
        )
      `;
      const balObj = await webr.evalR(balScript);
      const cobaltTime = performance.now() - tCobalt0;

      // 4. Result Serialization
      const tSer0 = performance.now();
      const jsRes = await balObj.toJs();
      const serTime = performance.now() - tSer0;

      const totalTime = performance.now() - t0;
      const wasmMemory = webr._instance ? (webr._instance.HEAP8 ? webr._instance.HEAP8.length : null) : null;

      self.postMessage({
        id,
        type: 'PIPELINE_SUCCESS',
        timings: {
          total_ms: totalTime,
          js_to_r_ms: js2RTime,
          matching_ms: matchTime,
          cobalt_ms: cobaltTime,
          serialization_ms: serTime
        },
        wasm_memory_bytes: wasmMemory,
        n_pairs: jsRes.values ? jsRes.values[0] : null
      });
      return;
    }

    if (type === 'TRIGGER_PROHIBITED_FETCH') {
      // Intentional prohibited request for negative control test
      const res = await fetch('/api/intentional-prohibited-leak', { method: 'POST', body: 'prohibited-payload' });
      self.postMessage({ id, type: 'PROHIBITED_FETCH_RESPONSE', status: res.status });
      return;
    }
  } catch (err) {
    self.postMessage({
      id,
      type: 'ERROR',
      error: err.message,
      stack: err.stack
    });
  }
};
