// CP-WEBR-00B Browser Page Orchestration Harness
// Execution context: Window (Main Page Script)
// Manages the Dedicated Application Worker lifecycle and storage inspections

let worker = null;
let msgSeq = 0;
const pendingRequests = new Map();

function log(msg) {
  console.log(msg);
  const el = document.getElementById('logs');
  if (el) el.textContent += msg + '\n';
}

function sendToWorker(type, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error('Page: DedicatedWorker is not active'));
      return;
    }
    const id = ++msgSeq;
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}

function createDedicatedWorker() {
  const w = new Worker('/worker.js', { type: 'module' });
  w.onmessage = (e) => {
    const { id, type, error, stack } = e.data;
    if (pendingRequests.has(id)) {
      const { resolve, reject } = pendingRequests.get(id);
      pendingRequests.delete(id);
      if (type === 'ERROR') {
        const err = new Error(error);
        err.stack = stack;
        reject(err);
      } else {
        resolve(e.data);
      }
    }
  };
  w.onerror = (err) => {
    log('[Worker Error]: ' + err.message);
  };
  return w;
}

window.harness = {
  isIsolated: () => window.crossOriginIsolated,

  // Dedicated Worker lifecycle
  initWorker: async () => {
    log('Spawning Dedicated Application Worker (/worker.js)...');
    worker = createDedicatedWorker();
    log('Initializing WebR & packages inside DedicatedWorker...');
    const res = await sendToWorker('INIT');
    log('DedicatedWorker initialized with R ' + res.r_version);
    return res;
  },

  runWorkerPipeline: async (payload) => {
    return await sendToWorker('RUN_PIPELINE', payload);
  },

  startLongWorkload: async () => {
    return await sendToWorker('START_LONG_WORKLOAD');
  },

  interruptWorker: async () => {
    return await sendToWorker('INTERRUPT');
  },

  terminateWorker: async (sampleCsv) => {
    log('Testing hard cancellation with pending request rejection...');
    let pendingRejected = false;

    // Launch a pending operation on the active worker
    const pendingPromise = sendToWorker('START_LONG_WORKLOAD');
    pendingPromise.catch(() => {
      pendingRejected = true;
    });

    const tTerm0 = performance.now();
    log('Terminating Dedicated Application Worker via worker.terminate()...');
    if (worker) {
      worker.terminate();
      worker = null;
      // Reject any pending requests immediately
      for (const [id, req] of pendingRequests.entries()) {
        req.reject(new Error('Worker terminated'));
        pendingRequests.delete(id);
      }
    }
    const termLatency = performance.now() - tTerm0;
    log('Worker terminated in ' + termLatency.toFixed(2) + ' ms');

    try {
      await pendingPromise;
    } catch {
      pendingRejected = true;
    }

    // 2. New worker creation
    const tCreate0 = performance.now();
    worker = createDedicatedWorker();
    const createLatency = performance.now() - tCreate0;
    log('Fresh worker created in ' + createLatency.toFixed(2) + ' ms');

    // 3. Full WebR and package restoration
    const tRestore0 = performance.now();
    log('Restoring WebR runtime and all packages on fresh worker...');
    const initRes = await sendToWorker('INIT');
    const restoreLatency = performance.now() - tRestore0;
    log('WebR restored in ' + restoreLatency.toFixed(2) + ' ms (' + initRes.r_version + ')');

    // 4. Successful subsequent statistical operation
    let statLatency = 0;
    let statSuccess = false;
    let statPairs = 0;
    if (sampleCsv) {
      const tStat0 = performance.now();
      log('Executing full matching & cobalt pipeline on restored worker...');
      const statRes = await sendToWorker('RUN_PIPELINE', {
        csvData: sampleCsv,
        formula: 'treat ~ age + bmi + sbp',
        link: 'linear.logit',
        estimand: 'ATT',
        m_order: 'largest',
        caliper: null,
        std_caliper: false,
        discard: 'none'
      });
      statLatency = performance.now() - tStat0;
      statPairs = statRes.n_pairs;
      statSuccess = statRes.type === 'PIPELINE_SUCCESS' && statRes.n_pairs === 119;
      log('Subsequent statistical pipeline executed in ' + statLatency.toFixed(2) + ' ms, pairs: ' + statRes.n_pairs);
    }

    const fullRecovery = statSuccess || (!sampleCsv && initRes.r_version);
    return {
      worker_termination_request_ms: termLatency,
      pending_request_rejected: pendingRejected,
      wasm_linear_memory_release_latency: 'UNMEASURED (Private to terminated worker process)',
      new_worker_creation_ms: createLatency,
      full_webr_package_restoration_ms: restoreLatency,
      subsequent_statistical_operation_ms: statLatency,
      subsequent_operation_succeeded: statSuccess,
      matched_pairs: statPairs,
      full_demonstrated_recovery: Boolean(fullRecovery)
    };
  },

  // Negative egress controls
  triggerPageEgress: async (url, sentinel) => {
    log(`[Negative Control A] Triggering page-level prohibited egress with sentinel: ${sentinel}...`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sentinel-Page': sentinel
        },
        body: JSON.stringify({ sentinel_payload: sentinel })
      });
      return { status: res.status, blocked: false };
    } catch (err) {
      return { error: err.message, blocked: true };
    }
  },

  triggerWorkerEgress: async (url, sentinel) => {
    log(`[Negative Control B] Triggering worker-level prohibited egress with sentinel: ${sentinel}...`);
    return await sendToWorker('TRIGGER_PROHIBITED_EGRESS', { url, sentinel });
  },

  // Comprehensive storage and persistence inspection
  inspectStorage: async () => {
    const results = {
      localStorage: { count: localStorage.length, keys: Object.keys(localStorage) },
      sessionStorage: { count: sessionStorage.length, keys: Object.keys(sessionStorage) },
      indexedDB: { count: 0, databases: [] },
      caches: { count: 0, keys: [] },
      serviceWorker: { count: 0, registrations: [] }
    };

    // IndexedDB databases
    try {
      if (window.indexedDB && indexedDB.databases) {
        const dbs = await indexedDB.databases();
        const dbDetails = [];
        for (const dbInfo of dbs) {
          const detail = { name: dbInfo.name, version: dbInfo.version, stores: [] };
          try {
            await new Promise((res) => {
              const req = indexedDB.open(dbInfo.name);
              req.onsuccess = () => {
                const db = req.result;
                detail.stores = Array.from(db.objectStoreNames);
                db.close();
                res();
              };
              req.onerror = () => res();
            });
          } catch {}
          dbDetails.push(detail);
        }
        results.indexedDB = { count: dbs.length, databases: dbDetails };
      } else {
        results.indexedDB = 'UNMEASURED (indexedDB.databases API not supported)';
      }
    } catch (err) {
      results.indexedDB = { error: err.message };
    }

    // Cache Storage
    try {
      if (window.caches && caches.keys) {
        const keys = await caches.keys();
        results.caches = { count: keys.length, keys };
      } else {
        results.caches = 'UNMEASURED (caches.keys API not supported)';
      }
    } catch (err) {
      results.caches = { error: err.message };
    }

    // Service Worker registrations
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        const regs = await navigator.serviceWorker.getRegistrations();
        results.serviceWorker = { count: regs.length, registrations: regs.map(r => r.scope) };
      } else {
        results.serviceWorker = 'UNMEASURED (getRegistrations API not supported)';
      }
    } catch (err) {
      results.serviceWorker = { error: err.message };
    }

    return results;
  },

  // Memory metrics
  getMemoryMetrics: () => {
    return {
      execution_context: 'Window',
      js_heap_size_limit: window.performance?.memory?.jsHeapSizeLimit || null,
      total_js_heap_size: window.performance?.memory?.totalJSHeapSize || null,
      used_js_heap_size: window.performance?.memory?.usedJSHeapSize || null,
      wasm_linear_memory: null // Explicit null / UNMEASURED
    };
  }
};

log('Browser harness loaded. crossOriginIsolated = ' + window.crossOriginIsolated);
