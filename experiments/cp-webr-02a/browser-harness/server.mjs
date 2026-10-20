// CP-WEBR-02A Browser Qualification Server
// Features:
// 1. COOP (same-origin), COEP (require-corp), CORP (same-origin)
// 2. Worker CSP A/B profiles: strict (without unsafe-eval) vs permissive (with unsafe-eval)
// 3. Pre-egress prevention endpoints (/api/prohibited-leak-*-prevention)
// 4. Server-side rejection endpoint (/api/prohibited-server-rejection) returning HTTP 403
// 5. Mock falsification sink (/api/mock-falsification-sink)
// 6. Static asset delivery for WebR and local repo

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export const PORT = parseInt(process.env.PORT || '8899', 10);

function resolveWebrDist() {
  const candidates = [
    path.resolve('experiments/cp-webr-00b/.cache/webr/dist'),
    path.resolve('node_modules/webr/dist')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve('experiments/cp-webr-00b/.cache/webr/dist');
}

const webrDist = resolveWebrDist();
const localRepo = path.resolve('experiments/cp-webr-00b/.cache/local-repo');
const harnessDir = path.resolve('experiments/cp-webr-02a/browser-harness');
const adapterDir = path.resolve('experiments/cp-webr-02a/adapter');
const fixturesDir = path.resolve('experiments/cp-webr-02a/fixtures');

function getMime(p) {
  if (p.endsWith('.wasm')) return 'application/wasm';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.tgz') || p.endsWith('.tar.gz') || p.endsWith('.data.gz') || p.endsWith('.gz')) return 'application/gzip';
  if (p.endsWith('.so')) return 'application/octet-stream';
  if (p.endsWith('.csv')) return 'text/csv; charset=utf-8';
  return 'text/plain';
}

export function createServer(options = {}) {
  const baseCspMode = options.cspMode || 'standard';
  const falsificationSinkLog = [];
  const preventionEndpointsLog = [];

  const server = http.createServer(async (req, res) => {
    // Cross-origin isolation headers
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Falsification Sink Endpoint
    if (pathname === '/api/mock-falsification-sink') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch {}
        const record = {
          receivedAt: new Date().toISOString(),
          headers: req.headers,
          bodyText: body,
          bodyJson: parsed
        };
        falsificationSinkLog.push(record);
        const containsSentinel = body.includes('FALSIFICATION_SENTINEL_PAYLOAD_339a1c');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          acknowledged: true,
          matchedSentinel: containsSentinel,
          count: falsificationSinkLog.length
        }));
      });
      return;
    }

    // Prevention trap endpoints
    if (pathname === '/api/prohibited-leak-page-prevention' || pathname === '/api/prohibited-leak-worker-prevention') {
      preventionEndpointsLog.push({ path: pathname, time: new Date().toISOString() });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint should have been aborted pre-egress by client route handler' }));
      return;
    }

    // Server-side rejection endpoint
    if (pathname === '/api/prohibited-server-rejection') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'SERVER_REJECTION',
        message: 'Telemetry and data egress prohibited by server policy'
      }));
      return;
    }

    // Status query
    if (pathname === '/api/audit-logs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        falsificationSinkHits: falsificationSinkLog.length,
        falsificationLog: falsificationSinkLog,
        preventionHits: preventionEndpointsLog.length,
        preventionLog: preventionEndpointsLog
      }));
      return;
    }

    // Dynamic Worker with query parameter CSP: strict vs permissive
    if (pathname === '/worker-strict.js' || (pathname === '/worker.js' && url.searchParams.get('csp') === 'strict-worker')) {
      const filePath = path.join(harnessDir, 'worker.js');
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        // Strict worker policy: NO 'unsafe-eval'
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' blob:; connect-src 'self' blob:; worker-src 'self' blob:;");
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    if (pathname === '/worker-permissive.js' || (pathname === '/worker.js' && url.searchParams.get('csp') === 'permissive-worker')) {
      const filePath = path.join(harnessDir, 'worker.js');
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        // Permissive worker policy: includes 'unsafe-eval'
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:; connect-src 'self' blob:; worker-src 'self' blob:;");
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    // Determine CSP for HTML pages
    let pageCsp = "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; worker-src 'self' blob:; img-src 'self' data: blob:;";
    if (url.searchParams.get('csp') === 'strict-page' || baseCspMode === 'strict-page') {
      // Profile B: Page without 'unsafe-eval'
      pageCsp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; worker-src 'self' blob:; img-src 'self' data: blob:;";
    }
    res.setHeader('Content-Security-Policy', pageCsp);

    // Static file routing
    let targetFile = null;
    if (pathname === '/' || pathname === '/index.html') {
      targetFile = path.join(harnessDir, 'index.html');
    } else if (pathname.startsWith('/webr/')) {
      targetFile = path.join(webrDist, pathname.replace(/^\/webr\//, ''));
    } else if (pathname.startsWith('/repo/')) {
      targetFile = path.join(localRepo, pathname.replace(/^\/repo\//, ''));
    } else if (pathname.startsWith('/adapter/')) {
      targetFile = path.join(adapterDir, pathname.replace(/^\/adapter\//, ''));
    } else if (pathname.startsWith('/fixtures/')) {
      targetFile = path.join(fixturesDir, pathname.replace(/^\/fixtures\//, ''));
    } else {
      targetFile = path.join(harnessDir, pathname.replace(/^\//, ''));
    }

    if (targetFile && fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
      res.setHeader('Content-Type', getMime(targetFile));
      fs.createReadStream(targetFile).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not Found: ${pathname}`);
    }
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = createServer();
  s.listen(PORT, () => {
    console.log(`CP-WEBR-02A Qualification server listening on http://localhost:${PORT}`);
  });
}
