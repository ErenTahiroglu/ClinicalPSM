import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve('.');
const publicRoot = path.join(repoRoot, 'apps/web/public');
const harnessRoot = path.resolve('experiments/cp-webr-02b/browser');
const managerPath = path.join(repoRoot, 'src/lib/webr/worker_manager.mjs');

function readHeaderRules() {
  const lines = fs.readFileSync(path.join(publicRoot, '_headers'), 'utf8').split(/\r?\n/);
  const rules = [];
  let current = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: {} };
      rules.push(current);
    } else if (current) {
      const match = line.trim().match(/^([^:]+):\s*(.*)$/);
      if (match) current.headers[match[1].toLowerCase()] = match[2];
    }
  }
  return rules;
}

function routeMatches(pattern, pathname) {
  if (pattern.endsWith('*')) return pathname.startsWith(pattern.slice(0, -1));
  return pathname === pattern;
}

function mimeType(file) {
  if (file.endsWith('.wasm')) return 'application/wasm';
  if (/\.(?:mjs|js)$/.test(file)) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (/\.(?:tgz|gz|tar)$/.test(file)) return 'application/gzip';
  if (file.endsWith('.so')) return 'application/octet-stream';
  return 'text/plain; charset=utf-8';
}

function safeFile(root, pathname) {
  const target = path.resolve(root, `.${pathname}`);
  return target.startsWith(`${root}${path.sep}`) ? target : null;
}

export function createServer({ port = 8898 } = {}) {
  if (!fs.existsSync(path.join(publicRoot, '_headers'))) {
    throw new Error('Static app build is missing; run npm run build before browser qualification.');
  }
  const rules = readHeaderRules();
  const egressProbeLog = [];
  const cspResponses = [];
  let webrCspProfile = 'strict';
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/__test__/webr-csp') {
      const requested = url.searchParams.get('profile');
      if (requested === 'strict' || requested === 'compatible') webrCspProfile = requested;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ profile: webrCspProfile }));
      return;
    }

    for (const rule of rules) {
      if (!routeMatches(rule.pattern, pathname)) continue;
      for (const [name, value] of Object.entries(rule.headers)) {
        if (name.startsWith('! ')) {
          res.removeHeader(name.slice(2));
        } else if (rule.pattern === '/assets/webr/webr-worker.js' && name === 'content-security-policy') {
          const strict = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' blob:; connect-src 'self' blob:; worker-src 'self' blob:";
          const compatible = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:; connect-src 'self' blob:; worker-src 'self' blob:";
          res.setHeader(name, webrCspProfile === 'compatible' ? compatible : strict);
        } else {
          res.setHeader(name, value);
        }
      }
    }
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (pathname.startsWith('/assets/webr/')) res.setHeader('Cache-Control', 'no-store');

    if (pathname === '/__egress_probe__') {
      const byteLength = Number(req.headers['content-length'] || 0);
      egressProbeLog.push({ method: req.method, path: pathname, bodyPresent: byteLength > 0, bodyByteLength: byteLength });
      req.resume();
      res.writeHead(204);
      res.end();
      return;
    }
    if (pathname === '/__egress_probe_log__') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(egressProbeLog));
      return;
    }

    if (pathname === '/__test__/lifecycle.html') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'self' blob: data:; script-src 'self' 'wasm-unsafe-eval' blob:; connect-src *; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'"
      });
      res.end('<!doctype html><meta charset="utf-8"><title>CP-WEBR-02B isolated worker lifecycle harness</title><script type="module" src="/__test__/lifecycle.js"></script>');
      return;
    }
    if (pathname === '/__test__/strict-eval-worker.js') {
      res.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'content-security-policy': "default-src 'none'; script-src 'self' 'wasm-unsafe-eval' blob:; connect-src 'self' blob:; worker-src 'self' blob:"
      });
      fs.createReadStream(path.join(harnessRoot, 'strict-eval-worker.js')).pipe(res);
      return;
    }
    if (pathname === '/__test__/worker_manager.mjs') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      fs.createReadStream(managerPath).pipe(res);
      return;
    }
    if (pathname.startsWith('/__test__/')) {
      const file = safeFile(harnessRoot, pathname.slice('/__test__'.length));
      if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'content-type': mimeType(file) });
        fs.createReadStream(file).pipe(res);
        return;
      }
    }

    let relative = pathname;
    if (relative.endsWith('/')) relative += 'index.html';
    let file = safeFile(publicRoot, relative);
    if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      file = path.join(publicRoot, '404.html');
      res.statusCode = 404;
    }
    if (/\/assets\/(?:webr-worker\.js|webr\/webr-worker\.js)$/.test(pathname)) {
      cspResponses.push({ url: `http://127.0.0.1:${port}${pathname}`, status: res.statusCode || 200,
        contentSecurityPolicy: res.getHeader('content-security-policy') || null });
    }
    res.setHeader('content-type', mimeType(file));
    res.setHeader('content-length', fs.statSync(file).size);
    fs.createReadStream(file).pipe(res);
  });
  return { server, port, getCspResponses: () => cspResponses.slice() };
}
