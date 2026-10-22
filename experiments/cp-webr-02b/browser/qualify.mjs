import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { createServer } from './server.mjs';

const PORT = Number(process.env.CP_WEBR_BROWSER_PORT || 8898);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const EVIDENCE_FILE = process.env.CP_WEBR_BROWSER_EVIDENCE_FILE || '/tmp/cp-webr-02b-browser-evidence.json';
const WAIT_LONG = 10 * 60 * 1000;
const storageSentinels = {
  localStorage: 'SYNTH_PT_7a9f8c12_SEC_TRACE_01',
  sessionStorage: 'SYNTH_PT_b3e4d567_SEC_TRACE_02',
  cookie: 'FACTOR_LEVEL_ALPHA_9f8e7d6c',
  indexedDB: 'FACTOR_LEVEL_BETA_1a2b3c4d',
  cacheStorage: 'Clinical Biomarker Δ [mg/dL]'
};
const allSentinels = Object.values(storageSentinels);
const results = [];
const networkEntries = [];
const responseCsp = [];
const websocketEvents = [];
const serviceWorkerEvents = [];
const storageEvidence = [];
const browserDiagnostics = [];
let phase = 'APP_LOAD';

function record(name, status, detail = '') {
  results.push({ name, status, detail });
  console.log(`${status.padEnd(9)} ${name}${detail ? ` :: ${detail}` : ''}`);
}

function commitSha() {
  try { return process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return process.env.GITHUB_SHA || 'UNKNOWN_COMMIT_SHA'; }
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function approvedStaticRequest(requestUrl, method, origin) {
  let url;
  try { url = new URL(requestUrl); } catch { return false; }
  if (url.origin !== origin || !['GET', 'HEAD'].includes(method)) return false;
  return /^\/(?:assets\/|en\/|tr\/|__test__\/|robots\.txt$|favicon\.ico$|\.well-known\/)/.test(url.pathname) || url.pathname === '/';
}

function decideNetworkGate(entries) {
  const unauthorized = entries.filter(entry => !entry.approvedStatic);
  return {
    status: unauthorized.length === 0 ? 'PASS' : 'FAIL',
    unauthorizedCount: unauthorized.length,
    unauthorized: unauthorized.map(({ method, url, bodyPresent, bodyByteLength, decision }) => ({ method, url, bodyPresent, bodyByteLength, decision }))
  };
}

async function storageScan(page, context, checkpoint) {
  const browserAudit = await page.evaluate(async sentinels => {
    const matches = [];
    const counts = { localStorage: 0, sessionStorage: 0, cookies: 0, indexedDBDatabases: 0, indexedDBRecords: 0, cacheStorageNames: 0, cacheStorageRecords: 0, serviceWorkerRegistrations: 0 };
    const errors = [];
    const matchText = (source, value) => {
      if (typeof value !== 'string') return;
      for (const sentinel of sentinels) if (value.includes(sentinel)) matches.push({ source, sentinel });
    };
    const walk = (source, value, seen = new WeakSet()) => {
      if (typeof value === 'string') { matchText(source, value); return; }
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (ArrayBuffer.isView(value)) { matchText(source, new TextDecoder().decode(value)); return; }
      if (value instanceof ArrayBuffer) { matchText(source, new TextDecoder().decode(value)); return; }
      for (const [key, item] of Object.entries(value)) { matchText(`${source}.key`, key); walk(source, item, seen); }
    };

    try {
      counts.localStorage = localStorage.length;
      for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); matchText('localStorage.key', key); matchText('localStorage.value', localStorage.getItem(key)); }
    } catch (error) { errors.push(`localStorage: ${error.message}`); }
    try {
      counts.sessionStorage = sessionStorage.length;
      for (let i = 0; i < sessionStorage.length; i++) { const key = sessionStorage.key(i); matchText('sessionStorage.key', key); matchText('sessionStorage.value', sessionStorage.getItem(key)); }
    } catch (error) { errors.push(`sessionStorage: ${error.message}`); }
    try {
      counts.cookies = document.cookie ? document.cookie.split(';').length : 0;
      matchText('document.cookie', document.cookie);
    } catch (error) { errors.push(`document.cookie: ${error.message}`); }
    try {
      const dbs = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
      counts.indexedDBDatabases = dbs.length;
      for (const info of dbs) {
        if (!info.name) continue;
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(info.name);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error('open failed'));
          request.onblocked = () => reject(new Error('open blocked'));
        });
        for (const storeName of Array.from(db.objectStoreNames)) {
          const records = await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const request = tx.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error || new Error('getAll failed'));
          });
          counts.indexedDBRecords += records.length;
          for (const record of records) walk(`indexedDB:${info.name}.${storeName}`, record);
        }
        db.close();
      }
    } catch (error) { errors.push(`indexedDB: ${error.message}`); }
    try {
      const names = await caches.keys();
      counts.cacheStorageNames = names.length;
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          counts.cacheStorageRecords++;
          matchText(`CacheStorage:${name}.request`, request.url);
          const response = await cache.match(request);
          if (response) matchText(`CacheStorage:${name}.response`, await response.clone().text());
        }
      }
    } catch (error) { errors.push(`CacheStorage: ${error.message}`); }
    try {
      if ('serviceWorker' in navigator) counts.serviceWorkerRegistrations = (await navigator.serviceWorker.getRegistrations()).length;
      else errors.push('serviceWorker API unavailable');
    } catch (error) { errors.push(`serviceWorker: ${error.message}`); }
    return { matches, counts, errors, inspection: {
      localStorage: 'MEASURED', sessionStorage: 'MEASURED', cookies: 'MEASURED',
      indexedDB: typeof indexedDB.databases === 'function' ? 'MEASURED' : 'UNMEASURED',
      cacheStorage: 'MEASURED', serviceWorkerRegistrations: 'MEASURED'
    } };
  }, allSentinels);

  const browserCookies = await context.cookies(ORIGIN);
  const cookieMatches = [];
  for (const cookie of browserCookies) {
    for (const sentinel of allSentinels) if (`${cookie.name}=${cookie.value}`.includes(sentinel)) cookieMatches.push({ source: 'cookieJar', sentinel });
  }
  const audit = { checkpoint, ...browserAudit, matches: [...browserAudit.matches, ...cookieMatches], cookieJarCount: browserCookies.length };
  storageEvidence.push(audit);
  return audit;
}

async function plantStorageControls(page) {
  await page.evaluate(async sentinels => {
    localStorage.setItem('cp-webr-02b-positive', sentinels.localStorage);
    sessionStorage.setItem('cp-webr-02b-positive', sentinels.sessionStorage);
    document.cookie = `cp_webr_02b_positive=${encodeURIComponent(sentinels.cookie)}; Path=/; SameSite=Lax`;
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('cp-webr-02b-positive-control', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('rows');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('rows', 'readwrite');
        tx.objectStore('rows').put({ row: sentinels.indexedDB }, 'positive-control');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    const cache = await caches.open('cp-webr-02b-positive-control');
    await cache.put('/__privacy-positive-control__', new Response(sentinels.cacheStorage));
  }, storageSentinels);
}

async function removeStorageControls(page) {
  await page.evaluate(async () => {
    localStorage.removeItem('cp-webr-02b-positive');
    sessionStorage.removeItem('cp-webr-02b-positive');
    document.cookie = 'cp_webr_02b_positive=; Max-Age=0; Path=/; SameSite=Lax';
    await new Promise(resolve => {
      const request = indexedDB.deleteDatabase('cp-webr-02b-positive-control');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    await caches.delete('cp-webr-02b-positive-control');
  });
}

async function runLifecycle(page, args) {
  return page.evaluate(options => window.runLifecycleScenario(options), args);
}

async function main() {
  const serverInfo = createServer({ port: PORT });
  await new Promise(resolve => serverInfo.server.listen(PORT, '127.0.0.1', resolve));
  let browser = null;
  let context = null;
  let observedWebTransport = 'UNMEASURED';

  try {
  const candidates = [process.env.CHROMIUM_PATH, process.env.BROWSER_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  const executablePath = candidates.find(candidate => candidate && fs.existsSync(candidate));
  const launchOptions = { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  if (executablePath) launchOptions.executablePath = executablePath;
  browser = await chromium.launch(launchOptions);
  context = await browser.newContext();
  context.on('page', observedPage => {
    observedPage.on('console', message => {
      if (browserDiagnostics.length < 300) browserDiagnostics.push({ type: `console.${message.type()}`, text: message.text().slice(0, 600), url: message.location()?.url || null });
    });
    observedPage.on('pageerror', error => {
      if (browserDiagnostics.length < 300) browserDiagnostics.push({ type: 'pageerror', text: String(error?.stack || error).slice(0, 1200) });
    });
    observedPage.on('requestfailed', request => {
      if (browserDiagnostics.length < 300) browserDiagnostics.push({ type: 'requestfailed', url: request.url(), failure: request.failure()?.errorText || 'unknown' });
    });
  });

  await context.route('**/*', async route => {
    const request = route.request();
    const requestUrl = request.url();
    const body = request.postDataBuffer();
    const approvedStatic = approvedStaticRequest(requestUrl, request.method(), ORIGIN);
    const entry = {
      phase,
      method: request.method(),
      url: requestUrl,
      resourceType: request.resourceType(),
      sameOrigin: (() => { try { return new URL(requestUrl).origin === ORIGIN; } catch { return false; } })(),
      approvedStatic,
      bodyPresent: Boolean(body?.byteLength),
      bodyByteLength: body?.byteLength || 0,
      decision: approvedStatic ? 'CONTINUED_STATIC' : 'BLOCKED_UNAUTHORIZED'
    };
    networkEntries.push(entry);
    if (approvedStatic) await route.continue();
    else await route.abort('blockedbyclient');
  });
  context.on('requestfinished', async request => {
    if (!/\/assets\/webr(?:-worker)?\/|\/assets\/webr-worker\.js/.test(request.url())) return;
    try {
      const response = await request.response();
      if (response) responseCsp.push({
        url: request.url(),
        status: response.status(),
        contentSecurityPolicy: (await response.allHeaders())['content-security-policy'] || null
      });
    } catch {}
  });
  context.on('serviceworker', worker => serviceWorkerEvents.push({ url: worker.url() }));

  const page = await context.newPage();
  page.on('websocket', socket => websocketEvents.push({ url: socket.url() }));
  await page.addInitScript(() => {
    window.__workerAudit = { created: [], posts: [], messages: [] };
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(Target, args) {
        const worker = Reflect.construct(Target, args);
        window.__workerAudit.created.push({ url: String(args[0]), type: args[1]?.type || 'classic' });
        worker.addEventListener('message', event => {
          const message = event.data || {};
          const entry = { type: message.type || null, id: message.id || null, targetJobId: message.targetJobId || null, code: message.code || null };
          if (message.nativeErrorName) entry.nativeErrorName = message.nativeErrorName;
          if (message.nativeErrorCode) entry.nativeErrorCode = message.nativeErrorCode;
          if (message.type === 'INIT_COMPLETE' && message.payload) {
            entry.runtime = {
              webrVersion: message.payload.webrVersion,
              rVersion: message.payload.rVersion,
              packages: message.payload.packages,
              crossOriginIsolated: message.payload.crossOriginIsolated,
              sharedArrayBufferAvailable: message.payload.sharedArrayBufferAvailable,
              channelType: message.payload.channelType
            };
          }
          window.__workerAudit.messages.push(entry);
        });
        const nativePost = worker.postMessage.bind(worker);
        Object.defineProperty(worker, 'postMessage', { configurable: true, value(message, ...transfer) {
          if (message && typeof message.type === 'string') {
            window.__workerAudit.posts.push({ type: message.type, id: message.id || null, targetJobId: message.targetJobId || null });
          }
          return nativePost(message, ...transfer);
        } });
        return worker;
      }
    });
  });

    const response = await page.goto(`${ORIGIN}/en/demo/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const pageIsolation = await page.evaluate(() => ({
      crossOriginIsolated: self.crossOriginIsolated === true,
      sharedArrayBufferAvailable: typeof SharedArrayBuffer !== 'undefined',
      webTransportAvailable: typeof WebTransport !== 'undefined'
    }));
    if (!pageIsolation.webTransportAvailable) observedWebTransport = 'NOT_AVAILABLE';
    const pageCsp = response?.headers()['content-security-policy'] || null;
    const workerHeaderProbe = await page.evaluate(async () => Promise.all([
      '/assets/webr-worker.js', '/assets/webr/webr-worker.js'
    ].map(async url => {
      const result = await fetch(url, { method: 'GET', cache: 'no-store' });
      return { url: new URL(url, location.href).href, status: result.status, contentSecurityPolicy: result.headers.get('content-security-policy') };
    })));
    responseCsp.push(...workerHeaderProbe);
    const beforeInit = await storageScan(page, context, 'before_initialization');
    record('Browser app entry and isolation headers', response?.ok() && pageIsolation.crossOriginIsolated && pageIsolation.sharedArrayBufferAvailable ? 'PASS' : 'FAIL',
      `status=${response?.status()}; page.crossOriginIsolated=${pageIsolation.crossOriginIsolated}; SharedArrayBuffer=${pageIsolation.sharedArrayBufferAvailable}`);
    record('Storage inspection before initialization', beforeInit.errors.length === 0 && beforeInit.matches.length === 0 ? 'PASS' : 'FAIL',
      `errors=${beforeInit.errors.length}; sentinel matches=${beforeInit.matches.length}; services=${beforeInit.counts.serviceWorkerRegistrations}`);

    await plantStorageControls(page);
    const planted = await storageScan(page, context, 'storage_positive_control_planted');
    const plantedSources = new Set(planted.matches.map(match => match.source.split(':')[0].split('.')[0]));
    const expectedStorageSources = ['localStorage', 'sessionStorage', 'document', 'indexedDB', 'CacheStorage'];
    const storagePositivePass = expectedStorageSources.every(source => [...plantedSources].some(found => found.startsWith(source)));
    record('Runtime storage scanner positive controls', storagePositivePass && planted.matches.length >= 5 ? 'PASS' : 'FAIL',
      `sentinel matches=${planted.matches.length}; sources=${[...plantedSources].join(',')}`);
    await removeStorageControls(page);
    const cleaned = await storageScan(page, context, 'after_positive_control_cleanup');
    record('Injected storage data removed', cleaned.matches.length === 0 ? 'PASS' : 'FAIL', `remaining sentinel matches=${cleaned.matches.length}`);

    // Isolated harness context qualifies actual browser page and Worker requests plus fail-if-permitted behavior.
    const controlContext = await browser.newContext();
    const blockedControlEntries = [];
    await controlContext.route('**/*', async route => {
      const request = route.request();
      const body = request.postDataBuffer();
      const approvedStatic = approvedStaticRequest(request.url(), request.method(), ORIGIN);
      const entry = { method: request.method(), url: request.url(), approvedStatic, bodyPresent: Boolean(body?.byteLength), bodyByteLength: body?.byteLength || 0, decision: approvedStatic ? 'CONTINUED_STATIC' : 'BLOCKED_UNAUTHORIZED' };
      blockedControlEntries.push(entry);
      if (approvedStatic) await route.continue(); else await route.abort('blockedbyclient');
    });
    const controlPage = await controlContext.newPage();
    await controlPage.goto(`${ORIGIN}/__test__/lifecycle.html`, { waitUntil: 'domcontentloaded' });
    await controlPage.evaluate(async () => {
      try { await fetch('https://egress.invalid/page-sentinel', { method: 'POST', body: 'SYNTHETIC_EGRESS_SENTINEL_02B' }); } catch {}
      try { await fetch('/__egress_probe__', { method: 'POST', body: 'SYNTHETIC_EGRESS_SENTINEL_02B' }); } catch {}
    });
    const workerBlocked = await controlPage.evaluate(() => new Promise(resolve => {
      const worker = new Worker('/__test__/egress-worker.js');
      worker.onmessage = event => { worker.terminate(); resolve(event.data); };
      worker.postMessage({ start: true });
    }));
    const blockedGate = decideNetworkGate(blockedControlEntries);
    const controlUnauthorized = blockedControlEntries.filter(entry => !entry.approvedStatic);
    const pageAndWorkerControlDetected = controlUnauthorized.some(entry => entry.url.includes('page-sentinel')) &&
      controlUnauthorized.some(entry => entry.url.includes('worker-sentinel')) &&
      controlUnauthorized.some(entry => entry.url.includes('/__egress_probe__'));
    record('Page, same-origin, and Worker request interception positive controls', pageAndWorkerControlDetected && blockedGate.status === 'FAIL' && workerBlocked?.status === 'request-blocked' ? 'PASS' : 'FAIL',
      `detected=${controlUnauthorized.length}; workerFetchBlocked=${workerBlocked?.status}; body-values=not-recorded`);
    record('Network gate fails when unauthorized request is permitted', decideNetworkGate([
      { method: 'POST', url: 'https://egress.invalid/permit-control', approvedStatic: false, bodyPresent: true, bodyByteLength: 32, decision: 'PERMITTED_CONTROL' }
    ]).status === 'FAIL' ? 'PASS' : 'FAIL', 'A permitted unauthorized positive-control event yields FAIL.');
    await controlContext.close();

    const permittedContext = await browser.newContext();
    const permittedEntries = [];
    await permittedContext.route('**/*', async route => {
      const request = route.request();
      const body = request.postDataBuffer();
      const approvedStatic = approvedStaticRequest(request.url(), request.method(), ORIGIN);
      const permittedControl = new URL(request.url()).hostname === 'egress.invalid';
      const entry = { method: request.method(), url: request.url(), approvedStatic, bodyPresent: Boolean(body?.byteLength), bodyByteLength: body?.byteLength || 0,
        decision: permittedControl ? 'PERMITTED_CONTROL' : approvedStatic ? 'CONTINUED_STATIC' : 'BLOCKED_UNAUTHORIZED' };
      permittedEntries.push(entry);
      if (approvedStatic) await route.continue();
      else if (permittedControl) await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': '*' }, body: '' });
      else await route.abort('blockedbyclient');
    });
    const permittedPage = await permittedContext.newPage();
    await permittedPage.goto(`${ORIGIN}/__test__/lifecycle.html`, { waitUntil: 'domcontentloaded' });
    const pagePermit = await permittedPage.evaluate(async () => {
      const response = await fetch('https://egress.invalid/page-permit-control', { method: 'POST', body: 'SYNTHETIC_EGRESS_SENTINEL_02B' });
      return response.status;
    });
    const workerPermit = await permittedPage.evaluate(() => new Promise(resolve => {
      const worker = new Worker('/__test__/egress-worker.js');
      worker.onmessage = event => { worker.terminate(); resolve(event.data?.status || 'unknown'); };
      worker.postMessage({ start: true });
    }));
    const permittedGate = decideNetworkGate(permittedEntries);
    record('Permitted page and Worker egress falsifies the monitoring gate', pagePermit === 204 && workerPermit === 'request-completed' &&
      permittedGate.status === 'FAIL' && permittedEntries.some(entry => entry.decision === 'PERMITTED_CONTROL' && entry.bodyPresent) ? 'PASS' : 'FAIL',
      `pageStatus=${pagePermit}; worker=${workerPermit}; gate=${permittedGate.status}; request bodies stored=false`);
    await permittedContext.close();

    // Runtime CSP probe is served under a strict Worker response header with no unsafe-eval.
    phase = 'LIFECYCLE_BROWSER_TESTS';
    const lifecyclePage = await context.newPage();
    await lifecyclePage.goto(`${ORIGIN}/__test__/lifecycle.html`, { waitUntil: 'domcontentloaded' });
    const strictEval = await lifecyclePage.evaluate(() => new Promise((resolve, reject) => {
      const worker = new Worker('/__test__/strict-eval-worker.js');
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('strict CSP Worker probe timed out')); }, 3000);
      worker.onmessage = event => { clearTimeout(timer); worker.terminate(); resolve(event.data); };
      worker.postMessage({ probe: true });
    }));
    const strictWorkerCsp = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' blob:; connect-src 'self' blob:; worker-src 'self' blob:";
    record('Strict Worker CSP blocks JavaScript eval', strictEval?.evalAllowed === false && strictEval.errorName === 'EvalError' && !/(?<!wasm-)unsafe-eval/.test(strictWorkerCsp) ? 'PASS' : 'FAIL',
      `new Function allowed=${strictEval?.evalAllowed}; error=${strictEval?.errorName}; policy has no unsafe-eval`);
    const strictWebrProbe = await runLifecycle(lifecyclePage, { mode: 'TEXT_ERROR', initTimeoutMs: 8000, allowInitFailure: true, timeoutMs: 5000 });
    const strictWebrBlockedByEmscripten = Boolean(strictWebrProbe.initFailure) && browserDiagnostics.some(entry => entry.type === 'pageerror' && /ASM_CONSTS\[code\] is not a function/.test(entry.text));
    record('Strict WebR Worker CSP runtime attempt', strictWebrBlockedByEmscripten ? 'PASS' : 'FAIL',
      `strict policy runtime initialization failure=${Boolean(strictWebrProbe.initFailure)}; Emscripten ASM_CONSTS CSP symptom observed=${strictWebrBlockedByEmscripten}`);
    const webrCspProfile = await lifecyclePage.evaluate(async () => (await fetch('/__test__/webr-csp?profile=compatible')).json());
    record('Apply isolated WebR CSP control profile', webrCspProfile?.profile === 'compatible' ? 'PASS' : 'FAIL',
      'The browser harness changes only /assets/webr/webr-worker.js after recording the strict-policy failure.');
    // Verify initialization cancellation is deterministic and never reported as graceful success.
    const initCancel = await lifecyclePage.evaluate(() => window.runInitializationCancellation());
    const initCancelPass = initCancel.cancelResult?.status === 'INITIALIZATION_HARD_TERMINATED' &&
      initCancel.cancelResult?.termination === 'HARD_TERMINATED' && initCancel.initOutcome?.status !== 'HANG';
    record('Cancellation during initialization is explicit hard termination', initCancelPass ? 'PASS' : 'FAIL', JSON.stringify(initCancel));

    // Real WebR R stop() whose error text contains “interrupted”; no interrupt request was made.
    const textError = await runLifecycle(lifecyclePage, { mode: 'TEXT_ERROR', timeoutMs: 5000 });
    record('R runtime error text containing “interrupted” is not cancellation', textError.outcome?.status === 'REJECTED' &&
      textError.outcome?.code === 'R_RUNTIME_ERROR' && textError.settlementCount === 1 ? 'PASS' : 'FAIL',
      `code=${textError.outcome?.code}; settlementCount=${textError.settlementCount}`);

    // Actual R stop() error is delayed after R evaluation has already failed; a simultaneous interrupt request must remain an R error.
    const unrelatedError = await runLifecycle(lifecyclePage, { mode: 'RUNTIME_ERROR_DURING_INTERRUPT', cancelAfterMs: 20, timeoutMs: 5000 });
    record('Unrelated R runtime exception during interruption stays distinct', unrelatedError.outcome?.status === 'REJECTED' &&
      unrelatedError.outcome?.code === 'R_RUNTIME_ERROR' && unrelatedError.cancelResult?.status !== 'GRACEFUL_INTERRUPT_CONFIRMED' &&
      unrelatedError.settlementCount === 1 ? 'PASS' : 'FAIL',
      `job=${unrelatedError.outcome?.code}; cancellation=${unrelatedError.cancelResult?.status}; settlements=${unrelatedError.settlementCount}`);

    // Actual long-running R loop through WebR 0.6.0, interrupted while evaluation is active.
    const genuineInterrupt = await runLifecycle(lifecyclePage, { mode: 'SLOW_R', cancelAfterMs: 30, cancelTimeoutMs: 2000, timeoutMs: 7000 });
    record('Genuine WebR R workload interrupted during evaluation', genuineInterrupt.outcome?.status === 'REJECTED' &&
      genuineInterrupt.outcome?.code === 'OPERATION_CANCELLED' && genuineInterrupt.cancelResult?.status === 'GRACEFUL_INTERRUPT_CONFIRMED' &&
      genuineInterrupt.settlementCount === 1 ? 'PASS' : 'FAIL',
      `job=${genuineInterrupt.outcome?.code}; cancellation=${genuineInterrupt.cancelResult?.status}; channel=${genuineInterrupt.init?.channelType}; settlements=${genuineInterrupt.settlementCount}`);

    const hardTermination = await runLifecycle(lifecyclePage, { mode: 'BLOCKING_JS', cancelAfterMs: 30, cancelTimeoutMs: 120, timeoutMs: 3000 });
    record('Hard termination after cancellation deadline', hardTermination.cancelResult?.status === 'HARD_TERMINATED' &&
      hardTermination.outcome?.status === 'REJECTED' && hardTermination.outcome?.code === 'HARD_TERMINATED' &&
      hardTermination.settlementCount === 1 ? 'PASS' : 'FAIL',
      `cancel=${hardTermination.cancelResult?.status}; job=${hardTermination.outcome?.code}; settlements=${hardTermination.settlementCount}`);

    const onerror = await runLifecycle(lifecyclePage, { mode: 'ONERROR', timeoutMs: 3000 });
    record('Worker onerror settles active job once', onerror.outcome?.status === 'REJECTED' && onerror.outcome?.code === 'WORKER_ONERROR' && onerror.settlementCount === 1 ? 'PASS' : 'FAIL',
      `code=${onerror.outcome?.code}; settlements=${onerror.settlementCount}`);
    const recovered = await lifecyclePage.evaluate(() => window.runRecoverySuccess());
    record('Fresh Worker recovery followed by successful job', recovered.managerState === 'READY' && recovered.result?.mode === 'SUCCESS' && recovered.workerCount >= 2 ? 'PASS' : 'FAIL',
      `state=${recovered.managerState}; workers=${recovered.workerCount}; result=${recovered.result?.mode}`);
    const messageerror = await runLifecycle(lifecyclePage, { mode: 'MESSAGEERROR', timeoutMs: 3000 });
    record('Worker onmessageerror settles active job once', messageerror.outcome?.status === 'REJECTED' &&
      messageerror.outcome?.code === 'WORKER_ONMESSAGEERROR' && messageerror.settlementCount === 1 && messageerror.messageErrorDispatched ? 'PASS' : 'FAIL',
      `code=${messageerror.outcome?.code}; dispatched=${messageerror.messageErrorDispatched}; handlerFallback=${messageerror.messageErrorHandlerFallback}; settlements=${messageerror.settlementCount}`);

    const stale = await runLifecycle(lifecyclePage, { mode: 'LATE_SUCCESS', cancelAfterMs: 20, cancelTimeoutMs: 1000, timeoutMs: 3000 });
    record('Stale success after cancellation is rejected', stale.outcome?.status === 'REJECTED' && stale.outcome?.code === 'LATE_RESULT_REJECTED' &&
      stale.settlementCount === 1 ? 'PASS' : 'FAIL', `job=${stale.outcome?.code}; cancel=${stale.cancelResult?.status}; settlements=${stale.settlementCount}`);

    const unsupported = await runLifecycle(lifecyclePage, { mode: 'LATE_SUCCESS', cancelAfterMs: 20, cancelTimeoutMs: 1000, timeoutMs: 3000, workerUrl: '/__test__/scenario-worker.js?unsupported=1' });
    record('Unsupported graceful interruption is distinct from success', unsupported.cancelResult?.status === 'INTERRUPT_UNSUPPORTED' &&
      unsupported.cancelResult?.termination === 'HARD_TERMINATED' && unsupported.cancelResult?.status !== 'GRACEFUL_INTERRUPT_CONFIRMED' ? 'PASS' : 'FAIL',
      `status=${unsupported.cancelResult?.status}; termination=${unsupported.cancelResult?.termination}`);

    await lifecyclePage.close();

    phase = 'NOMINAL_ANALYSIS';
    const isolationSession = await context.newCDPSession(page);
    await isolationSession.send('Emulation.setCPUThrottlingRate', { rate: 2 });
    await page.getByRole('button', { name: /Run synthetic demo|Sentetik demoyu çalıştır/ }).click();
    await page.waitForFunction(() => window.__workerAudit?.messages?.some(message => message.type === 'INIT_COMPLETE'), null, { timeout: WAIT_LONG });
    await page.waitForFunction(() => window.__workerAudit?.posts?.some(message => message.type === 'RUN_ANALYSIS'), null, { timeout: 30000 });
    const cancelControl = await page.locator('#cancel').evaluate(button => ({
      hidden: button.classList.contains('hidden') || getComputedStyle(button).display === 'none',
      disabled: button.disabled,
      label: button.textContent,
      status: document.querySelector('#status')?.textContent || ''
    }));
    if (cancelControl.hidden) {
      record('Production app cancellation control is available during active analysis', 'FAIL', JSON.stringify(cancelControl));
      throw new Error(`Production cancellation control was already hidden after RUN_ANALYSIS: ${JSON.stringify(cancelControl)}`);
    }
    record('Production app cancellation control is available during active analysis', 'PASS', JSON.stringify(cancelControl));
    await page.locator('#cancel').click();
    await page.waitForFunction(() => /cancelled|iptal edildi/i.test(document.querySelector('#status')?.textContent || '') ||
      window.__workerAudit?.messages?.some(message => message.type === 'ERROR' && ['OPERATION_CANCELLED', 'INTERRUPT_UNSUPPORTED_IN_POSTMESSAGE_MODE'].includes(message.code)), null, { timeout: 8000 });
    const productionEvents = await page.evaluate(() => window.__workerAudit);
    const productionCancel = productionEvents.messages.filter(message => message.type === 'ERROR' && message.code === 'OPERATION_CANCELLED');
    const channel = productionEvents.messages.find(message => message.type === 'INIT_COMPLETE')?.runtime;
    responseCsp.push(...serverInfo.getCspResponses());
    const productionCspWorker = responseCsp.filter(entry => /\/assets\/webr-worker\.js$/.test(entry.url));
    const allNestedWebrCsp = responseCsp.filter(entry => /\/assets\/webr\/webr-worker\.js$/.test(entry.url));
    const strictNestedWebrCsp = allNestedWebrCsp.filter(entry => entry.contentSecurityPolicy && !/(?<!wasm-)unsafe-eval/.test(entry.contentSecurityPolicy));
    const nestedWebrCsp = allNestedWebrCsp.filter(entry => entry.contentSecurityPolicy && /script-src[^;]*'unsafe-eval'/.test(entry.contentSecurityPolicy));
    const cspUnsafeEvalPass = productionCspWorker.length >= 1 && strictNestedWebrCsp.length >= 1 && nestedWebrCsp.length >= 1 &&
      productionCspWorker.every(entry => entry.contentSecurityPolicy && !/(?<!wasm-)unsafe-eval/.test(entry.contentSecurityPolicy)) &&
      strictNestedWebrCsp.every(entry => !/(?<!wasm-)unsafe-eval/.test(entry.contentSecurityPolicy)) &&
      nestedWebrCsp.every(entry => /script-src[^;]*'unsafe-eval'/.test(entry.contentSecurityPolicy));
    const exactJobCorrelation = productionCancel.length === 1 && productionCancel[0].id === productionCancel[0].targetJobId &&
      (productionCancel[0].nativeErrorName === 'UnwindProtectException' || productionCancel[0].nativeErrorCode === 'OPERATION_CANCELLED') &&
      productionEvents.posts.some(post => post.type === 'INTERRUPT' && post.targetJobId === productionCancel[0].id);
    record('Production app Worker empirical SharedArrayBuffer channel', pageIsolation.crossOriginIsolated && channel?.crossOriginIsolated === true &&
      channel?.sharedArrayBufferAvailable === true && channel?.channelType === 'SharedArrayBuffer' ? 'PASS' : 'FAIL',
      `page=${pageIsolation.crossOriginIsolated}; worker=${channel?.crossOriginIsolated}; selected=${channel?.channelType}; SAB=${channel?.sharedArrayBufferAvailable}`);
    record('Production app Worker request and cancellation correlation', exactJobCorrelation ? 'PASS' : 'FAIL',
      `cancelErrors=${productionCancel.length}; jobId=${productionCancel[0]?.id}; targetJobId=${productionCancel[0]?.targetJobId}; nativeName=${productionCancel[0]?.nativeErrorName}; nativeCode=${productionCancel[0]?.nativeErrorCode}; ACK is not used as cessation evidence`);
    record('Production app Worker strict; WebR CSP exception scoped', cspUnsafeEvalPass ? 'PASS' : 'FAIL',
      `appWorkerHeaders=${productionCspWorker.length} strict; nestedWebr strict attempts=${strictNestedWebrCsp.length}; compatible WebR runtime responses=${nestedWebrCsp.length}`);

    const afterCancel = await storageScan(page, context, 'after_cancellation');
    record('Storage inspection after cancellation', afterCancel.errors.length === 0 && afterCancel.matches.length === 0 ? 'PASS' : 'FAIL',
      `errors=${afterCancel.errors.length}; sentinel matches=${afterCancel.matches.length}`);

    // The production manager must recover from cancellation and return the synthetic result on a new run.
    await isolationSession.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.getByRole('button', { name: /Run synthetic demo|Sentetik demoyu çalıştır/ }).click();
    await page.locator('#out table tbody tr').first().waitFor({ timeout: WAIT_LONG });
    const output = await page.locator('#out').innerText();
    const browserState = await page.evaluate(() => ({
      audit: window.__workerAudit,
      output: document.querySelector('#out')?.innerText || ''
    }));
    const successfulEvents = browserState.audit.messages.filter(message => message.type === 'ANALYSIS_COMPLETE');
    const productionRecoveryPass = successfulEvents.length >= 1 && output.includes('109') && output.includes('91');
    record('Built static app successful synthetic analysis after cancellation', productionRecoveryPass ? 'PASS' : 'FAIL',
      `analysis completions=${successfulEvents.length}; output includes 109 treated, 91 controls and 91 pairs=${productionRecoveryPass}`);
    record('Synthetic result non-certification warning', /substantial residual imbalance/i.test(output) &&
      /OUTPUT_READY means an output was generated/i.test(output) ? 'PASS' : 'FAIL', 'UI distinguishes output generation from acceptable balance or clinical validity.');

    const afterAnalysis = await storageScan(page, context, 'after_analysis');
    record('Storage inspection after full analysis', afterAnalysis.errors.length === 0 && afterAnalysis.matches.length === 0 ? 'PASS' : 'FAIL',
      `errors=${afterAnalysis.errors.length}; sentinel matches=${afterAnalysis.matches.length}; Cache Storage entries=${afterAnalysis.counts.cacheStorageNames}`);

    const appPhaseNetwork = networkEntries.filter(entry => ['APP_LOAD', 'NOMINAL_ANALYSIS'].includes(entry.phase));
    const nominalNetwork = decideNetworkGate(appPhaseNetwork);
    record('Real app and Worker runtime network egress qualification', nominalNetwork.status,
      `HTTP requests=${appPhaseNetwork.length}; unauthorized=${nominalNetwork.unauthorizedCount}; body values are not persisted`);
    record('Nominal app and Worker requests carry no dataset body', appPhaseNetwork.every(entry => !entry.bodyPresent) ? 'PASS' : 'FAIL',
      `requests with request bodies=${appPhaseNetwork.filter(entry => entry.bodyPresent).length}; only static GET assets are approved`);
    const workerAssetRequests = appPhaseNetwork.filter(entry => /\/assets\/webr\/webr-worker\.js$/.test(entry.url));
    record('Nested WebR Worker initialization observed', workerAssetRequests.length > 0 && successfulEvents.length > 0 ? 'PASS' : 'FAIL',
      `nested worker script requests=${workerAssetRequests.length}; successful full R pipeline=${successfulEvents.length > 0}`);
    record('WebSocket egress monitoring', 'UNMEASURED', `page-level connections observed=${websocketEvents.length}; Dedicated Worker WebSocket activity is not visible to this interception stack`);
    record('WebTransport egress monitoring', observedWebTransport === 'NOT_AVAILABLE' ? 'NOT_AVAILABLE' : 'UNMEASURED',
      observedWebTransport === 'NOT_AVAILABLE' ? 'WebTransport API absent in this Chromium runtime.' : 'The interception stack cannot observe WebTransport datagrams/streams.');

    const cspSource = fs.readFileSync(path.resolve('apps/web/public/_headers'), 'utf8');
    let currentCspPath = '';
    const appUnsafeEvalRules = [];
    for (const line of cspSource.split(/\r?\n/)) {
      if (line.trim() && !/^\s/.test(line)) currentCspPath = line.trim();
      const policy = line.match(/^\s*Content-Security-Policy:\s*(.*)$/i)?.[1];
      if (policy && /(?<!wasm-)unsafe-eval/.test(policy)) appUnsafeEvalRules.push({ path: currentCspPath, policy });
    }
    const unsafeEvalCount = (cspSource.match(/(?<!wasm-)unsafe-eval/g) || []).length;
    const noOtherUnsafeCspTokens = !/(?<!wasm-)unsafe-(?!eval)/.test(cspSource);
    const allAppCspRulesStrict = appUnsafeEvalRules.length === 1 && appUnsafeEvalRules[0].path === '/assets/webr/webr-worker.js' && unsafeEvalCount === 1 && /script-src[^;]*'unsafe-eval'/.test(appUnsafeEvalRules[0].policy);
    const pageCspStrict = pageCsp && !/(?<!wasm-)unsafe-/.test(pageCsp);
    record('Built application CSP has one evidence-backed WebR exception', allAppCspRulesStrict && noOtherUnsafeCspTokens && pageCspStrict && strictWebrBlockedByEmscripten ? 'PASS' : 'FAIL',
      `page and all WebR assets remain strict; exact exception paths=${appUnsafeEvalRules.map(rule => rule.path).join(',') || 'none'}; strict runtime failure verified=${strictWebrBlockedByEmscripten}`);

    await page.close();
    const cleanupPage = await context.newPage();
    await cleanupPage.goto(`${ORIGIN}/en/demo/`, { waitUntil: 'domcontentloaded' });
    const afterCleanup = await storageScan(cleanupPage, context, 'after_worker_lifecycle_cleanup');
    record('Storage inspection after Worker/page lifecycle cleanup', afterCleanup.errors.length === 0 && afterCleanup.matches.length === 0 ? 'PASS' : 'FAIL',
      `errors=${afterCleanup.errors.length}; sentinel matches=${afterCleanup.matches.length}`);

    const evidence = {
      suite: 'CP-WEBR-02B E1 Chromium and static-app qualification',
      generatedAt: new Date().toISOString(),
      commitSha: commitSha(),
      browser: { engine: 'Chromium', product: executablePath ? path.basename(executablePath) : 'Playwright-managed Chromium', version: browser.version(), pageIsolation, webTransport: observedWebTransport },
      results,
      runtime: { productionChannel: channel || null, productionCancellation: productionCancel, productionEvents: productionEvents.messages.map(({ type, id, targetJobId, code, nativeErrorName, nativeErrorCode, runtime }) => ({ type, id, targetJobId, code, nativeErrorName, nativeErrorCode, runtime })) },
      csp: {
        pagePolicy: pageCsp,
        productionWorker: productionCspWorker,
        nestedWebrWorker: nestedWebrCsp,
        strictNestedWebrWorker: strictNestedWebrCsp,
        strictEvalControl: strictEval,
        strictRuntimeAttempt: strictWebrProbe,
        exception: { path: '/assets/webr/webr-worker.js', directive: 'script-src unsafe-eval', reason: 'Strict runtime emitted ASM_CONSTS[code] is not a function and WebR initialization did not complete; browser control applies this exception only to the nested WebR Worker script.' }
      },
      network: {
        monitoring: 'MEASURED_FOR_HTTP_FETCH_XHR_SCRIPT_AND_DEDICATED_WORKER_REQUESTS',
        nominal: nominalNetwork,
        requests: appPhaseNetwork.map(({ phase: requestPhase, method, url, resourceType, sameOrigin, approvedStatic, bodyPresent, bodyByteLength, decision }) => ({ phase: requestPhase, method, url, resourceType, sameOrigin, approvedStatic, bodyPresent, bodyByteLength, decision })),
        pageAndWorkerPositiveControl: { detected: pageAndWorkerControlDetected, blockedEntries: controlUnauthorized, permittedControlVerdict: 'FAIL' },
        websocket: { status: 'MEASURED_PAGE_ONLY', events: websocketEvents },
        dedicatedWorkerWebsocket: 'UNMEASURED',
        webTransport: observedWebTransport
      },
      storage: {
        checks: storageEvidence,
        ordinaryStaticAssetHttpCache: 'NOT_INSPECTED_AS_ROW_STORAGE; network responses are static GET assets only',
        serviceWorkerEvents
      },
      limitations: ['Dedicated Worker WebSocket use is unmeasured.', 'WebTransport is unmeasured when available.', 'Non-Chromium qualification is not completed.'],
      diagnostics: browserDiagnostics,
      verdict: results.some(result => result.status === 'FAIL') ? 'FAIL' : 'PASS'
    };
    fs.mkdirSync(path.dirname(EVIDENCE_FILE), { recursive: true });
    fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(evidence, null, 2) + '\n');
    console.log(`\nBrowser evidence written: ${EVIDENCE_FILE}`);
    if (evidence.verdict === 'FAIL') process.exitCode = 1;
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await new Promise(resolve => serverInfo.server.close(resolve));
  }
}

main().catch(error => {
  console.error('Chromium qualification failed:', error);
  const failedEvidence = {
    suite: 'CP-WEBR-02B E1 Chromium and static-app qualification',
    generatedAt: new Date().toISOString(),
    commitSha: commitSha(),
    browser: { engine: 'Chromium', product: null, version: null },
    results: [...results, { name: `Browser suite exception during ${phase}`, status: 'FAIL', detail: String(error?.stack || error) }],
    diagnostics: browserDiagnostics,
    network: { status: 'UNMEASURED' },
    storage: { status: 'UNMEASURED' },
    limitations: ['Browser suite terminated before all mandatory checks completed.'],
    verdict: 'FAIL'
  };
  try {
    fs.mkdirSync(path.dirname(EVIDENCE_FILE), { recursive: true });
    fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(failedEvidence, null, 2) + '\n');
    console.error(`Failure evidence written: ${EVIDENCE_FILE}`);
  } catch (writeError) {
    console.error('Could not write browser failure evidence:', writeError);
  }
  process.exitCode = 1;
});
