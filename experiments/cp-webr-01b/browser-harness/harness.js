// CP-WEBR-01B Browser Harness Script
// Provides deep recursive storage inspection, scanner falsification probe, and worker orchestration

window.currentWorker = null;
let msgId = 0;
const pending = new Map();

export function createWorker() {
  if (window.currentWorker) {
    window.currentWorker.terminate();
  }
  window.currentWorker = new Worker('/worker.js', { type: 'module' });
  window.currentWorker.onmessage = (e) => {
    const { id, type, error } = e.data;
    if (pending.has(id)) {
      const { resolve, reject } = pending.get(id);
      pending.delete(id);
      if (type === 'WORKER_ERROR' || error) {
        reject(new Error(error || 'Worker error'));
      } else {
        resolve(e.data);
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
    const { id, type, error } = e.data;
    if (pending.has(id)) {
      const { resolve, reject } = pending.get(id);
      pending.delete(id);
      if (type === 'WORKER_ERROR' || error) {
        reject(new Error(error || 'Worker error'));
      } else {
        resolve(e.data);
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

export async function inspectDeepStorage(sentinels, options = {}) {
  const injectedFault = options.injectedFault || null;
  const audit = {
    executed_at: '2026-10-20T00:00:00.000Z',
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
  });

  return {
    fault_injection_verdict: allFailedClosed ? 'PASS' : 'FAIL',
    faults_evaluated: faults.length,
    all_failed_closed: allFailedClosed,
    details: results
  };
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
