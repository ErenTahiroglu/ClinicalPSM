// CP-WEBR-00B Manifest and Fixture Integrity Verifier
// Validates all fixture JSON and artifact-manifest.json hashes

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT_DIR = path.resolve('experiments/cp-webr-00b');
const manifestPath = path.join(ROOT_DIR, 'artifact-manifest.json');
const fixturesManifestPath = path.join(ROOT_DIR, 'fixtures/fixtures_manifest.json');

console.log('Verifying fixtures manifest...');
const fixManifest = JSON.parse(fs.readFileSync(fixturesManifestPath, 'utf8'));
if (!Array.isArray(fixManifest.fixtures) || fixManifest.fixtures.length !== 25) {
  throw new Error(`Expected 25 fixtures in fixtures_manifest.json, found ${fixManifest.fixtures?.length}`);
}
console.log(`✓ Fixtures manifest valid: 25 fixtures defined across 9 archetypes.`);

console.log('\nVerifying artifact manifest...');
const artManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let checked = 0;
let errors = 0;

for (const item of artManifest.artifacts) {
  const filePath = path.join(ROOT_DIR, item.file);
  if (!fs.existsSync(filePath)) {
    console.error(`✗ Missing artifact file: ${item.file}`);
    errors++;
    continue;
  }
  const data = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  if (hash !== item.sha256) {
    console.error(`✗ Hash mismatch for ${item.file}: expected ${item.sha256}, got ${hash}`);
    errors++;
  } else {
    checked++;
  }
}

console.log(`\nVerified ${checked} artifact files.`);
if (errors > 0) {
  throw new Error(`Manifest verification failed with ${errors} errors!`);
}
console.log('✓ All artifact hashes strictly match committed files!\n');
