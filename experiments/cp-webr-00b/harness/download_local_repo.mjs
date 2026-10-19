// Download and cache exact Wasm package repository locally
// Used to serve WebR packages self-hosted from local origin with zero external internet

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const cacheDir = path.resolve('experiments/cp-webr-00b/.cache/local-repo/bin/emscripten/contrib/4.6');
fs.mkdirSync(cacheDir, { recursive: true });

const depLock = JSON.parse(fs.readFileSync('experiments/cp-webr-00b/dependency-lock.json', 'utf8'));

console.log(`Verifying / downloading ${depLock.packages.length} Wasm packages into ${cacheDir}...`);

const packageEntries = [];

for (const pkg of depLock.packages) {
  const filename = path.basename(pkg.binaryUrl);
  const targetFile = path.join(cacheDir, filename);

  let downloadNeeded = true;
  if (fs.existsSync(targetFile)) {
    const buf = fs.readFileSync(targetFile);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (hash === pkg.sha256) {
      downloadNeeded = false;
      console.log(`✓ Cached & verified: ${filename} (${buf.length} bytes, sha256=${hash.slice(0, 10)}...)`);
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
fs.writeFileSync(path.join(cacheDir, 'PACKAGES'), packagesContent);
console.log(`\nGenerated PACKAGES index file in ${cacheDir}`);
console.log(`Local Wasm package repository ready!`);
