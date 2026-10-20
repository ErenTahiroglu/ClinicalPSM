// CP-WEBR-02A Dedicated Application Worker
// Runs WebR 0.6.0 + MatchIt 4.8.1 + cobalt 5.0.0 inside DedicatedWorkerGlobalScope
// Completely eliminates duplicate scientific algorithms: uses WebRStatisticalAdapter and /adapter/r_template.R

import { WebR } from '/webr/webr.js';
import { WebRStatisticalAdapter } from '/adapter/webr_adapter.mjs';

let webR = null;
let adapter = null;
let templateLoaded = false;
let currentExecutionPromise = null;

self.onmessage = async (event) => {
  const { type, id: msgId, payload } = event.data || {};

  try {
    switch (type) {
      case 'INIT': {
        if (!webR) {
          webR = new WebR({ baseUrl: '/webr/' });
          await webR.init();
          const REQUIRED_PACKAGES = [
            'Rcpp', 'R6', 'cli', 'rlang', 'vctrs', 'glue', 'withr', 'lifecycle',
            'gtable', 'scales', 'farver', 'labeling', 'isoband', 'ggplot2',
            'gridExtra', 'viridisLite', 'S7', 'arg', 'RColorBrewer', 'MatchIt', 'cobalt'
          ];
          await webR.installPackages(REQUIRED_PACKAGES, { repos: ['/repo'] });
          await webR.evalR('library(MatchIt); library(cobalt);');
        }

        // Fetch authoritative template bytes from same-origin static server
        const resp = await fetch('/adapter/r_template.R');
        if (!resp.ok) {
          throw new Error(`Failed to fetch /adapter/r_template.R: ${resp.status}`);
        }
        const templateSource = await resp.text();

        adapter = new WebRStatisticalAdapter(webR);
        const { templateSha256 } = await adapter.initTemplate(templateSource);
        templateLoaded = true;

        self.postMessage({
          type: 'INIT_COMPLETE',
          id: msgId,
          payload: {
            initialized: true,
            templateLoaded: true,
            templateSha256,
            webrVersion: '0.6.0',
            packages: ['MatchIt@4.8.1', 'cobalt@5.0.0']
          }
        });
        break;
      }

      case 'RUN_ANALYSIS': {
        if (!adapter || !templateLoaded) {
          throw new Error('Worker not initialized. Send INIT message first.');
        }

        if (currentExecutionPromise) {
          const err = new Error('Worker is already executing an analysis (concurrency violation)');
          err.code = 'CONCURRENCY_ERROR';
          throw err;
        }

        const executionPromise = (async () => {
          try {
            const envelope = await adapter.runAnalysis(payload);
            return envelope;
          } finally {
            currentExecutionPromise = null;
          }
        })();

        currentExecutionPromise = executionPromise;
        const envelope = await executionPromise;

        self.postMessage({
          type: 'ANALYSIS_COMPLETE',
          id: msgId,
          payload: {
            success: true,
            ...envelope
          }
        });
        break;
      }

      case 'INTERRUPT': {
        if (webR) {
          try {
            await webR.interrupt();
          } catch (e) {
            console.warn('webR.interrupt() error in worker:', e);
          }
        }
        self.postMessage({
          type: 'INTERRUPT_COMPLETE',
          id: msgId,
          payload: { interrupted: true }
        });
        break;
      }

      case 'TEST_WORKER_EVAL':
      case 'EVAL_TEST': {
        // Controlled probe to verify CSP enforcement on eval()
        let evalWorked = false;
        let evalError = null;
        try {
          const f = new Function('return 1 + 1');
          evalWorked = f() === 2;
        } catch (e) {
          evalError = e.message;
        }
        self.postMessage({
          type: type === 'TEST_WORKER_EVAL' ? 'TEST_WORKER_EVAL_RESULT' : 'EVAL_TEST_COMPLETE',
          id: msgId,
          payload: {
            eval_allowed: evalWorked,
            evalWorked,
            eval_error: evalError,
            evalError
          }
        });
        break;
      }

      default:
        throw new Error(`Unrecognized worker command type: "${type}"`);
    }
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      id: msgId,
      error: err.message || String(err),
      code: err.code || 'WORKER_INTERNAL_ERROR'
    });
  }
};
