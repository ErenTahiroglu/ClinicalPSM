// CP-WEBR-00B Cloudflare Free Asset Audit
// Audits all WebR runtime and package assets against Cloudflare Workers Static Assets Free tier limits

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
const depLockFile = 'experiments/cp-webr-00b/dependency-lock.json';
const outFile = 'experiments/cp-webr-00b/cloudflare-asset-audit.json';

const depLock = JSON.parse(fs.readFileSync(depLockFile, 'utf8'));

const MAX_ASSET_BYTES = 25 * 1024 * 1024; // 25 MiB = 26,214,400 bytes
const MAX_FILE_COUNT = 20000;

function getMimeType(filePath) {
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json';
  if (filePath.endsWith('.tgz') || filePath.endsWith('.tar.gz') || filePath.endsWith('.data.gz')) return 'application/gzip';
  if (filePath.endsWith('.so')) return 'application/octet-stream';
  if (filePath.endsWith('.ttf')) return 'font/ttf';
  if (filePath.endsWith('.map')) return 'application/json';
  return 'application/octet-stream';
}

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return {
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    bytes: content.length
  };
}

const assets = [];

// 1. Scan webr/dist runtime files
function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full);
    } else if (entry.isFile()) {
      const rel = path.relative(webrDist, full);
      const info = hashFile(full);
      assets.push({
        path: `assets/webr/${rel}`,
        source: 'webr-runtime',
        bytes: info.bytes,
        sha256: info.sha256,
        mime_type: getMimeType(rel),
        exceeds_25mib_limit: info.bytes > MAX_ASSET_BYTES
      });
    }
  }
}

walkDir(webrDist);

// 2. Add 21 package archives from dependency lock
for (const p of depLock.packages) {
  assets.push({
    path: `assets/webr/packages/${p.package}_${p.version}.tgz`,
    source: 'r-wasm-package',
    bytes: p.bytes,
    sha256: p.sha256,
    mime_type: 'application/gzip',
    exceeds_25mib_limit: p.bytes > MAX_ASSET_BYTES
  });
}

// 3. Aggregate checks
let totalBytes = 0;
let maxSingleAssetBytes = 0;
let maxSingleAssetPath = '';
let violationsCount = 0;

for (const a of assets) {
  totalBytes += a.bytes;
  if (a.bytes > maxSingleAssetBytes) {
    maxSingleAssetBytes = a.bytes;
    maxSingleAssetPath = a.path;
  }
  if (a.exceeds_25mib_limit) violationsCount++;
}

  let existingTimestamp = "2026-10-19T10:24:00Z";
  if (fs.existsSync(outFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      if (existing.audited_at) existingTimestamp = existing.audited_at;
    } catch {}
  }

  const audit = {
    audited_at: process.env.EVAL_TIMESTAMP || existingTimestamp,
  target_tier: "Cloudflare Workers Static Assets (Free Tier)",
  limits: {
    max_single_asset_bytes: MAX_ASSET_BYTES,
    max_files_per_version: MAX_FILE_COUNT
  },
  metrics: {
    total_files_count: assets.length,
    total_raw_bytes: totalBytes,
    total_raw_mb: (totalBytes / (1024 * 1024)).toFixed(2),
    largest_asset_path: maxSingleAssetPath,
    largest_asset_bytes: maxSingleAssetBytes,
    largest_asset_mb: (maxSingleAssetBytes / (1024 * 1024)).toFixed(2),
    assets_exceeding_25mib: violationsCount
  },
  required_headers_for_shared_array_buffer: {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "application/wasm": "Strict MIME type for .wasm binaries"
  },
  verdict: violationsCount === 0 && assets.length <= MAX_FILE_COUNT ? "PASS" : "FAIL",
  inventory: assets
};

fs.writeFileSync(outFile, JSON.stringify(audit, null, 2));

console.log('--- CLOUDFLARE ASSET AUDIT SUMMARY ---');
console.log(`Total Deployable Assets: ${assets.length} (limit: ${MAX_FILE_COUNT})`);
console.log(`Total Uncompressed Size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MiB`);
console.log(`Largest Asset: ${maxSingleAssetPath} (${(maxSingleAssetBytes / (1024 * 1024)).toFixed(2)} MiB, limit: 25 MiB)`);
console.log(`Assets Exceeding 25 MiB: ${violationsCount}`);
console.log(`Verdict: ${audit.verdict}`);
