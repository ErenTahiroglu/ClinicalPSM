// CP-WEBR-01B Browser Harness Script
// Provides deep recursive storage inspection and worker orchestration

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
      // Check key name itself
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

export async function inspectDeepStorage(sentinels) {
  const audit = {
    executed_at: '2026-10-20T00:00:00.000Z',
    sentinels_checked: sentinels,
    indexedDB: { databases: [], records_inspected: 0, residue_matches: [] },
    localStorage: { entries_inspected: 0, residue_matches: [] },
    sessionStorage: { entries_inspected: 0, residue_matches: [] },
    cacheStorage: { caches_inspected: 0, requests_inspected: 0, residue_matches: [] },
    serviceWorkers: { registrations_count: 0 },
    total_residue_found: 0,
    storage_accessible: true
  };

  // 1. IndexedDB Inspection
  try {
    if (window.indexedDB && window.indexedDB.databases) {
      const dbs = await window.indexedDB.databases();
      audit.indexedDB.databases = dbs.map(d => ({ name: d.name, version: d.version }));

      for (const dbInfo of dbs) {
        if (!dbInfo.name) continue;
        await new Promise((resolve) => {
          const req = indexedDB.open(dbInfo.name);
          req.onsuccess = async (e) => {
            const db = e.target.result;
            const storeNames = Array.from(db.objectStoreNames);
            for (const sName of storeNames) {
              await new Promise((sResolve) => {
                const tx = db.transaction(sName, 'readonly');
                const store = tx.objectStore(sName);
                const curReq = store.openCursor();
                curReq.onsuccess = async (ev) => {
                  const cursor = ev.target.result;
                  if (cursor) {
                    audit.indexedDB.records_inspected++;
                    // Inspect key
                    const keyMatches = await inspectValueRecursively(cursor.key, sentinels, `${dbInfo.name}.${sName}[key]`);
                    audit.indexedDB.residue_matches.push(...keyMatches);
                    // Inspect value
                    const valMatches = await inspectValueRecursively(cursor.value, sentinels, `${dbInfo.name}.${sName}[val]`);
                    audit.indexedDB.residue_matches.push(...valMatches);
                    cursor.continue();
                  } else {
                    sResolve();
                  }
                };
                curReq.onerror = () => sResolve();
              });
            }
            db.close();
            resolve();
          };
          req.onerror = () => resolve();
        });
      }
    }
  } catch (err) {
    audit.indexedDB.error = err.message;
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
// Negative control triggers
// -------------------------------------------------------------

export async function triggerPageEgress(sentinel) {
  const resp = await fetch('/api/prohibited-leak-page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leak: 'PAGE_EGRESS', sentinel })
  });
  return { status: resp.status };
}

window.createWorker = createWorker;
window.sendWorkerMessage = sendWorkerMessage;
window.inspectDeepStorage = inspectDeepStorage;
window.triggerPageEgress = triggerPageEgress;
