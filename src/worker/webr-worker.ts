// ClinicalPSM Dedicated WebR Worker
// Bridges UI thread (Layer 1) to WebR runtime (Layer 3)
// Pinned to WebR 0.6.0, R 4.6.0, MatchIt 4.8.1, cobalt 5.0.0

import { WebRStatisticalAdapter } from '../lib/webr/webr_adapter.mjs';

interface WebRInstance {
  init(): Promise<void>;
  installPackages(packages: string[], options?: { repos?: string[] }): Promise<void>;
  evalR(code: string): Promise<unknown>;
  interrupt(): Promise<void>;
}

interface WebRConstructor {
  new (options?: { baseUrl?: string }): WebRInstance;
}

let adapter: WebRStatisticalAdapter | null = null;
let WebRClass: WebRConstructor | null = null;
let webR: WebRInstance | null = null;
let templateLoaded = false;
let currentExecutionPromise: Promise<unknown> | null = null;

// Pinned cryptographic digest of the authoritative R template (CP-WEBR-02A R1.1/R1.2)
const PINNED_TEMPLATE_SHA256 = '7989403c7d093031b93a9c971a6d4f055101bab83c0ec4417fc52e4dceee24a4';

const REQUIRED_PACKAGES = [
  'Rcpp', 'R6', 'cli', 'rlang', 'vctrs', 'glue', 'withr', 'lifecycle',
  'gtable', 'scales', 'farver', 'labeling', 'isoband', 'ggplot2',
  'gridExtra', 'viridisLite', 'S7', 'arg', 'RColorBrewer', 'MatchIt', 'cobalt'
];

self.onmessage = async (event: MessageEvent) => {
  const { type, id: msgId, payload, targetJobId } = event.data || {};

  try {
    switch (type) {
      case 'INIT': {
        if (!webR) {
          const baseUrl = payload?.baseUrl || '/assets/webr/';
          const repoUrl = payload?.repoUrl || '/assets/repo';

          if (!WebRClass) {
            const webrModuleUrl = `${baseUrl.replace(/\/$/, '')}/webr.mjs`;
            const mod = (await import(/* @vite-ignore */ webrModuleUrl)) as { WebR: WebRConstructor };
            WebRClass = mod.WebR;
          }

          webR = new WebRClass({ baseUrl });
          await webR.init();

          await webR.installPackages(REQUIRED_PACKAGES, { repos: [repoUrl] });
          await webR.evalR('library(MatchIt); library(cobalt);');
        }

        // Fetch authoritative template bytes from same-origin static server
        const templateUrl = payload?.templateUrl || '/assets/webr/r_template.R';
        const resp = await fetch(templateUrl);
        if (!resp.ok) {
          throw new Error(`Failed to fetch ${templateUrl}: ${resp.status}`);
        }
        let templateSource = await resp.text();

        if (payload?.tampered === true) {
          templateSource += '\n# Tampered line injected for falsification control\n';
        }

        adapter = new WebRStatisticalAdapter(webR);
        const { templateSha256 } = await adapter.initTemplate(templateSource, PINNED_TEMPLATE_SHA256);
        templateLoaded = true;

        const isIsolated = typeof self.crossOriginIsolated === 'boolean' && self.crossOriginIsolated;

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
            rVersion: '4.6.0',
            packages: ['MatchIt@4.8.1', 'cobalt@5.0.0'],
            crossOriginIsolated: isIsolated,
            channelType: isIsolated ? 'SharedArrayBuffer' : 'PostMessage'
          }
        });
        break;
      }

      case 'RUN_ANALYSIS': {
        if (!adapter || !templateLoaded) {
          const err = Object.assign(new Error('Worker not initialized. Send INIT message first.'), {
            code: 'WORKER_NOT_INITIALIZED'
          });
          throw err;
        }

        if (currentExecutionPromise) {
          const err = Object.assign(new Error('Worker is already executing an analysis (concurrency violation)'), {
            code: 'CONCURRENCY_ERROR'
          });
          throw err;
        }

        const executionPromise = (async () => {
          try {
            const envelope = await adapter!.runAnalysis(payload);
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
        const isIsolated = typeof self.crossOriginIsolated === 'boolean' && self.crossOriginIsolated;
        if (!webR) {
          self.postMessage({
            type: 'INTERRUPT_FAILED',
            id: msgId,
            targetJobId,
            error: 'WebR runtime not initialized'
          });
          return;
        }

        if (!isIsolated) {
          self.postMessage({
            type: 'INTERRUPT_FAILED',
            id: msgId,
            targetJobId,
            code: 'INTERRUPT_UNSUPPORTED_IN_POSTMESSAGE_MODE',
            error: 'Graceful interrupt impossible without crossOriginIsolated (PostMessage channel cannot interrupt active R evaluation)'
          });
          return;
        }

        // Under SharedArrayBuffer, webR.interrupt() writes control byte to atomic channel
        await webR.interrupt();

        self.postMessage({
          type: 'INTERRUPT_ACK',
          id: msgId,
          targetJobId,
          payload: {
            status: 'INTERRUPT_REQUESTED',
            jobId: targetJobId,
            channelType: 'SharedArrayBuffer'
          }
        });
        break;
      }

      default:
        throw new Error(`Unrecognized message type: ${type}`);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorCode = (err as { code?: string })?.code || 'WORKER_ERROR';
    self.postMessage({
      type: 'ERROR',
      id: msgId,
      targetJobId,
      code: errorCode,
      error: errorMsg
    });
  }
};
