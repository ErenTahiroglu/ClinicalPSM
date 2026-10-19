// Standalone Local HTTP Server for CP-WEBR-00B Browser Qualification
// Serves with strict production-like COOP, COEP, CSP (without 'unsafe-inline'), and correct Wasm MIME types

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export const PORT = parseInt(process.env.PORT || '8899', 10);

function resolveWebrDist() {
  const env = process.env.WEBR_DIST;
  if (env && fs.existsSync(env)) return env;
  const candidates = [
    path.resolve('experiments/cp-webr-00b/.cache/webr/dist'),
    path.resolve('node_modules/webr/dist'),
    path.resolve('../node_modules/webr/dist')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve('experiments/cp-webr-00b/.cache/webr/dist');
}

const webrDist = resolveWebrDist();
const localRepo = path.resolve('experiments/cp-webr-00b/.cache/local-repo');
const harnessDir = path.resolve('experiments/cp-webr-00b/browser-harness');

function getMime(p) {
  if (p.endsWith('.wasm')) return 'application/wasm';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.tgz') || p.endsWith('.tar.gz') || p.endsWith('.data.gz')) return 'application/gzip';
  if (p.endsWith('.so')) return 'application/octet-stream';
  return 'text/plain';
}

export function createServer() {
  const server = http.createServer((req, res) => {
    // Production-like isolation and security headers
    // Note: 'unsafe-inline' is deliberately removed from CSP.
    // 'unsafe-eval' remains strictly required by Emscripten dynamic linker (ASM_CONSTS for libRlapack.so / libRblas.so).
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'wasm-unsafe-eval' blob: data:; " +
      "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:; " +
      "worker-src 'self' blob:; " +
      "style-src 'self'; " +
      "connect-src 'self';"
    );
    res.setHeader('Access-Control-Allow-Origin', '*');

    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);

    // Intentional negative-control trap endpoint
    if (pathname === '/api/intentional-prohibited-leak') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'BLOCKED_PROHIBITED_ENDPOINT' }));
      return;
    }

    let filePath = null;
    if (pathname.startsWith('/webr/')) {
      filePath = path.join(webrDist, pathname.replace(/^\/webr\//, ''));
    } else if (pathname.startsWith('/repo/')) {
      filePath = path.join(localRepo, pathname.replace(/^\/repo\//, ''));
    } else {
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      filePath = path.join(harnessDir, pathname);
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

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = createServer();
  s.listen(PORT, () => {
    console.log(`CP-WEBR-00B Browser Qualification Server running at http://localhost:${PORT}`);
    console.log(`Serving WebR from: ${webrDist}`);
    console.log(`Serving local repo from: ${localRepo}`);
  });
}
