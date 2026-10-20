// CP-WEBR-02A Manifest Verification Script
// Verifies SHA-256 and byte size integrity of all registered qualification artifacts

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const manifestPath = path.resolve('experiments/cp-webr-02a/ARTIFACT-MANIFEST.json');
if (!fs.existsSync(manifestPath)) {
  console.error('Missing ARTIFACT-MANIFEST.json');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
let failures = 0;
let checked = 0;

console.log('Verifying CP-WEBR-02A Artifact Manifest...');

for (const [relPath, expected] of Object.entries(manifest.artifacts)) {
  checked++;
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`FAIL: File does not exist: ${relPath}`);
    failures++;
    continue;
  }

  const buf = fs.readFileSync(fullPath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');

  if (buf.length !== expected.bytes) {
    console.error(`FAIL: Byte size mismatch on ${relPath}: expected ${expected.bytes}, got ${buf.length}`);
    failures++;
  } else if (hash !== expected.sha256) {
    console.error(`FAIL: SHA-256 mismatch on ${relPath}: expected ${expected.sha256}, got ${hash}`);
    failures++;
  } else {
    console.log(`OK: ${relPath} (${buf.length} bytes, SHA: ${hash.substring(0, 12)}...)`);
  }
}

console.log(`\nVerified ${checked} artifacts: ${checked - failures} valid, ${failures} failures`);
if (failures > 0) {
  process.exit(1);
}
console.log('Manifest integrity verification PASSED.');
