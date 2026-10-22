// ClinicalPSM Dedicated WebR Worker
// Bridges UI thread (Layer 1) to WebR runtime (Layer 3)
// Pinned to WebR 0.6.0, R 4.6.0, MatchIt 4.8.1, cobalt 5.0.0

import { WebRStatisticalAdapter } from '../lib/webr/webr_adapter.mjs';

interface WebRInstance {
  init(): Promise<void>;
  installPackages(packages: string[], options?: { repos?: string[] }): Promise<void>;
  evalR(code: string): Promise<unknown>;
  interrupt(): void;
}

interface WebRConstructor {
  new (options?: { baseUrl?: string; repoUrl?: string; channelType?: number }): WebRInstance;
}

interface WebRModule {
  WebR: WebRConstructor;
  ChannelType: { SharedArrayBuffer: number; PostMessage: number };
}

let adapter: WebRStatisticalAdapter | null = null;
let WebRClass: WebRConstructor | null = null;
let webR: WebRInstance | null = null;
let templateLoaded = false;
let currentExecutionPromise: Promise<unknown> | null = null;
let activeJobId: string | null = null;
let activeInterruptJobId: string | null = null;
let isInitializing = false;
let selectedChannelType: 'SharedArrayBuffer' | 'PostMessage' | null = null;

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
        if (isInitializing) {
          throw Object.assign(new Error('Worker initialization is already in progress'), {
            code: 'CONCURRENCY_ERROR'
          });
        }

        if (webR && templateLoaded && adapter) {
          const isIsolated = typeof self.crossOriginIsolated === 'boolean' && self.crossOriginIsolated;
          self.postMessage({
            type: 'INIT_COMPLETE',
            id: msgId,
            payload: {
              success: true,
              initialized: true,
              templateLoaded: true,
              templateSha256: PINNED_TEMPLATE_SHA256,
              adapterReady: true,
              webrVersion: '0.6.0',
              rVersion: '4.6.0',
              packages: ['MatchIt@4.8.1', 'cobalt@5.0.0'],
              crossOriginIsolated: isIsolated,
              channelType: selectedChannelType,
              sharedArrayBufferAvailable: typeof SharedArrayBuffer !== 'undefined'
            }
          });
          break;
        }

        isInitializing = true;
        try {
          const baseUrl = payload?.baseUrl || '/assets/webr/';
          const repoUrl = payload?.repoUrl || '/assets/repo';

          if (!WebRClass) {
            const isNode = typeof process !== 'undefined' && !!process.versions?.node;
            const webrModuleUrl = `${baseUrl.replace(/\/$/, '')}/${isNode ? 'webr.mjs' : 'webr.js'}`;
            const mod = (await import(/* @vite-ignore */ webrModuleUrl)) as WebRModule;
            WebRClass = mod.WebR;
            const sharedArrayBufferReady =
              typeof self.crossOriginIsolated === 'boolean' && self.crossOriginIsolated &&
              typeof SharedArrayBuffer !== 'undefined';
            const channelType = sharedArrayBufferReady
              ? mod.ChannelType.SharedArrayBuffer
              : mod.ChannelType.PostMessage;
            selectedChannelType = sharedArrayBufferReady ? 'SharedArrayBuffer' : 'PostMessage';

            webR = new WebRClass({ baseUrl, repoUrl, channelType });
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
          const templateSource = await resp.text();

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
              channelType: selectedChannelType,
              sharedArrayBufferAvailable: typeof SharedArrayBuffer !== 'undefined'
            }
          });
        } finally {
          isInitializing = false;
        }
        break;
      }

      case 'RUN_ANALYSIS': {
        if (isInitializing) {
          throw Object.assign(new Error('Worker is currently initializing. Cannot run analysis.'), {
            code: 'WORKER_INITIALIZING'
          });
        }

        if (!adapter || !templateLoaded || !webR) {
          throw Object.assign(new Error('Worker not initialized. Send INIT message first.'), {
            code: 'WORKER_NOT_INITIALIZED'
          });
        }

        if (currentExecutionPromise || activeJobId !== null) {
          throw Object.assign(new Error(`Worker is already executing a job (active: ${activeJobId}). Concurrent tasks prohibited.`), {
            code: 'CONCURRENCY_ERROR'
          });
        }

        const currentJobId = msgId;
        activeInterruptJobId = null;
        activeJobId = currentJobId;

        const executionPromise = adapter!.runAnalysis(payload);
        currentExecutionPromise = executionPromise;
        try {
          const envelope = await executionPromise;

          // A late result is never published after this exact job was cancelled.
          if (activeInterruptJobId === currentJobId) {
            self.postMessage({
              type: 'ERROR',
              id: msgId,
              targetJobId: currentJobId,
              code: 'LATE_RESULT_REJECTED',
              error: 'Analysis returned after cancellation was requested'
            });
            break;
          }

          self.postMessage({
            type: 'ANALYSIS_COMPLETE',
            id: msgId,
            payload: {
              success: true,
              ...envelope
            }
          });
        } catch (err: unknown) {
          const nativeError = err as { name?: string; code?: string };
          const isNativeWebRInterruption =
            nativeError?.name === 'UnwindProtectException' || nativeError?.code === 'OPERATION_CANCELLED';
          const isVerifiedCancellation =
            isNativeWebRInterruption &&
            activeInterruptJobId === currentJobId &&
            activeJobId === currentJobId;

          if (isVerifiedCancellation) {
            self.postMessage({
              type: 'ERROR',
              id: msgId,
              targetJobId: currentJobId,
              code: 'OPERATION_CANCELLED',
              nativeErrorName: nativeError?.name || null,
              nativeErrorCode: nativeError?.code || null,
              error: 'WebR evaluation unwound after a cancellation request for this job'
            });
          } else {
            throw err;
          }
        } finally {
          if (currentExecutionPromise === executionPromise) currentExecutionPromise = null;
          if (activeJobId === currentJobId) activeJobId = null;
          if (activeInterruptJobId === currentJobId) activeInterruptJobId = null;
        }
        break;
      }

      case 'INTERRUPT': {
        const targetId = targetJobId || payload?.targetJobId || (typeof msgId === 'string' ? msgId.replace(/^interrupt_/, '') : null);

        if (isInitializing) {
          self.postMessage({
            type: 'INTERRUPT_FAILED',
            id: msgId,
            targetJobId: targetId,
            code: 'INITIALIZATION_INTERRUPT_UNSUPPORTED',
            error: 'Cannot gracefully interrupt WebR during initialization; worker must be terminated'
          });
          return;
        }

        if (!webR) {
          self.postMessage({
            type: 'INTERRUPT_FAILED',
            id: msgId,
            targetJobId: targetId,
            code: 'NOT_INITIALIZED',
            error: 'WebR runtime not initialized'
          });
          return;
        }

        const isIsolated = typeof self.crossOriginIsolated === 'boolean' && self.crossOriginIsolated;
        if (selectedChannelType !== 'SharedArrayBuffer' || !isIsolated || typeof SharedArrayBuffer === 'undefined') {
          self.postMessage({
            type: 'INTERRUPT_FAILED',
            id: msgId,
            targetJobId: targetId,
            code: 'INTERRUPT_UNSUPPORTED_IN_POSTMESSAGE_MODE',
            error: 'Graceful interrupt impossible without crossOriginIsolated (PostMessage channel cannot interrupt active R evaluation)'
          });
          return;
        }

        if (!targetId || !activeJobId || activeJobId !== targetId) {
          self.postMessage({
            type: 'INTERRUPT_FAILED',
            id: msgId,
            targetJobId: targetId,
            code: 'NO_ACTIVE_MATCHING_JOB',
            error: `No active job matching id "${targetId}" (current active job: "${activeJobId}")`
          });
          return;
        }

        activeInterruptJobId = targetId;

        // The documented WebR interrupt call requests interruption; ACK is not proof of cessation.
        try {
          webR.interrupt();
        } catch (interruptErr) {
          activeInterruptJobId = null;
          self.postMessage({
            type: 'INTERRUPT_FAILED',
            id: msgId,
            targetJobId: targetId,
            code: 'INTERRUPT_REQUEST_FAILED',
            error: interruptErr instanceof Error ? interruptErr.message : String(interruptErr)
          });
          return;
        }

        self.postMessage({
          type: 'INTERRUPT_ACK',
          id: msgId,
          targetJobId: activeInterruptJobId,
          payload: {
            status: 'INTERRUPT_REQUESTED',
            jobId: activeInterruptJobId,
            channelType: selectedChannelType
          }
        });
        break;
      }

      default:
        throw new Error(`Unrecognized message type: ${type}`);
    }
  } catch (err: unknown) {
    const errorObj = err as { message?: string; code?: string };
    const errorMsg = errorObj?.message || String(err);
    const errorCode = errorObj?.code || 'WORKER_ERROR';
    self.postMessage({
      type: 'ERROR',
      id: msgId,
      targetJobId: targetJobId || (msgId === activeJobId ? activeJobId : undefined),
      code: errorCode === 'OPERATION_CANCELLED' ? 'WORKER_ERROR' : errorCode,
      error: errorMsg
    });
  }
};
