import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const forensics = path.join(root, 'experiments/cp-webr-02-closure/forensics');
const publicRoot = path.join(root, 'apps/web/public');
const fixtureRoot = path.join(root, 'experiments/cp-webr-02a/fixtures');
const integrityPath = path.join(root, 'experiments/cp-webr-02-closure/fixture-integrity.json');
const lockPath = path.join(root, 'experiments/cp-webr-00b/dependency-lock.json');

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function parseArgs(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--output', '--chromium-executable'].includes(key) || !args[i + 1]) throw new Error('Usage: run_webr_covariance.mjs --output <new-json> [--chromium-executable <path>]');
    values[key.slice(2)] = args[i + 1];
  }
  if (!values.output) throw new Error('Usage: run_webr_covariance.mjs --output <new-json> [--chromium-executable <path>]');
  const destination = path.resolve(values.output);
  if (fs.existsSync(destination)) throw new Error(`Refusing to overwrite existing diagnostic evidence: ${destination}`);
  return { destination, executable: values['chromium-executable'] ? path.resolve(values['chromium-executable']) : undefined };
}
function parseHeaders() {
  const rules = [];
  let current;
  for (const line of fs.readFileSync(path.join(publicRoot, '_headers'), 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) { current = { pattern: line.trim(), headers: {} }; rules.push(current); }
    else {
      const match = line.trim().match(/^([^:]+):\s*(.*)$/);
      if (match) current.headers[match[1].toLowerCase()] = match[2];
    }
  }
  return rules;
}
function matches(pattern, pathname) { return pattern.endsWith('*') ? pathname.startsWith(pattern.slice(0, -1)) : pathname === pattern; }
function mime(file) {
  if (file.endsWith('.wasm')) return 'application/wasm';
  if (/\.(?:mjs|js)$/.test(file)) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (/\.(?:so|data)$/.test(file)) return 'application/octet-stream';
  return 'text/plain; charset=utf-8';
}
function staticFile(pathname) {
  const full = path.resolve(publicRoot, `.${decodeURIComponent(pathname)}`);
  if (!full.startsWith(`${publicRoot}${path.sep}`)) return null;
  return full;
}
function createServer() {
  const rules = parseHeaders();
  const observations = [];
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = requestUrl.pathname;
    observations.push({ method: req.method, pathname, origin: requestUrl.origin, body_present: Number(req.headers['content-length'] || 0) > 0 || Boolean(req.headers['transfer-encoding']) });
    let file;
    if (pathname === '/__e2_diagnostic_worker.js') file = path.join(forensics, 'webr_covariance_worker.js');
    else if (pathname === '/en/__e2_diagnostic.html') file = path.join(forensics, 'diagnostic.html');
    else file = staticFile(pathname === '/' ? '/index.html' : pathname);
    if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return;
    }
    for (const rule of rules) {
      if (!matches(rule.pattern, pathname)) continue;
      for (const [name, value] of Object.entries(rule.headers)) {
        if (name.startsWith('! ')) res.removeHeader(name.slice(2));
        else res.setHeader(name, value);
      }
    }
    res.setHeader('cross-origin-opener-policy', 'same-origin');
    res.setHeader('cross-origin-embedder-policy', 'require-corp');
    res.setHeader('cross-origin-resource-policy', 'same-origin');
    res.setHeader('content-type', mime(file));
    res.setHeader('content-length', fs.statSync(file).size);
    fs.createReadStream(file).pipe(res);
  });
  return { server, observations };
}

async function main() {
  const { destination, executable } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(path.join(publicRoot, 'assets/webr/webr.js'))) throw new Error('Build the static application first; missing apps/web/public/assets/webr/webr.js');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const webrVersion = lock.runtime.webr_npm;
  if (webrVersion !== '0.6.0') throw new Error(`Expected pinned WebR 0.6.0, found ${webrVersion}`);
  const integrity = JSON.parse(fs.readFileSync(integrityPath, 'utf8'));
  const fixtures = [];
  for (const id of ['fix_15_quasi_separation', 'fix_16_complete_separation']) {
    const csvPath = path.join(fixtureRoot, `${id}.csv`);
    const configPath = path.join(fixtureRoot, `${id}.json`);
    const csvBytes = fs.readFileSync(csvPath);
    const configBytes = fs.readFileSync(configPath);
    const pin = integrity.fixtures.find(entry => entry.id === id);
    if (!pin || sha256(csvBytes) !== pin.csv_sha256 || sha256(configBytes) !== pin.config_sha256) throw new Error(`Frozen fixture hash mismatch: ${id}`);
    const config = JSON.parse(configBytes.toString('utf8'));
    fixtures.push({ id, csv: csvBytes.toString('utf8'), formula: config.formula, csv_sha256: pin.csv_sha256, config_sha256: pin.config_sha256 });
  }
  const server = createServer();
  await new Promise(resolve => server.server.listen(0, '127.0.0.1', resolve));
  const address = server.server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true, ...(executable ? { executablePath: executable } : {}) });
  const runs = [];
  const consoleErrors = [];
  try {
    for (const replicate of [1, 2]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on('pageerror', error => consoleErrors.push({ replicate, message: String(error) }));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push({ replicate, message: message.text() }); });
      await page.goto(`${origin}/en/__e2_diagnostic.html`, { waitUntil: 'domcontentloaded' });
      const result = await page.evaluate(async ({ fixtures, replicate, webrVersion }) => {
        return await new Promise((resolve, reject) => {
          const worker = new Worker('/__e2_diagnostic_worker.js', { type: 'module', name: `closure-e2-shadow-${replicate}` });
          const timeout = setTimeout(() => { worker.terminate(); reject(new Error(`WebR shadow replicate ${replicate} timed out`)); }, 180000);
          worker.onmessage = event => {
            if (event.data?.type === 'ERROR') { clearTimeout(timeout); worker.terminate(); reject(new Error(event.data.error)); }
            if (event.data?.type === 'RESULT') { clearTimeout(timeout); worker.terminate(); resolve(event.data); }
          };
          worker.onerror = event => { clearTimeout(timeout); worker.terminate(); reject(new Error(event.message || 'Shadow worker error')); };
          worker.postMessage({ type: 'RUN', fixtures, replicate, webrVersion, pageCrossOriginIsolated: crossOriginIsolated });
        });
      }, { fixtures, replicate, webrVersion });
      result.chromium_user_agent = await page.evaluate(() => navigator.userAgent);
      result.page_cross_origin_isolated = await page.evaluate(() => crossOriginIsolated);
      runs.push(result);
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.server.close(resolve));
  }
  const output = {
    schema: 'CP-WEBR-02-CLOSURE-1-E2-webr-shadow-diagnostic-v1',
    evidence_classification: 'WEBR_DIAGNOSTIC_SHADOW_EXECUTION',
    commit_sha: process.env.GITHUB_SHA || null,
    webr_distribution_version: webrVersion,
    locked_r_version: lock.runtime.r_version,
    locked_emscripten_version: lock.runtime.emscripten_version,
    webr_distribution_lock_sha256: sha256(fs.readFileSync(lockPath)),
    runtime_asset_sha256: Object.fromEntries(['R.js', 'R.wasm', 'libRblas.so', 'libRlapack.so', 'webr.js', 'webr-worker.js'].map(name => {
      const asset = path.join(publicRoot, 'assets/webr', name);
      if (!fs.existsSync(asset)) throw new Error(`Missing built WebR runtime asset: ${name}`);
      return [name, sha256(fs.readFileSync(asset))];
    })),
    production_dedicated_worker_bundle_sha256: sha256(fs.readFileSync(path.join(publicRoot, 'assets/webr-worker.js'))),
    diagnostic_worker_source_sha256: sha256(fs.readFileSync(path.join(forensics, 'webr_covariance_worker.js'))),
    runner_source_sha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))),
    template_sha256: sha256(fs.readFileSync(path.join(root, 'experiments/cp-webr-02a/adapter/r_template.R'))),
    fixture_inputs: fixtures.map(({ csv, ...meta }) => meta),
    runs,
    network_observations: {
      scope: 'same-origin static built-app requests only; browser HTTPS stack is not observed by this HTTP harness',
      requests: server.observations,
      unmeasured: ['external DNS resolution', 'browser-level secure transport internals']
    },
    browser_console_errors: consoleErrors
  };
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx' });
  if (runs.length !== 2 || runs.some(run => run.evidence_classification !== 'WEBR_DIAGNOSTIC_SHADOW_EXECUTION')) throw new Error('WebR shadow evidence incomplete');
  if (runs.some(run => !String(run.runtime?.r_environment?.r_version || '').includes('4.6.0'))) throw new Error('WebR did not report embedded R 4.6.0');
  if (runs.some(run => run.runtime?.webr_version !== '0.6.0')) throw new Error('WebR runtime identity mismatch');
  if (lock.runtime.r_version !== '4.6.0' || lock.runtime.emscripten_version !== '5.0.7') throw new Error('Pinned R/Emscripten runtime identity mismatch');
  if (consoleErrors.length) throw new Error(`Browser reported ${consoleErrors.length} console or page errors`);
  console.log(`WebR shadow diagnostics written: ${destination}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
