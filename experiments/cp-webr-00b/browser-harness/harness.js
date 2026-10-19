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

  terminateWorker: async () => {
    const t0 = performance.now();
    log('Terminating Dedicated Application Worker via worker.terminate()...');
    if (worker) {
      worker.terminate();
      worker = null;
      // Reject any pending requests
      for (const [id, req] of pendingRequests.entries()) {
        req.reject(new Error('Worker terminated'));
        pendingRequests.delete(id);
      }
    }
    const termLatency = performance.now() - t0;
    log('Worker terminated in ' + termLatency.toFixed(2) + ' ms');

    // Confirm demonstrated recovery: create fresh worker and run simple ping
    const tRec0 = performance.now();
    worker = createDedicatedWorker();
    const pingRes = await sendToWorker('PING');
    const recLatency = performance.now() - tRec0;
    log('Spawned fresh recovery worker; ping response in ' + recLatency.toFixed(2) + ' ms');

    return {
      termination_latency_ms: termLatency,
      recovery_latency_ms: recLatency,
      total_cancellation_latency_ms: performance.now() - t0,
      recovered: pingRes.type === 'PONG'
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
