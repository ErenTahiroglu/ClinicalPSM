import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { chromium } from '@playwright/test';
import { verifyEnvelope } from '../../src/lib/webr/canonical_serializer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicRoot = path.join(root, 'apps/web/public');
const fixtureRoot = path.join(root, 'experiments/cp-webr-02a/fixtures');
const manifestPath = path.join(fixtureRoot, 'fixtures_manifest.json');
const fixtureIntegrityPath = path.join(root, 'experiments/cp-webr-02-closure/fixture-integrity.json');
const workerSourcePath = path.join(root, 'src/worker/webr-worker.ts');
const workerBundlePath = path.join(publicRoot, 'assets/webr-worker.js');
const templatePath = path.join(root, 'experiments/cp-webr-02a/adapter/r_template.R');
const expectedTemplate = '7989403c7d093031b93a9c971a6d4f055101bab83c0ec4417fc52e4dceee24a4';

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function outputArguments() {
  const args = process.argv.slice(2);
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!['--output', '--browser-executable'].includes(args[index]) || !args[index + 1]) {
      throw new Error('Usage: node worker_fixture_runner.mjs --output <new-results-json-path> [--browser-executable <path>]');
    }
    values[args[index].slice(2)] = args[index + 1];
  }
  if (!values.output) throw new Error('Usage: node worker_fixture_runner.mjs --output <new-results-json-path> [--browser-executable <path>]');
  const destination = path.resolve(values.output);
  if (fs.existsSync(destination)) throw new Error(`Refusing to overwrite existing browser evidence: ${destination}`);
  return { destination, browserExecutable: values['browser-executable'] ? path.resolve(values['browser-executable']) : null };
}
function parseHeaders() {
  const lines = fs.readFileSync(path.join(publicRoot, '_headers'), 'utf8').split(/\r?\n/);
  const rules = [];
  let current;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) { current = { pattern: line.trim(), headers: {} }; rules.push(current); }
    else {
      const match = line.trim().match(/^([^:]+):\s*(.*)$/);
      if (match) current.headers[match[1].toLowerCase()] = match[2];
    }
  }
  return rules;
}
function mime(file) {
  if (file.endsWith('.wasm')) return 'application/wasm';
  if (/\.(?:mjs|js)$/.test(file)) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (/\.(?:tgz|gz|tar)$/.test(file)) return 'application/gzip';
  if (file.endsWith('.so')) return 'application/octet-stream';
  return 'text/plain; charset=utf-8';
}
function staticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const resolved = path.resolve(publicRoot, `.${decoded === '/' ? '/index.html' : decoded}`);
  return resolved.startsWith(`${publicRoot}${path.sep}`) ? resolved : null;
}
function routeMatches(pattern, pathname) {
  return pattern.endsWith('*') ? pathname.startsWith(pattern.slice(0, -1)) : pathname === pattern;
}
function makeServer(positivePath, workerProbePath) {
  const rules = parseHeaders();
  const cspObservations = [];
  const requestObservations = [];
  let origin;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = decodeURIComponent(url.pathname);
    requestObservations.push({ method: req.method, url: `${url.origin}${url.pathname}`, origin: url.origin, path: url.pathname,
      bodyPresent: Number(req.headers['content-length'] || 0) > 0 || Boolean(req.headers['transfer-encoding']) });
    if (pathname === positivePath) {
      const bodyPresent = Number(req.headers['content-length'] || 0) > 0;
      req.resume();
      res.writeHead(204, { 'x-closure-body-present': String(bodyPresent) });
      res.end();
      return;
    }
    if (pathname === workerProbePath) {
      const source = "self.onmessage=async event=>{try{const response=await fetch(event.data,{method:'POST',body:'SYNTHETIC_WORKER_EGRESS_CANARY'});self.postMessage({status:response.status,bodyPresent:response.headers.get('x-closure-body-present')==='true'});}catch(error){self.postMessage({error:String(error)});}};";
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'content-length': Buffer.byteLength(source), 'cache-control': 'no-store',
        'cross-origin-embedder-policy': 'require-corp', 'cross-origin-resource-policy': 'same-origin' });
      res.end(source);
      return;
    }
    let file = staticPath(pathname);
    if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      file = path.join(publicRoot, '404.html');
      res.statusCode = 404;
    }
    for (const rule of rules) {
      if (!routeMatches(rule.pattern, pathname)) continue;
      for (const [name, value] of Object.entries(rule.headers)) {
        if (name.startsWith('! ')) res.removeHeader(name.slice(2));
        else res.setHeader(name, value);
      }
    }
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (/\/assets\/webr(?:\/|$)/.test(pathname)) res.setHeader('Cache-Control', 'no-store');
    res.setHeader('content-type', mime(file));
    res.setHeader('content-length', fs.statSync(file).size);
    if (pathname === '/assets/webr-worker.js' || pathname === '/assets/webr/webr-worker.js') {
      cspObservations.push({ url: `${origin}${pathname}`, policy: res.getHeader('content-security-policy') || null });
    }
    fs.createReadStream(file).pipe(res);
  });
  return { server, cspObservations, requestObservations, setOrigin(value) { origin = value; } };
}

function parseCsv(filePath) {
  const csv = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(csv, { header: true, dynamicTyping: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(`${path.basename(filePath)} CSV parse failed: ${JSON.stringify(parsed.errors)}`);
  return { csv, headers: parsed.meta.fields, rows: parsed.data };
}
function asNonEmptyTrimmed(value) {
  return typeof value === 'string' ? value.trim().length > 0 && value !== 'NA' : value !== null && value !== undefined;
}
function buildDataset(spec) {
  const id = spec.id;
  const csvPath = path.join(fixtureRoot, `${id}.csv`);
  const configPath = path.join(fixtureRoot, `${id}.json`);
  const { csv, headers, rows } = parseCsv(csvPath);
  const configText = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configText);
  const formula = String(config.formula);
  const [treatmentVariable, rhs] = formula.split('~').map(x => x.trim());
  const covariates = rhs.split('+').map(x => x.trim());
  const refs = config.extra_meta?.factor_ref || {};
  const definitions = {};
  for (const variable of covariates) {
    const values = rows.map(row => row[variable]);
    if ((id === 'fix_02_mixed_types' || id === 'fix_03_ref_level_change') && variable === 'x_cat') {
      definitions[variable] = {
        originalHeader: variable,
        inferredType: 'categorical',
        levels: ['low', 'med', 'high'],
        referenceLevel: refs[variable] || (id === 'fix_03_ref_level_change' ? 'med' : 'low')
      };
    } else if (id === 'fix_20_malformed_category' && variable === 'cat_var') {
      definitions[variable] = {
        originalHeader: variable,
        inferredType: 'categorical',
        levels: ['ValidGroupA', 'ValidGroupB'],
        referenceLevel: 'ValidGroupA'
      };
    } else if (variable === 'x_bin' || variable === 'bin_cov') {
      definitions[variable] = { originalHeader: variable, inferredType: 'binary' };
    } else if (values.filter(asNonEmptyTrimmed).every(value => typeof value === 'number' && Number.isFinite(value))) {
      definitions[variable] = { originalHeader: variable, inferredType: 'continuous' };
    } else {
      const nonMissing = values.filter(asNonEmptyTrimmed);
      const levels = [...new Set(nonMissing.map(String))].sort((a, b) => a.localeCompare(b, 'en'));
      const referenceLevel = refs[variable] ?? levels[0] ?? '';
      definitions[variable] = { originalHeader: variable, inferredType: 'categorical', levels, referenceLevel };
    }
  }
  return {
    input: {
      datasetId: id,
      headers,
      rows,
      treatmentVariable,
      covariates,
      covariateDefinitions: definitions,
      options: {
        method: config.method,
        distanceMetric: config.link,
        ratio: config.ratio,
        replace: config.replace,
        matchingOrder: config.m_order,
        caliper: typeof config.caliper === 'number' ? config.caliper : null,
        stdCaliper: config.std_caliper,
        discard: config.discard
      }
    },
    inputEvidence: {
      id,
      csv_sha256: sha256(csv),
      config_sha256: sha256(configText),
      row_ids: rows.map(row => String(row.id).trim()),
      expected_manifest_status: spec.expected_status,
      dataset_schema: 'ClinicalPSM DatasetInput; exact production adapter shape',
      covariate_definitions: definitions
    }
  };
}

async function startServer() {
  const positivePath = `/__closure__/positive-egress/${crypto.randomUUID()}`;
  const workerProbePath = `/__closure__/worker-egress-probe/${crypto.randomUUID()}.js`;
  const wrapped = makeServer(positivePath, workerProbePath);
  await new Promise((resolve, reject) => {
    wrapped.server.once('error', reject);
    wrapped.server.listen(0, '127.0.0.1', resolve);
  });
  const address = wrapped.server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  wrapped.setOrigin(origin);
  return { ...wrapped, origin, positivePath, workerProbePath, close: () => new Promise(resolve => wrapped.server.close(resolve)) };
}

async function main() {
  const { destination, browserExecutable } = outputArguments();
  if (!fs.existsSync(path.join(publicRoot, '_headers')) || !fs.existsSync(workerBundlePath)) {
    throw new Error('Built static app and actual production Worker are required; run npm run build first');
  }
  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  const fixtureIntegrityBytes = fs.readFileSync(fixtureIntegrityPath);
  const fixtureIntegrity = JSON.parse(fixtureIntegrityBytes.toString('utf8'));
  if (manifest.fixture_count !== 25 || manifest.fixtures.length !== 25) throw new Error('Preserved manifest must contain exactly 25 entries');
  if (sha256(Buffer.from(manifestText)) !== fixtureIntegrity.manifest_sha256 || fixtureIntegrity.fixtures.length !== 25) throw new Error('Preserved fixture integrity pin does not match manifest');
  const templateHash = sha256(fs.readFileSync(templatePath));
  if (templateHash !== expectedTemplate) throw new Error(`Frozen R template digest mismatch: ${templateHash}`);

  const datasets = manifest.fixtures.map(buildDataset);
  for (const dataset of datasets) {
    const pin = fixtureIntegrity.fixtures.find(item => item.id === dataset.inputEvidence.id);
    if (!pin || pin.csv_sha256 !== dataset.inputEvidence.csv_sha256 || pin.config_sha256 !== dataset.inputEvidence.config_sha256) {
      throw new Error(`Frozen fixture input hash mismatch: ${dataset.inputEvidence.id}`);
    }
  }
  const networkEvents = [];
  const server = await startServer();
  let browser;
  let browserVersion;
  let browserContext;
  let page;
  let init;
  let workerResults;
  let storageAfter;
  let positiveControl;
  try {
    const executablePath = browserExecutable || process.env.CHROMIUM_PATH || process.env.BROWSER_PATH;
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    browserVersion = browser.version();
    browserContext = await browser.newContext({ serviceWorkers: 'block' });
    await browserContext.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const positive = url.origin === server.origin && url.pathname === server.positivePath;
      const approvedOrigin = url.origin === server.origin;
      const approvedMethod = method === 'GET' || method === 'HEAD';
      const approvedPath = approvedOrigin && (url.pathname === '/' || url.pathname.startsWith('/assets/') ||
        url.pathname === '/favicon.ico' || url.pathname === '/robots.txt' || url.pathname.startsWith('/.well-known/'));
      const bodyPresent = (request.postDataBuffer()?.byteLength || 0) > 0;
      const allowedByStaticPolicy = approvedMethod && approvedPath;
      networkEvents.push({
        context: 'nominal-production-worker',
        method,
        url: request.url(),
        origin: url.origin,
        path: url.pathname,
        bodyPresent,
        allowedByStaticPolicy,
        action: positive ? 'positive-control-permitted' : allowedByStaticPolicy ? 'static-asset-permitted' : 'unauthorized-blocked'
      });
      if (allowedByStaticPolicy || positive) return route.continue();
      return route.abort('blockedbyclient');
    });
    page = await browserContext.newPage();
    await page.goto(`${server.origin}/`, { waitUntil: 'domcontentloaded' });
    const execution = await page.evaluate(async inputs => {
      const worker = new Worker('/assets/webr-worker.js', { type: 'module', name: 'cp-webr-02-closure-production-worker' });
      const timeout = ms => new Promise((_, reject) => setTimeout(() => reject(new Error(`Worker message timeout after ${ms}ms`)), ms));
      const awaitMessage = (predicate, ms = 1200000) => Promise.race([
        new Promise((resolve, reject) => {
          const onMessage = event => {
            if (!predicate(event.data)) return;
            worker.removeEventListener('message', onMessage);
            resolve(event.data);
          };
          worker.addEventListener('message', onMessage);
          worker.addEventListener('error', event => reject(new Error(`Production Worker error: ${event.message}`)), { once: true });
          worker.addEventListener('messageerror', () => reject(new Error('Production Worker messageerror')), { once: true });
        }), timeout(ms)
      ]);
      const pageIsolation = {
        crossOriginIsolated: self.crossOriginIsolated,
        sharedArrayBufferAvailable: typeof SharedArrayBuffer !== 'undefined',
        origin: location.origin
      };
      const rowIdSentinels = [...new Set(inputs.flatMap(item => item.inputEvidence.row_ids))];
      const inspectStorage = async () => {
        const matchedSources = new Set();
        let rowIdMatchCount = 0;
        const scanValue = (source, value, seen = new WeakSet()) => {
          if (typeof value === 'string') {
            if (rowIdSentinels.some(sentinel => value.includes(sentinel))) {
              rowIdMatchCount++;
              matchedSources.add(source);
            }
            return;
          }
          if (!value || typeof value !== 'object' || seen.has(value)) return;
          seen.add(value);
          if (ArrayBuffer.isView(value)) {
            scanValue(source, new TextDecoder().decode(value));
            return;
          }
          if (value instanceof ArrayBuffer) {
            scanValue(source, new TextDecoder().decode(value));
            return;
          }
          for (const [key, item] of Object.entries(value)) {
            scanValue(`${source}.key`, key, seen);
            scanValue(source, item, seen);
          }
        };
        for (let index = 0; index < localStorage.length; index++) {
          const key = localStorage.key(index);
          scanValue('localStorage.key', key);
          scanValue('localStorage.value', localStorage.getItem(key));
        }
        for (let index = 0; index < sessionStorage.length; index++) {
          const key = sessionStorage.key(index);
          scanValue('sessionStorage.key', key);
          scanValue('sessionStorage.value', sessionStorage.getItem(key));
        }
        scanValue('cookies', document.cookie);
        const databases = indexedDB.databases ? await indexedDB.databases() : null;
        let indexedDbRecordsScanned = 0;
        if (databases) {
          for (const info of databases) {
            if (!info.name) continue;
            const db = await new Promise((resolve, reject) => {
              const request = indexedDB.open(info.name);
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error || new Error(`IndexedDB open failed: ${info.name}`));
              request.onblocked = () => reject(new Error(`IndexedDB open blocked: ${info.name}`));
            });
            for (const storeName of Array.from(db.objectStoreNames)) {
              await new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readonly');
                const request = tx.objectStore(storeName).openCursor();
                request.onsuccess = () => {
                  const cursor = request.result;
                  if (!cursor) { resolve(); return; }
                  indexedDbRecordsScanned++;
                  scanValue(`indexedDB:${info.name}.${storeName}.key`, cursor.primaryKey);
                  scanValue(`indexedDB:${info.name}.${storeName}.value`, cursor.value);
                  cursor.continue();
                };
                request.onerror = () => reject(request.error || new Error(`IndexedDB cursor failed: ${info.name}.${storeName}`));
                tx.onerror = () => reject(tx.error || new Error(`IndexedDB transaction failed: ${info.name}.${storeName}`));
              });
            }
            db.close();
          }
        }
        const registrations = await navigator.serviceWorker?.getRegistrations?.() || [];
        return {
          localStorageKeys: Object.keys(localStorage),
          sessionStorageKeys: Object.keys(sessionStorage),
          cookieNames: document.cookie.split(';').map(value => value.split('=')[0].trim()).filter(Boolean),
          indexedDbNames: databases?.map(item => item.name) ?? null,
          indexedDbRecordsScanned,
          rowIdSentinelCount: rowIdSentinels.length,
          rowIdMatchCount,
          rowIdMatchedSources: [...matchedSources],
          cacheStorageNames: await caches.keys(),
          cacheStorageRowContent: 'UNMEASURED_HERE; E1 runtime scanner performs positive-control content inspection; static HTTP asset caching is not clinical-row storage evidence',
          serviceWorkerRegistrations: registrations.map(registration => registration.scope)
        };
      };
      const storageBeforeInitialization = await inspectStorage();
      worker.postMessage({
        type: 'INIT', id: 'closure-init',
        payload: { baseUrl: '/assets/webr/', repoUrl: '/assets/repo', templateUrl: '/assets/webr/r_template.R' }
      });
      const initializedMessage = await awaitMessage(message => message.id === 'closure-init' && ['INIT_COMPLETE', 'ERROR'].includes(message.type));
      if (initializedMessage.type !== 'INIT_COMPLETE' || initializedMessage.payload?.success !== true) {
        worker.terminate();
        throw new Error(`Production Worker init failed: ${JSON.stringify(initializedMessage)}`);
      }
      const results = [];
      for (let index = 0; index < inputs.length; index++) {
        const { input, inputEvidence } = inputs[index];
        const id = inputEvidence.id;
        const jobId = `closure-${String(index + 1).padStart(2, '0')}-${id}`;
        worker.postMessage({ type: 'RUN_ANALYSIS', id: jobId, payload: input });
        const message = await awaitMessage(candidate => candidate.id === jobId && ['ANALYSIS_COMPLETE', 'ERROR'].includes(candidate.type));
        if (message.type === 'ANALYSIS_COMPLETE') {
          results.push({
            id,
            manifest_expected_status: inputEvidence.expected_manifest_status,
            worker_message_type: message.type,
            worker_error: null,
            envelope: message.payload,
            execution_path: 'chromium-built-static-app-production-dedicated-worker',
            worker_script_url: '/assets/webr-worker.js',
            input_evidence: inputEvidence
          });
        } else {
          results.push({
            id,
            manifest_expected_status: inputEvidence.expected_manifest_status,
            worker_message_type: message.type,
            worker_error: { code: message.code || null, error: message.error || null, targetJobId: message.targetJobId || null },
            envelope: null,
            execution_path: 'chromium-built-static-app-production-dedicated-worker',
            worker_script_url: '/assets/webr-worker.js',
            input_evidence: inputEvidence
          });
        }
      }
      worker.terminate();
      return { pageIsolation, init: initializedMessage.payload, fixtureResults: results,
        storageBeforeInitialization, storageAfterFixtures: await inspectStorage() };
    }, datasets);
    init = { ...execution.init, pageIsolation: execution.pageIsolation };
    workerResults = execution.fixtureResults;
    storageAfter = { beforeInitialization: execution.storageBeforeInitialization, afterAllFixtures: execution.storageAfterFixtures };
    for (const result of workerResults) {
      if (result.worker_message_type !== 'ANALYSIS_COMPLETE') continue;
      result.envelope_verification = await verifyEnvelope(result.envelope);
      if (result.envelope_verification.valid !== true) throw new Error(`Production Worker result envelope invalid for ${result.id}: ${result.envelope_verification.reason}`);
    }

    const positiveContext = await browser.newContext({ serviceWorkers: 'block' });
    await positiveContext.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const isPositiveEgress = url.origin === server.origin && url.pathname === server.positivePath && method === 'POST';
      const staticSetup = url.origin === server.origin && ['GET', 'HEAD'].includes(method) &&
        (url.pathname === '/' || url.pathname.startsWith('/assets/') || url.pathname === server.workerProbePath);
      const bodyPresent = (request.postDataBuffer()?.byteLength || 0) > 0;
      networkEvents.push({ context: 'unauthorized-egress-positive-control', method, url: request.url(), origin: url.origin,
        path: url.pathname, requestSource: url.searchParams.get('source') || 'page', bodyPresent, allowedByStaticPolicy: staticSetup,
        action: isPositiveEgress ? 'positive-control-permitted' : staticSetup ? 'static-asset-permitted' : 'unauthorized-blocked' });
      if (isPositiveEgress || staticSetup) return route.continue();
      return route.abort('blockedbyclient');
    });
    const positivePage = await positiveContext.newPage();
    const positiveDiagnostics = { console: [], failedRequests: [], policyViolations: [] };
    positivePage.on('console', message => positiveDiagnostics.console.push({ type: message.type(), text: message.text() }));
    positivePage.on('requestfailed', request => positiveDiagnostics.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || null }));
    await positivePage.addInitScript(() => addEventListener('securitypolicyviolation', event => {
      (window.__cpWebrPolicyViolations ||= []).push({ directive: event.violatedDirective, blockedURI: event.blockedURI });
    }));
    await positivePage.goto(`${server.origin}/`, { waitUntil: 'domcontentloaded' });
    const probeResponse = await positivePage.evaluate(async positivePath => {
      const response = await fetch(positivePath, { method: 'POST', body: 'SYNTHETIC_EGRESS_CANARY' });
      return { status: response.status, bodyPresent: response.headers.get('x-closure-body-present') === 'true' };
    }, server.positivePath);
    const workerProbeResponse = await positivePage.evaluate(async ({ positivePath, workerProbePath }) => new Promise((resolve, reject) => {
      const worker = new Worker(workerProbePath, { name: 'cp-webr-02-closure-egress-positive-control' });
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Dedicated Worker egress positive control timed out')); }, 10000);
      worker.onmessage = event => {
        clearTimeout(timer);
        worker.terminate();
        if (event.data?.error) reject(new Error(event.data.error));
        else resolve(event.data);
      };
      worker.onerror = event => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(`${event.message || 'Dedicated Worker egress positive control failed'} (${event.filename || 'unknown worker'}:${event.lineno || 0}); ${JSON.stringify({ positiveDiagnostics, events: networkEvents.filter(item => item.context === 'unauthorized-egress-positive-control'), requests: server.requestObservations.slice(-8) })}`));
      };
      worker.postMessage(`${positivePath}?source=worker`);
    }), { positivePath: server.positivePath, workerProbePath: `${server.origin}${server.workerProbePath}` });
    positiveDiagnostics.policyViolations = await positivePage.evaluate(() => window.__cpWebrPolicyViolations || []);
    await positivePage.waitForTimeout(100);
    const positivePageRequest = networkEvents.find(event => event.context === 'unauthorized-egress-positive-control' &&
      event.method === 'POST' && event.path === server.positivePath && event.requestSource === 'page');
    const positiveWorkerRequest = networkEvents.find(event => event.context === 'unauthorized-egress-positive-control' &&
      event.method === 'POST' && event.path === server.positivePath && event.requestSource === 'worker');
    positiveControl = {
      requestDetected: Boolean(positivePageRequest) && Boolean(positiveWorkerRequest),
      pageRequestPermitted: probeResponse.status === 204,
      bodyPresenceObserved: probeResponse.bodyPresent,
      pageMonitorGatePassesWhenPermitted: !positivePageRequest,
      workerRequestDetected: Boolean(positiveWorkerRequest),
      workerRequestPermitted: workerProbeResponse.status === 204,
      workerBodyPresenceObserved: workerProbeResponse.bodyPresent === true && positiveWorkerRequest?.bodyPresent === true,
      workerMonitorGatePassesWhenPermitted: !positiveWorkerRequest,
      workerRequestMonitoring: positiveWorkerRequest && workerProbeResponse.status === 204 &&
        workerProbeResponse.bodyPresent === true && positiveWorkerRequest.bodyPresent === true ? 'MEASURED' : 'UNMEASURED'
    };
    await positiveContext.close();
  } finally {
    await browserContext?.close();
    await browser?.close();
    await server.close();
  }

  const nominalEvents = networkEvents.filter(event => event.context === 'nominal-production-worker');
  const unexpectedNominal = nominalEvents.filter(event => event.action === 'unauthorized-blocked' || event.action === 'positive-control-permitted');
  const nestedWorkerRequestObserved = server.cspObservations.some(item => new URL(item.url).pathname === '/assets/webr/webr-worker.js');
  const nestedWorkerRequestIntercepted = nominalEvents.some(event => event.path === '/assets/webr/webr-worker.js');
  const evidence = {
    schema_version: 1,
    evidence_class: 'CHROMIUM_PRODUCTION_WORKER_FIXTURE_EXECUTION',
    status: 'EXECUTED_PENDING_NATIVE_COMPARISON',
    commit_sha: process.env.GITHUB_SHA || 'LOCAL_UNCOMMITTED',
    browser: { engine: 'Chromium', version: browserVersion, headless: true },
    execution: {
      path: 'Chromium page -> built /assets/webr-worker.js Dedicated Worker -> production WebR adapter imports',
      worker_source_sha256: sha256(fs.readFileSync(workerSourcePath)),
      worker_bundle_sha256: sha256(fs.readFileSync(workerBundlePath)),
      worker_script_url: '/assets/webr-worker.js',
      legacy_worker_absent: !fs.existsSync(path.join(publicRoot, 'assets/psm-worker.js')),
      app_static_build: true,
      worker_reused_sequentially: true,
      fixture_count: workerResults.length,
      no_direct_node_adapter_results: true
    },
    provenance: {
      fixture_manifest_sha256: sha256(fs.readFileSync(manifestPath)),
      fixture_integrity_sha256: sha256(fixtureIntegrityBytes),
      template_sha256: templateHash,
      source_fixture_inputs: workerResults.map(result => result.input_evidence)
    },
    runtime: {
      init,
      nested_webr_worker_request_observed: nestedWorkerRequestObserved,
      nested_webr_worker_initialization_observed: nestedWorkerRequestObserved && init.success === true && init.adapterReady === true,
      nested_webr_worker_target_observed: null,
      nested_webr_worker_network_interception_observed: nestedWorkerRequestIntercepted,
      csp_responses: server.cspObservations,
      same_origin_server_request_metadata: server.requestObservations,
      page_and_worker_route_event_count: nominalEvents.length,
      nested_worker_http_requests_intercepted: nestedWorkerRequestIntercepted
    },
    network_privacy: {
      nominal_request_count: nominalEvents.length,
      route_observed_unauthorized_count: unexpectedNominal.length,
      nominal_unauthorized_count: nestedWorkerRequestIntercepted ? unexpectedNominal.length : null,
      monitoring_status: nestedWorkerRequestIntercepted && positiveControl.requestDetected ? 'MEASURED' : 'UNMEASURED',
      unmeasured_channels: [
      ...(!nestedWorkerRequestIntercepted ? ['Nested WebR Dedicated Worker HTTP request interception'] : []),
        'WebSocket', 'WebTransport'
      ],
      body_data_persisted: false,
      events: networkEvents,
      unauthorized_egress_positive_control: positiveControl,
      websocket: 'UNMEASURED',
      webtransport: 'UNMEASURED'
    },
    storage_after_all_fixtures: storageAfter,
    fixtures: workerResults
  };
  if (workerResults.length !== 25) throw new Error(`Expected 25 production Worker executions, got ${workerResults.length}`);
  const invalidEnvelopes = workerResults.filter(result => result.worker_message_type === 'ANALYSIS_COMPLETE' && result.envelope_verification?.valid !== true);
  if (invalidEnvelopes.length) throw new Error(`Production Worker emitted ${invalidEnvelopes.length} invalid canonical envelopes`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  console.log(`Production Worker evidence: ${destination}`);
  console.log(`Chromium ${browserVersion} executed ${workerResults.length} manifest fixtures through ${evidence.execution.worker_script_url}`);
  console.log(`Nominal intercepted requests=${nominalEvents.length}; route-detected unexpected=${unexpectedNominal.length}; nested Worker interception=${nestedWorkerRequestIntercepted ? 'observed' : 'UNMEASURED'}; positive-control gate fails=${positiveControl.requestDetected && !positiveControl.monitorGatePassesWhenPermitted}`);
}

main().catch(error => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
