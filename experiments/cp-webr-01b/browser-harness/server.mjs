// CP-WEBR-01B Browser Qualification Server
// Features:
// 1. Production-approximate COOP, COEP, CORP, and configurable CSP
// 2. Traps for negative control prohibited endpoints (/api/prohibited-leak-*)
// 3. Independent mock falsification sink (/api/mock-falsification-sink)
// 4. Strict Wasm, JS, and gzip MIME mappings

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
const harnessDir = path.resolve('experiments/cp-webr-01b/browser-harness');

function getMime(p) {
  if (p.endsWith('.wasm')) return 'application/wasm';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.tgz') || p.endsWith('.tar.gz') || p.endsWith('.data.gz') || p.endsWith('.gz')) return 'application/gzip';
  if (p.endsWith('.so')) return 'application/octet-stream';
  return 'text/plain';
}

export function createServer(options = {}) {
  const cspMode = options.cspMode || 'standard'; // 'standard', 'minimal', 'no-eval-page'
  const falsificationSinkLog = [];

  const server = http.createServer(async (req, res) => {
    // Standard isolation headers
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

    // Dynamic CSP Configuration
    let cspHeader = "default-src 'self' 'wasm-unsafe-eval' blob: data:; " +
      "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:; " +
      "worker-src 'self' blob:; " +
      "style-src 'self'; " +
      "connect-src 'self';";

    if (cspMode === 'no-eval-page') {
      // Test page without unsafe-eval (unsafe-eval reserved for worker)
      cspHeader = "default-src 'self' 'wasm-unsafe-eval' blob: data:; " +
        "script-src 'self' 'wasm-unsafe-eval' blob:; " +
        "worker-src 'self' blob:; " +
        "style-src 'self'; " +
        "connect-src 'self';";
    }

    res.setHeader('Content-Security-Policy', cspHeader);

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = decodeURIComponent(url.pathname);

    // Negative control trap endpoints
    if (pathname === '/api/prohibited-leak-page' || pathname === '/api/prohibited-leak-worker') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'BLOCKED_PROHIBITED_ENDPOINT',
        endpoint: pathname,
        receivedMethod: req.method
      }));
      return;
    }

    // Falsification Mock Sink Endpoint
    if (pathname === '/api/mock-falsification-sink') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const entry = {
          received_at: new Date().toISOString(),
          headers: req.headers,
          method: req.method,
          bodyLength: body.length,
          bodySnippet: body.substring(0, 200),
          containsSentinel: body.includes('FALSIFICATION_SENTINEL_PAYLOAD_339a1c')
        };
        falsificationSinkLog.push(entry);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'RECEIVED_FALSIFICATION_SENTINEL',
          received: true,
          matchedSentinel: entry.containsSentinel
        }));
      });
      return;
    }

    // Falsification status query endpoint for test runner
    if (pathname === '/api/falsification-sink-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        receivedCount: falsificationSinkLog.length,
        log: falsificationSinkLog
      }));
      return;
    }

    let filePath = null;
    if (pathname.startsWith('/webr/')) {
      filePath = path.join(webrDist, pathname.replace(/^\/webr\//, ''));
    } else if (pathname.startsWith('/repo/')) {
      filePath = path.join(localRepo, pathname.replace(/^\/repo\//, ''));
    } else {
      let rel = pathname === '/' || pathname === '' ? '/index.html' : pathname;
      filePath = path.join(harnessDir, rel);
    }

    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found: ' + pathname);
      return;
    }

    const mime = getMime(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  });

  server.getFalsificationLog = () => falsificationSinkLog;
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = createServer();
  s.listen(PORT, () => {
    console.log(`CP-WEBR-01B Server running on http://localhost:${PORT}`);
  });
}
