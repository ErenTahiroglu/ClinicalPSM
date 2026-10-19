// CP-WEBR-00B R2 Deterministic Experiment Setup
// Ensures exact pinned Wasm packages and WebR 0.6.0 npm runtime are present in .cache
// Verifies all artifact hashes against dependency-lock.json

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve('experiments/cp-webr-00b');
const CACHE_DIR = path.join(ROOT_DIR, '.cache');
const LOCAL_REPO_DIR = path.join(CACHE_DIR, 'local-repo/bin/emscripten/contrib/4.6');
const WEBR_CACHE_DIR = path.join(CACHE_DIR, 'webr');

fs.mkdirSync(LOCAL_REPO_DIR, { recursive: true });
fs.mkdirSync(WEBR_CACHE_DIR, { recursive: true });

const depLockPath = path.join(ROOT_DIR, 'dependency-lock.json');
const depLock = JSON.parse(fs.readFileSync(depLockPath, 'utf8'));

console.log('======================================================');
console.log('CP-WEBR-00B R2 DETERMINISTIC REPRODUCIBILITY SETUP');
console.log('======================================================\n');

// 1. Verify / download WebR 0.6.0 distribution
const webrDistPath = path.join(WEBR_CACHE_DIR, 'dist');
if (!fs.existsSync(path.join(webrDistPath, 'R.wasm')) || !fs.existsSync(path.join(webrDistPath, 'webr.js'))) {
  console.log('WebR dist not found in cache. Checking existing node_modules or installing...');
  const rootNodeModulesWebr = path.resolve('node_modules/webr');
  if (fs.existsSync(path.join(rootNodeModulesWebr, 'dist/R.wasm'))) {
    console.log(`Copying webr from ${rootNodeModulesWebr}...`);
    fs.cpSync(rootNodeModulesWebr, WEBR_CACHE_DIR, { recursive: true });
  } else {
    console.log('Installing webr@0.6.0 into experiment cache via npm...');
    execSync('npm pack webr@0.6.0', { cwd: CACHE_DIR, stdio: 'inherit' });
    const tarball = fs.readdirSync(CACHE_DIR).find(f => f.startsWith('webr-0.6.0') && f.endsWith('.tgz'));
    if (tarball) {
      execSync(`tar -xzf "${tarball}" --strip-components=1 -C "${WEBR_CACHE_DIR}"`, { cwd: CACHE_DIR, stdio: 'inherit' });
      fs.unlinkSync(path.join(CACHE_DIR, tarball));
    }
  }
}

if (!fs.existsSync(path.join(WEBR_CACHE_DIR, 'dist/R.wasm'))) {
  throw new Error('Failed to resolve or extract WebR 0.6.0 runtime dist!');
}
console.log(`✓ WebR 0.6.0 runtime ready in ${webrDistPath}`);

// 2. Verify / download all 21 Wasm packages
console.log(`\nVerifying ${depLock.packages.length} Wasm package binaries...`);
const packageEntries = [];

for (const pkg of depLock.packages) {
  const filename = path.basename(pkg.binaryUrl);
  const targetFile = path.join(LOCAL_REPO_DIR, filename);

  let downloadNeeded = true;
  if (fs.existsSync(targetFile)) {
    const buf = fs.readFileSync(targetFile);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (hash === pkg.sha256) {
      downloadNeeded = false;
      console.log(`✓ Verified: ${filename} (${buf.length} bytes, sha256=${hash.slice(0, 10)}...)`);
    } else {
      console.log(`Hash mismatch for ${filename}, re-downloading...`);
    }
  }

  if (downloadNeeded) {
    console.log(`Downloading ${pkg.binaryUrl}...`);
    const resp = await fetch(pkg.binaryUrl);
    if (!resp.ok) throw new Error(`Failed to download ${pkg.binaryUrl}: ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (hash !== pkg.sha256) {
      throw new Error(`SHA256 mismatch on downloaded ${filename}! Expected ${pkg.sha256}, got ${hash}`);
    }
    fs.writeFileSync(targetFile, buf);
    console.log(`✓ Downloaded & verified: ${filename} (${buf.length} bytes)`);
  }

  packageEntries.push(`Package: ${pkg.package}\nVersion: ${pkg.version}\nLicense: ${pkg.license}\nNeedsCompilation: no\n`);
}

// Generate PACKAGES index file
const packagesContent = packageEntries.join('\n');
fs.writeFileSync(path.join(LOCAL_REPO_DIR, 'PACKAGES'), packagesContent);
console.log(`\n✓ Generated PACKAGES index in ${LOCAL_REPO_DIR}`);
console.log('✓ Clean-checkout experiment setup complete!\n');
