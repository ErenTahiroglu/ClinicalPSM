// Dedicated Worker for WebR Statistical Adapter
// Loads authoritative R template from /adapter/r_template.R and initializes WebRStatisticalAdapter

import { WebR } from '/webr/webr.js';
import { WebRStatisticalAdapter } from '/adapter/webr_adapter.mjs';

let adapter = null;
let webR = null;
let templateLoaded = false;
let currentExecutionPromise = null;

// Pinned cryptographic digest of the authoritative R template (CP-WEBR-02A R1.1/R1.2)
const PINNED_TEMPLATE_SHA256 = '7989403c7d093031b93a9c971a6d4f055101bab83c0ec4417fc52e4dceee24a4';

self.onmessage = async (event) => {
  const { type, id: msgId, payload, targetJobId } = event.data || {};

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
        let templateSource = await resp.text();

        if (payload?.tampered === true) {
          templateSource += '\n# Tampered line injected for falsification control\n';
        }

        adapter = new WebRStatisticalAdapter(webR);
        const { templateSha256 } = await adapter.initTemplate(templateSource, PINNED_TEMPLATE_SHA256);
        templateLoaded = true;

        self.postMessage({
          type: 'INIT_COMPLETE',
          id: msgId,
          payload: {
            success: true,
            initialized: true,
            templateLoaded: true,
            templateSha256,
            adapterReady: true,
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

      case 'RUN_LONG_WORKLOAD': {
        // Runs an R computation long enough (~1-2 seconds) to test genuine cancellation during active execution
        if (!webR) {
          throw new Error('WebR not initialized');
        }
        if (currentExecutionPromise) {
          const err = new Error('Worker is already executing a workload (concurrency violation)');
          err.code = 'CONCURRENCY_ERROR';
          throw err;
        }

        const longPromise = (async () => {
          try {
            await webR.evalR(`
              local({
                sum_val <- 0
                for (i in 1:15000000) {
                  sum_val <- sum_val + sin(i) * cos(i)
                }
                sum_val
              })
            `);
            return { completed: true };
          } finally {
            currentExecutionPromise = null;
          }
        })();

        currentExecutionPromise = longPromise;
        const res = await longPromise;

        self.postMessage({
          type: 'WORKLOAD_COMPLETE',
          id: msgId,
          payload: res
        });
        break;
      }

      case 'RUN_FAILING_WORKLOAD': {
        // Simulates an R workload that encounters an unrelated execution error during the interrupt window
        if (!webR) {
          throw new Error('WebR not initialized');
        }
        if (currentExecutionPromise) {
          const err = new Error('Worker is already executing a workload');
          err.code = 'CONCURRENCY_ERROR';
          throw err;
        }

        const failPromise = (async () => {
          try {
            // Delay 80ms so cancelCurrentJob() is actively in INTERRUPT_REQUESTED state
            await new Promise((_, reject) => {
              setTimeout(() => {
                const err = new Error('Error in evalR: Deliberate R runtime exception during interrupt request');
                err.code = 'WORKER_ERROR';
                reject(err);
              }, 80);
            });
            return { completed: false };
          } finally {
            currentExecutionPromise = null;
          }
        })();

        currentExecutionPromise = failPromise;
        await failPromise;
        break;
      }

      case 'RUN_UNINTERRUPTIBLE_WORKLOAD': {
        // Deliberately busy-waits ignoring webR.interrupt() to test timeout hard termination
        if (currentExecutionPromise) {
          const err = new Error('Worker is already executing a workload');
          err.code = 'CONCURRENCY_ERROR';
          throw err;
        }

        const unrefPromise = (async () => {
          try {
            const start = performance.now();
            while (performance.now() - start < 3000) {
              // Busy loop in JS unaffected by webR.interrupt()
            }
            return { completed: true };
          } finally {
            currentExecutionPromise = null;
          }
        })();

        currentExecutionPromise = unrefPromise;
        const res = await unrefPromise;
        self.postMessage({
          type: 'WORKLOAD_COMPLETE',
          id: msgId,
          payload: res
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
          targetJobId: targetJobId || payload?.targetJobId,
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
          const evalFn = new Function('return 42 * 2;');
          const val = evalFn();
          evalWorked = (val === 84);
        } catch (err) {
          evalWorked = false;
          evalError = err.message;
        }

        self.postMessage({
          type: 'TEST_WORKER_EVAL_RESULT',
          id: msgId,
          payload: {
            eval_allowed: evalWorked,
            evalAllowed: evalWorked,
            eval_error: evalError,
            evalError
          }
        });
        break;
      }

      default:
        throw new Error(`Unknown message type: "${type}"`);
    }
  } catch (err) {
    const isInterrupt =
      err.code === 'OPERATION_CANCELLED' ||
      err.name === 'UnwindProtectException' ||
      /interrupted|operation cancelled|non-local transfer of control/i.test(err.message);
    self.postMessage({
      type: 'ERROR',
      id: msgId,
      code: isInterrupt ? 'OPERATION_CANCELLED' : (err.code || 'WORKER_ERROR'),
      error: err.message || String(err)
    });
  }
};
