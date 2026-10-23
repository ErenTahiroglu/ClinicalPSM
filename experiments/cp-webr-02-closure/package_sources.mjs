#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const closureDir = path.dirname(new URL(import.meta.url).pathname);
const lockPath = path.join(closureDir, 'renv.lock');
const manifestPath = path.join(closureDir, 'source-package-integrity.json');
const mode = process.argv[2];
const outputIndex = process.argv.indexOf('--output');
const outputPath = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : manifestPath;
const allowOverwrite = process.argv.includes('--overwrite');
const cranRoot = 'https://cran.r-project.org';

function fail(message) {
  throw new Error(message);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function readLock() {
  const raw = await fs.readFile(lockPath);
  const lock = JSON.parse(raw.toString('utf8'));
  if (lock.R?.Version !== '4.6.0') fail(`renv.lock must pin R 4.6.0; found ${lock.R?.Version}`);
  const packages = Object.entries(lock.Packages || {}).map(([name, record]) => {
    if (record.Package !== name || typeof record.Version !== 'string' || record.Source !== 'Repository' || record.Repository !== 'CRAN') {
      fail(`Unexpected or unpinned lock entry for ${name}`);
    }
    return { name, version: record.Version };
  }).sort((a, b) => a.name.localeCompare(b.name));
  if (!packages.length) fail('renv.lock contains no packages');
  return { raw, lock, packages };
}

async function getArchive(name, version) {
  const filename = `${name}_${version}.tar.gz`;
  const urls = [
    `${cranRoot}/src/contrib/${filename}`,
    `${cranRoot}/src/contrib/Archive/${name}/${filename}`
  ];
  const failures = [];
  for (const sourceUrl of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(sourceUrl, { redirect: 'follow', signal: controller.signal });
      if (response.status === 404) {
        failures.push(`${sourceUrl}: HTTP 404`);
        continue;
      }
      if (!response.ok) {
        failures.push(`${sourceUrl}: HTTP ${response.status}`);
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
        failures.push(`${sourceUrl}: response is not a gzip source archive`);
        continue;
      }
      return { sourceUrl, sha256: sha256(bytes), bytes: bytes.length };
    } catch (error) {
      failures.push(`${sourceUrl}: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  fail(`Unable to retrieve CRAN source archive for ${name} ${version}: ${failures.join('; ')}`);
}

async function eachWithConcurrency(values, limit, callback) {
  const results = new Array(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await callback(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function writeCandidate(candidate) {
  if (!allowOverwrite) {
    try {
      await fs.access(outputPath);
      fail(`Refusing to overwrite existing candidate: ${outputPath}; pass --overwrite explicitly to replace it`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(candidate, null, 2)}\n`, { flag: allowOverwrite ? 'w' : 'wx' });
}

async function verify(manifest, lockState) {
  if (manifest.renv_lock_sha256 !== sha256(lockState.raw)) fail('renv.lock SHA-256 differs from source package manifest');
  if (manifest.packages.length !== lockState.packages.length) fail('Package count differs from renv.lock');
  const expected = new Map(lockState.packages.map(item => [item.name, item.version]));
  const manifestNames = new Set(manifest.packages.map(entry => entry.name));
  if (manifestNames.size !== expected.size || [...expected.keys()].some(name => !manifestNames.has(name))) {
    fail('Source manifest contains duplicate, missing, or unexpected package names');
  }
  for (const entry of manifest.packages) {
    if (expected.get(entry.name) !== entry.version) fail(`Source manifest package/version mismatch: ${entry.name} ${entry.version}`);
  }
  const checks = await eachWithConcurrency(manifest.packages, 4, async entry => {
    const archive = await getArchive(entry.name, entry.version);
    if (archive.sha256 !== entry.sha256) fail(`SHA-256 mismatch for ${entry.name} ${entry.version}: expected ${entry.sha256}, received ${archive.sha256}`);
    if (archive.sourceUrl !== entry.source_url) fail(`CRAN archive path changed for ${entry.name} ${entry.version}`);
    if (archive.bytes !== entry.bytes) fail(`Source archive size mismatch for ${entry.name} ${entry.version}`);
    return { name: entry.name, version: entry.version, status: 'PASS', sha256: archive.sha256 };
  });
  return checks;
}

try {
  if (!['generate', 'verify'].includes(mode)) fail('Usage: package_sources.mjs generate [--output PATH] [--overwrite] | verify [MANIFEST]');
  const lockState = await readLock();

  if (mode === 'generate') {
    const packages = await eachWithConcurrency(lockState.packages, 4, async item => {
      const archive = await getArchive(item.name, item.version);
      process.stdout.write(`HASHED ${item.name}@${item.version} ${archive.sha256}\n`);
      return {
        name: item.name,
        version: item.version,
        source_url: archive.sourceUrl,
        sha256: archive.sha256,
        bytes: archive.bytes
      };
    });
    const candidate = {
      schema_version: 1,
      provenance: 'Official CRAN source archives, downloaded and SHA-256 hashed by package_sources.mjs',
      r_version: lockState.lock.R.Version,
      cran_repository: cranRoot,
      renv_lock_sha256: sha256(lockState.raw),
      package_count: packages.length,
      packages
    };
    await writeCandidate(candidate);
    process.stdout.write(`CANDIDATE_WRITTEN ${outputPath}\n`);
    process.stdout.write(`PACKAGE_COUNT ${packages.length}\n`);
  } else {
    const pathArg = process.argv[3] && !process.argv[3].startsWith('--') ? path.resolve(process.argv[3]) : manifestPath;
    const manifest = JSON.parse(await fs.readFile(pathArg, 'utf8'));
    const checks = await verify(manifest, lockState);
    process.stdout.write(JSON.stringify({ status: 'PASS', package_count: checks.length, renv_lock_sha256: sha256(lockState.raw), checks }, null, 2));
    process.stdout.write('\n');
  }
} catch (error) {
  process.stderr.write(`FAIL ${error.stack || error}\n`);
  process.exitCode = 1;
}
