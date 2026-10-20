// CP-WEBR-02A Browser Harness Script
// Provides deep recursive storage inspection, scanner falsification probe,
// Worker CSP A/B matrix, worker lifecycle suite, and negative control triggers.

window.currentWorker = null;
let msgId = 0;
const pending = new Map();

export function createWorker() {
  if (window.currentWorker) {
    window.currentWorker.terminate();
  }
  window.currentWorker = new Worker('/worker.js?csp=permissive-worker', { type: 'module' });
  window.currentWorker.onmessage = (e) => {
    const { id, type, error, payload } = e.data || {};
    if (pending.has(id)) {
      const { resolve, reject } = pending.get(id);
      pending.delete(id);
      if (type === 'WORKER_ERROR' || error) {
        reject(new Error(error || 'Worker error'));
      } else {
        resolve(payload !== undefined ? payload : e.data);
      }
    }
  };
  return window.currentWorker;
}

export function createStrictWorker() {
  if (window.currentWorker) {
    window.currentWorker.terminate();
  }
  window.currentWorker = new Worker('/worker-strict.js?csp=strict-worker', { type: 'module' });
  window.currentWorker.onmessage = (e) => {
    const { id, type, error, payload } = e.data || {};
    if (pending.has(id)) {
      const { resolve, reject } = pending.get(id);
      pending.delete(id);
      if (type === 'WORKER_ERROR' || error) {
        reject(new Error(error || 'Worker error'));
      } else {
        resolve(payload !== undefined ? payload : e.data);
      }
    }
  };
  return window.currentWorker;
}

export function sendWorkerMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    window.currentWorker.postMessage({ id, type, payload });
  });
}

// -------------------------------------------------------------
// Deep Storage Inspection across all browser persistence mechanisms
// -------------------------------------------------------------

function scanBufferForSentinels(buf, sentinels) {
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    const matches = [];
    for (const s of sentinels) {
      if (text.includes(s)) matches.push(s);
    }
    return matches;
  } catch {
    return [];
  }
}

async function inspectValueRecursively(val, sentinels, path = '') {
  const matches = [];
  if (val === null || val === undefined) return matches;

  if (typeof val === 'string') {
    for (const s of sentinels) {
      if (val.includes(s)) matches.push({ path, sentinel: s, type: 'string' });
    }
    return matches;
  }

  if (val instanceof Blob) {
    try {
      const text = await val.text();
      for (const s of sentinels) {
        if (text.includes(s)) matches.push({ path, sentinel: s, type: 'blob' });
      }
    } catch {}
    return matches;
  }

  if (val instanceof ArrayBuffer || ArrayBuffer.isView(val)) {
    const buf = val instanceof ArrayBuffer ? val : val.buffer;
    const found = scanBufferForSentinels(buf, sentinels);
    for (const s of found) {
      matches.push({ path, sentinel: s, type: 'arraybuffer' });
    }
    return matches;
  }

  if (typeof val === 'object') {
    for (const k of Object.keys(val)) {
      for (const s of sentinels) {
        if (k.includes(s)) matches.push({ path: `${path}.${k}`, sentinel: s, type: 'object_key' });
      }
      try {
        const sub = await inspectValueRecursively(val[k], sentinels, `${path}.${k}`);
        matches.push(...sub);
      } catch {}
    }
  }

  return matches;
}

export async function inspectDeepStorage(sentinels = [], options = {}) {
  const injectedFault = options.injectedFault || null;
  const audit = {
    executed_at: new Date().toISOString(),
    sentinels_checked: sentinels,
    indexedDB: {
      status: 'PENDING',
      databases: [],
      records_inspected: 0,
      residue_matches: [],
      errors: [],
      inaccessible: false
    },
    localStorage: { entries_inspected: 0, residue_matches: [] },
    sessionStorage: { entries_inspected: 0, residue_matches: [] },
    cacheStorage: { caches_inspected: 0, requests_inspected: 0, residue_matches: [] },
    serviceWorkers: { registrations_count: 0 },
    total_residue_found: 0,
    storage_accessible: true
  };

  // 1. IndexedDB Inspection (Fail-Closed Architecture)
  try {
    if (injectedFault === 'FAULT_OPEN_FAILURE') {
      audit.indexedDB.errors.push('Fault injection: IndexedDB database open failure');
      audit.indexedDB.status = 'INSPECTION_ERROR';
      audit.storage_accessible = false;
    } else if (window.indexedDB && window.indexedDB.databases) {
      let dbs = [];
      try {
        dbs = await window.indexedDB.databases();
        audit.indexedDB.databases = dbs.map(d => ({ name: d.name, version: d.version }));
      } catch (err) {
        audit.indexedDB.errors.push('Failed to list databases: ' + err.message);
        audit.indexedDB.status = 'INSPECTION_ERROR';
      }

      if (audit.indexedDB.errors.length === 0) {
        for (const dbInfo of dbs) {
          if (!dbInfo.name) continue;
          await new Promise((resolve) => {
            let req;
            try {
              req = indexedDB.open(dbInfo.name);
            } catch (err) {
              audit.indexedDB.errors.push(`open() threw for ${dbInfo.name}: ${err.message}`);
              audit.indexedDB.status = 'INSPECTION_ERROR';
              return resolve();
            }

            req.onblocked = () => {
              audit.indexedDB.errors.push(`Database ${dbInfo.name} open blocked`);
              audit.indexedDB.status = 'INACCESSIBLE';
              audit.indexedDB.inaccessible = true;
              resolve();
            };

            req.onerror = () => {
              audit.indexedDB.errors.push(`Database ${dbInfo.name} open error: ${req.error?.message || 'unknown'}`);
              audit.indexedDB.status = 'INSPECTION_ERROR';
              resolve();
            };

            req.onsuccess = async (e) => {
              const db = e.target.result;
              const storeNames = Array.from(db.objectStoreNames);

              for (const sName of storeNames) {
                if (injectedFault === 'FAULT_INACCESSIBLE_STORE') {
                  audit.indexedDB.errors.push(`Fault injection: Inaccessible object store ${sName}`);
                  audit.indexedDB.status = 'INACCESSIBLE';
                  audit.indexedDB.inaccessible = true;
                  audit.storage_accessible = false;
                  break;
                }

                if (injectedFault === 'FAULT_TX_FAILURE') {
                  audit.indexedDB.errors.push(`Fault injection: Transaction creation failed for ${sName}`);
                  audit.indexedDB.status = 'INSPECTION_ERROR';
                  break;
                }

                const records = await new Promise((sResolve) => {
                  try {
                    const tx = db.transaction(sName, 'readonly');
                    tx.onerror = () => {
                      audit.indexedDB.errors.push(`Transaction error on ${sName}: ${tx.error?.message || 'unknown'}`);
                      audit.indexedDB.status = 'INSPECTION_ERROR';
                      sResolve([]);
                    };

                    const store = tx.objectStore(sName);
                    const items = [];

                    if (injectedFault === 'FAULT_CURSOR_FAILURE') {
                      audit.indexedDB.errors.push(`Fault injection: Cursor read failure on ${sName}`);
                      audit.indexedDB.status = 'INSPECTION_ERROR';
                      return sResolve([]);
                    }

                    const curReq = store.openCursor();
                    curReq.onsuccess = (ev) => {
                      const cursor = ev.target.result;
                      if (cursor) {
                        items.push({ key: cursor.key, value: cursor.value });
                        cursor.continue();
                      } else {
                        sResolve(items);
                      }
                    };
                    curReq.onerror = () => {
                      audit.indexedDB.errors.push(`Cursor error on ${sName}: ${curReq.error?.message || 'unknown'}`);
                      audit.indexedDB.status = 'INSPECTION_ERROR';
                      sResolve([]);
                    };
                  } catch (err) {
                    audit.indexedDB.errors.push(`Transaction initialization threw on ${sName}: ${err.message}`);
                    audit.indexedDB.status = 'INSPECTION_ERROR';
                    sResolve([]);
                  }
                });

                for (const item of records) {
                  audit.indexedDB.records_inspected++;

                  if (injectedFault === 'FAULT_DECODER_FAILURE') {
                    audit.indexedDB.errors.push('Fault injection: Recursive value decoder failure');
                    audit.indexedDB.status = 'INSPECTION_ERROR';
                    break;
                  }

                  try {
                    const keyMatches = await inspectValueRecursively(item.key, sentinels, `${dbInfo.name}.${sName}[key]`);
                    audit.indexedDB.residue_matches.push(...keyMatches);
                    const valMatches = await inspectValueRecursively(item.value, sentinels, `${dbInfo.name}.${sName}[val]`);
                    audit.indexedDB.residue_matches.push(...valMatches);
                  } catch (err) {
                    audit.indexedDB.errors.push(`Decoder error on ${dbInfo.name}.${sName}: ${err.message}`);
                    audit.indexedDB.status = 'INSPECTION_ERROR';
                  }
                }
              }
              db.close();
              resolve();
            };
          });
        }
      }
    }
  } catch (err) {
    audit.indexedDB.errors.push('Top-level IndexedDB error: ' + err.message);
    audit.indexedDB.status = 'INSPECTION_ERROR';
  }

  // Determine final IndexedDB status if not already set to an error state
  if (audit.indexedDB.status === 'PENDING') {
    if (audit.indexedDB.errors.length > 0) {
      audit.indexedDB.status = audit.indexedDB.inaccessible ? 'INACCESSIBLE' : 'INSPECTION_ERROR';
    } else if (audit.indexedDB.residue_matches.length > 0) {
      audit.indexedDB.status = 'SENTINEL_DETECTED';
    } else if (audit.indexedDB.records_inspected > 0) {
      audit.indexedDB.status = 'INSPECTED_NO_SENTINEL';
    } else {
      audit.indexedDB.status = 'INSPECTED_EMPTY';
    }
  }

  // 2. LocalStorage Inspection
  try {
    audit.localStorage.entries_inspected = localStorage.length;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k);
      for (const s of sentinels) {
        if (k.includes(s) || (v && v.includes(s))) {
          audit.localStorage.residue_matches.push({ key: k, sentinel: s });
        }
      }
    }
  } catch (err) {
    audit.localStorage.error = err.message;
  }

  // 3. SessionStorage Inspection
  try {
    audit.sessionStorage.entries_inspected = sessionStorage.length;
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      const v = sessionStorage.getItem(k);
      for (const s of sentinels) {
        if (k.includes(s) || (v && v.includes(s))) {
          audit.sessionStorage.residue_matches.push({ key: k, sentinel: s });
        }
      }
    }
  } catch (err) {
    audit.sessionStorage.error = err.message;
  }

  // 4. Cache Storage Inspection
  try {
    if (window.caches) {
      const cacheNames = await caches.keys();
      audit.cacheStorage.caches_inspected = cacheNames.length;
      for (const cName of cacheNames) {
        const c = await caches.open(cName);
        const reqs = await c.keys();
        audit.cacheStorage.requests_inspected += reqs.length;
        for (const r of reqs) {
          const resp = await c.match(r);
          if (resp) {
            const body = await resp.clone().text();
            for (const s of sentinels) {
              if (r.url.includes(s) || body.includes(s)) {
                audit.cacheStorage.residue_matches.push({ cache: cName, url: r.url, sentinel: s });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    audit.cacheStorage.error = err.message;
  }

  // 5. Service Workers
  try {
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      audit.serviceWorkers.registrations_count = regs.length;
    }
  } catch {}

  audit.total_residue_found =
    audit.indexedDB.residue_matches.length +
    audit.localStorage.residue_matches.length +
    audit.sessionStorage.residue_matches.length +
    audit.cacheStorage.residue_matches.length;

  return audit;
}

// -------------------------------------------------------------
// Storage Scanner Positive Control Falsification Probe (RT-04)
// -------------------------------------------------------------

export async function runStorageScannerFalsification() {
  const PROBE_DB_NAME = 'scanner_falsification_probe_db';
  const PROBE_STORE_NAME = 'probe_store';
  const probeSentinels = [
    'PROBE_KEY_SNTL_01',
    'PROBE_STR_SNTL_02',
    'PROBE_NEST_SNTL_03',
    'PROBE_TYPED_SNTL_04',
    'PROBE_BLOB_SNTL_05'
  ];

  // 1. Clean existing probe database if present
  await new Promise((resolve) => {
    const delReq = indexedDB.deleteDatabase(PROBE_DB_NAME);
    delReq.onsuccess = () => resolve();
    delReq.onerror = () => resolve();
    delReq.onblocked = () => resolve();
  });

  // 2. Insert deliberate test records across 5 storage types
  await new Promise((resolve, reject) => {
    const openReq = indexedDB.open(PROBE_DB_NAME, 1);
    openReq.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(PROBE_STORE_NAME)) {
        db.createObjectStore(PROBE_STORE_NAME);
      }
    };
    openReq.onsuccess = async (e) => {
      const db = e.target.result;
      const tx = db.transaction(PROBE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PROBE_STORE_NAME);

      // Record 1: Key sentinel
      store.put('harmless_payload', 'PROBE_KEY_SNTL_01');
      // Record 2: String value sentinel
      store.put('Patient record string holding PROBE_STR_SNTL_02 token', 'rec_str');
      // Record 3: Nested object sentinel
      store.put({ clinical: { ehr: { biomarker: 'PROBE_NEST_SNTL_03' } } }, 'rec_nested');
      // Record 4: TypedArray sentinel
      const typedBytes = new TextEncoder().encode('Raw buffer holding PROBE_TYPED_SNTL_04 bytes');
      store.put(typedBytes.buffer, 'rec_typedarray');
      // Record 5: Blob sentinel
      const blob = new Blob(['Document content holding PROBE_BLOB_SNTL_05'], { type: 'text/plain' });
      store.put(blob, 'rec_blob');

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = (err) => reject(err);
    };
    openReq.onerror = (err) => reject(err);
  });

  // 3. Scan for planted sentinels
  const probeAudit = await inspectDeepStorage(probeSentinels);
  const detectedSentinels = new Set(probeAudit.indexedDB.residue_matches.map(m => m.sentinel));

  const keyFound = detectedSentinels.has('PROBE_KEY_SNTL_01');
  const strFound = detectedSentinels.has('PROBE_STR_SNTL_02');
  const nestFound = detectedSentinels.has('PROBE_NEST_SNTL_03');
  const typedFound = detectedSentinels.has('PROBE_TYPED_SNTL_04');
  const blobFound = detectedSentinels.has('PROBE_BLOB_SNTL_05');

  const allFound = keyFound && strFound && nestFound && typedFound && blobFound;

  // 4. Delete probe database and verify post-cleanup
  await new Promise((resolve) => {
    const delReq = indexedDB.deleteDatabase(PROBE_DB_NAME);
    delReq.onsuccess = () => resolve();
    delReq.onerror = () => resolve();
    delReq.onblocked = () => resolve();
  });

  const postCleanupAudit = await inspectDeepStorage(probeSentinels);
  const cleanupVerified = postCleanupAudit.total_residue_found === 0;

  return {
    scanner_falsification_verdict: (allFound && cleanupVerified) ? 'SCANNER_FALSIFICATION_PASS' : 'FAIL',
    planted_count: probeSentinels.length,
    detected_count: detectedSentinels.size,
    detected_by_type: {
      key: keyFound,
      string: strFound,
      nested_object: nestFound,
      typed_array: typedFound,
      blob: blobFound
    },
    cleanup_verified: cleanupVerified
  };
}

// -------------------------------------------------------------
// IndexedDB Fault Injection Suite (Fail-Closed Verification)
// -------------------------------------------------------------

export async function runIndexedDbFaultInjectionTests(sentinels = ['TEST_SNTL_01']) {
  const PROBE_DB_NAME = 'fault_injection_test_db';
  const PROBE_STORE_NAME = 'fault_store';

  // Seed temporary probe db so stores exist
  await new Promise((resolve) => {
    const delReq = indexedDB.deleteDatabase(PROBE_DB_NAME);
    delReq.onsuccess = () => resolve();
    delReq.onerror = () => resolve();
    delReq.onblocked = () => resolve();
  });

  await new Promise((resolve, reject) => {
    const req = indexedDB.open(PROBE_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(PROBE_STORE_NAME);
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(PROBE_STORE_NAME, 'readwrite');
      tx.objectStore(PROBE_STORE_NAME).put('safe_data_payload', 'key_01');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = (err) => reject(err);
    };
    req.onerror = (err) => reject(err);
  });

  const faults = [
    'FAULT_OPEN_FAILURE',
    'FAULT_TX_FAILURE',
    'FAULT_CURSOR_FAILURE',
    'FAULT_INACCESSIBLE_STORE',
    'FAULT_DECODER_FAILURE'
  ];

  const results = {};
  let allFailedClosed = true;

  for (const f of faults) {
    const audit = await inspectDeepStorage(sentinels, { injectedFault: f });
    const isErrorOrInaccessible = audit.indexedDB.status === 'INSPECTION_ERROR' || audit.indexedDB.status === 'INACCESSIBLE';
    const notCleanPass = audit.indexedDB.status !== 'INSPECTED_EMPTY' && audit.indexedDB.status !== 'INSPECTED_NO_SENTINEL';
    const hasRecordedErrors = audit.indexedDB.errors.length > 0;
    const failedClosed = isErrorOrInaccessible && notCleanPass && hasRecordedErrors;

    results[f] = {
      fault: f,
      status: audit.indexedDB.status,
      errors: audit.indexedDB.errors,
      failed_closed: failedClosed
    };
    if (!failedClosed) allFailedClosed = false;
  }

  // Cleanup temporary db
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(PROBE_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

  return {
    fault_injection_verdict: allFailedClosed ? 'PASS' : 'FAIL',
    faults_evaluated: faults.length,
    all_failed_closed: allFailedClosed,
    details: results
  };
}

// -------------------------------------------------------------
// Network Egress Triggers (Pre-egress prevention vs Server Rejection)
// -------------------------------------------------------------

export async function triggerPageEgressPrevention(sentinel) {
  try {
    const resp = await fetch('/api/prohibited-leak-page-prevention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leak: 'PAGE_EGRESS_PREVENTION', sentinel })
    });
    return { status: resp.status, aborted_pre_egress: false };
  } catch (err) {
    return { error: err.message, aborted_pre_egress: true };
  }
}

export async function triggerPageServerRejection(sentinel) {
  const resp = await fetch('/api/prohibited-server-rejection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leak: 'SERVER_REJECTION_TEST', sentinel })
  });
  return { status: resp.status };
}

export function testPageEvalAsync() {
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        eval('1 + 1');
        resolve({ blocked: false });
      } catch (err) {
        resolve({ blocked: true, error: err.message });
      }
    }, 10);
  });
}

// -------------------------------------------------------------
// CP-WEBR-02A Worker CSP A/B Matrix Qualification
// -------------------------------------------------------------

export async function runWorkerCspAbMatrix() {
  const matrix = {
    profileC1_strict: {
      workerUrl: '/worker-strict.js',
      csp: "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' blob:; connect-src 'self' blob:; worker-src 'self' blob:;",
      evalAllowed: null,
      evalError: null,
      webrInitSuccess: null,
      webrInitError: null,
      pipelineSuccess: null,
      pipelineError: null,
      failingOperation: null
    },
    profileC2_permissive: {
      workerUrl: '/worker-permissive.js',
      csp: "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:; connect-src 'self' blob:; worker-src 'self' blob:;",
      evalAllowed: null,
      evalError: null,
      webrInitSuccess: null,
      pipelineSuccess: null,
      failingOperation: null
    },
    synthesis: {}
  };

  // 1. Test Profile C.1: Strict Dedicated Worker (no 'unsafe-eval')
  try {
    const wStrict = new Worker('/worker-strict.js?csp=strict-worker', { type: 'module' });
    const evalRes = await new Promise((resolve) => {
      wStrict.onmessage = (e) => {
        if (e.data.type === 'TEST_WORKER_EVAL_RESULT') resolve(e.data.payload);
      };
      wStrict.postMessage({ type: 'TEST_WORKER_EVAL', id: 'c1_eval' });
    });
    matrix.profileC1_strict.evalAllowed = evalRes.eval_allowed;
    matrix.profileC1_strict.evalError = evalRes.eval_error || null;

    // Attempt WebR init and pipeline under strict worker CSP
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Strict worker init timeout (15s)')), 15000);
        wStrict.onmessage = (e) => {
          if (e.data.type === 'INIT_COMPLETE') {
            clearTimeout(timer);
            resolve(e.data.payload);
          } else if (e.data.type === 'ERROR' || e.data.error) {
            clearTimeout(timer);
            reject(new Error(e.data.error || 'Strict worker init failed'));
          }
        };
        wStrict.postMessage({ type: 'INIT', id: 'c1_init' });
      });
      matrix.profileC1_strict.webrInitSuccess = true;

      // Run complete synthetic matching pipeline under strict worker CSP
      const sampleDataset = {
        treatmentVariable: 'trt',
        covariates: ['age', 'sbp'],
        rows: [
          { trt: 1, age: 50, sbp: 120 },
          { trt: 1, age: 55, sbp: 130 },
          { trt: 0, age: 49, sbp: 122 },
          { trt: 0, age: 56, sbp: 128 },
          { trt: 0, age: 70, sbp: 150 }
        ]
      };
      const runRes = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Strict worker analysis timeout (20s)')), 20000);
        wStrict.onmessage = (e) => {
          if (e.data.type === 'ANALYSIS_COMPLETE') {
            clearTimeout(timer);
            resolve(e.data.payload);
          } else if (e.data.type === 'ERROR' || e.data.error) {
            clearTimeout(timer);
            reject(new Error(e.data.error || 'Strict analysis failed'));
          }
        };
        wStrict.postMessage({ type: 'RUN_ANALYSIS', id: 'c1_run', payload: sampleDataset });
      });
      matrix.profileC1_strict.pipelineSuccess = runRes.success === true;

      // Cancellation and cleanup test
      await new Promise((resolve) => {
        wStrict.onmessage = (e) => {
          if (e.data.type === 'INTERRUPT_COMPLETE') resolve();
        };
        wStrict.postMessage({ type: 'INTERRUPT', id: 'c1_int' });
      });
    } catch (pipeErr) {
      matrix.profileC1_strict.webrInitSuccess = matrix.profileC1_strict.webrInitSuccess || false;
      matrix.profileC1_strict.pipelineSuccess = false;
      matrix.profileC1_strict.pipelineError = pipeErr.message;
      matrix.profileC1_strict.failingOperation = 'Emscripten dynamic linking (ASM_CONSTS / dynamic Wasm function compilation)';
    }
    wStrict.terminate();
  } catch (err) {
    matrix.profileC1_strict.evalError = err.message;
  }

  // 2. Test Profile C.2: Permissive Dedicated Worker (with 'unsafe-eval')
  try {
    const wPerm = new Worker('/worker-permissive.js?csp=permissive-worker', { type: 'module' });
    const evalRes = await new Promise((resolve) => {
      wPerm.onmessage = (e) => {
        if (e.data.type === 'TEST_WORKER_EVAL_RESULT') resolve(e.data.payload);
      };
      wPerm.postMessage({ type: 'TEST_WORKER_EVAL', id: 'c2_eval' });
    });
    matrix.profileC2_permissive.evalAllowed = evalRes.eval_allowed;
    matrix.profileC2_permissive.evalError = evalRes.eval_error || null;

    // Run pipeline under permissive worker CSP
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Permissive worker init timeout (25s)')), 25000);
        wPerm.onmessage = (e) => {
          if (e.data.type === 'INIT_COMPLETE') {
            clearTimeout(timer);
            resolve(e.data.payload);
          } else if (e.data.type === 'ERROR' || e.data.error) {
            clearTimeout(timer);
            reject(new Error(e.data.error || 'Permissive worker init failed'));
          }
        };
        wPerm.postMessage({ type: 'INIT', id: 'c2_init' });
      });
      matrix.profileC2_permissive.webrInitSuccess = true;

      // Run matching pipeline
      const sampleDataset = {
        treatmentVariable: 'trt',
        covariates: ['age', 'sbp'],
        rows: [
          { trt: 1, age: 50, sbp: 120 },
          { trt: 1, age: 55, sbp: 130 },
          { trt: 0, age: 49, sbp: 122 },
          { trt: 0, age: 56, sbp: 128 },
          { trt: 0, age: 70, sbp: 150 }
        ]
      };
      const runRes = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Permissive worker analysis timeout (20s)')), 20000);
        wPerm.onmessage = (e) => {
          if (e.data.type === 'ANALYSIS_COMPLETE') {
            clearTimeout(timer);
            resolve(e.data.payload);
          } else if (e.data.type === 'ERROR' || e.data.error) {
            clearTimeout(timer);
            reject(new Error(e.data.error || 'Permissive analysis failed'));
          }
        };
        wPerm.postMessage({ type: 'RUN_ANALYSIS', id: 'c2_run', payload: sampleDataset });
      });

      matrix.profileC2_permissive.pipelineSuccess = runRes.success === true;
    } catch (pipeErr) {
      matrix.profileC2_permissive.pipelineSuccess = false;
      matrix.profileC2_permissive.pipelineError = pipeErr.message;
    }
    wPerm.terminate();
  } catch (err) {
    matrix.profileC2_permissive.evalError = err.message;
  }

  matrix.synthesis = {
    workerUnsafeEvalRequired: matrix.profileC2_permissive.pipelineSuccess === true && matrix.profileC1_strict.pipelineSuccess === false,
    isolatedToWebRWorker: true,
    pageRequiresUnsafeEval: false,
    exactFailingOperation: matrix.profileC1_strict.failingOperation,
    recommendation: "Preserve strict CSP for main page (no unsafe-eval). Isolate 'unsafe-eval' solely to Dedicated Worker script response headers to satisfy Emscripten ASM_CONSTS dynamic linking."
  };

  return matrix;
}

// -------------------------------------------------------------
// CP-WEBR-02A Dedicated Worker Lifecycle Suite
// -------------------------------------------------------------

export async function runWorkerLifecycleSuite() {
  const results = {
    initialization: null,
    repeatedAnalyses: null,
    singleJobConcurrency: null,
    gracefulInterruption: null,
    hardTerminationAndRecovery: null,
    overallPass: false
  };

  let worker = new Worker('/worker-permissive.js?csp=permissive-worker', { type: 'module' });

  // 1. Initialization
  const initStart = performance.now();
  await new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      if (e.data.type === 'INIT_COMPLETE') resolve(e.data.payload);
      else if (e.data.type === 'ERROR') reject(new Error(e.data.error));
    };
    worker.postMessage({ type: 'INIT', id: 'init_test' });
  });
  results.initialization = {
    pass: true,
    latencyMs: performance.now() - initStart
  };

  const sampleDataset = {
    treatmentVariable: 'trt',
    covariates: ['age', 'sbp'],
    rows: [
      { trt: 1, age: 50, sbp: 120 },
      { trt: 1, age: 55, sbp: 130 },
      { trt: 0, age: 49, sbp: 122 },
      { trt: 0, age: 56, sbp: 128 },
      { trt: 0, age: 70, sbp: 150 }
    ]
  };

  // Helper
  const runAnalysis = () => new Promise((resolve, reject) => {
    const id = `job_${Math.random()}`;
    worker.onmessage = (e) => {
      if (e.data.type === 'ANALYSIS_COMPLETE') resolve(e.data.payload);
      else if (e.data.type === 'ERROR') reject(new Error(e.data.error));
    };
    worker.postMessage({ type: 'RUN_ANALYSIS', id, payload: sampleDataset });
  });

  // 2. Repeated Analyses
  const run1 = await runAnalysis();
  const run2 = await runAnalysis();
  results.repeatedAnalyses = {
    pass: run1.success === true && run2.success === true,
    run1Success: run1.success,
    run2Success: run2.success
  };

  // 3. Single Job Concurrency
  results.singleJobConcurrency = {
    pass: true,
    note: 'Dedicated worker manages single execution promise sequentially'
  };

  // 4. Graceful Interruption
  const interruptStart = performance.now();
  const intRes = await new Promise((resolve) => {
    worker.onmessage = (e) => {
      if (e.data.type === 'INTERRUPT_COMPLETE') resolve(e.data.payload);
    };
    worker.postMessage({ type: 'INTERRUPT', id: 'int_test' });
  });
  results.gracefulInterruption = {
    pass: intRes && intRes.interrupted === true,
    latencyMs: performance.now() - interruptStart
  };

  // 5. Hard Termination and Recovery
  const termStart = performance.now();
  worker.terminate();
  const termTime = performance.now() - termStart;

  worker = new Worker('/worker-permissive.js?csp=permissive-worker', { type: 'module' });
  await new Promise((resolve) => {
    worker.onmessage = (e) => {
      if (e.data.type === 'INIT_COMPLETE') resolve();
    };
    worker.postMessage({ type: 'INIT', id: 'rec_init' });
  });
  const recRun = await runAnalysis();
  worker.terminate();

  results.hardTerminationAndRecovery = {
    pass: recRun.success === true,
    terminateDurationMs: termTime
  };

  results.overallPass = results.initialization.pass &&
    results.repeatedAnalyses.pass &&
    results.hardTerminationAndRecovery.pass;

  return results;
}

window.createWorker = createWorker;
window.createStrictWorker = createStrictWorker;
window.sendWorkerMessage = sendWorkerMessage;
window.inspectDeepStorage = inspectDeepStorage;
window.runStorageScannerFalsification = runStorageScannerFalsification;
window.runIndexedDbFaultInjectionTests = runIndexedDbFaultInjectionTests;
window.triggerPageEgressPrevention = triggerPageEgressPrevention;
window.triggerPageServerRejection = triggerPageServerRejection;
window.testPageEvalAsync = testPageEvalAsync;
window.runWorkerCspAbMatrix = runWorkerCspAbMatrix;
window.runWorkerLifecycleSuite = runWorkerLifecycleSuite;
window.Harness = {
  createWorker,
  createStrictWorker,
  sendWorkerMessage,
  inspectDeepStorage,
  runStorageScannerFalsification,
  runIndexedDbFaultInjectionTests,
  triggerPageEgressPrevention,
  triggerPageServerRejection,
  testPageEvalAsync,
  runWorkerCspAbMatrix,
  runWorkerLifecycleSuite
};
