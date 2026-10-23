import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const forensics = path.join(root, 'experiments/cp-webr-02-closure/forensics');
const committedLock = path.join(forensics, 'renv.lock');
const committedManifest = path.join(forensics, 'source-package-integrity.json');
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fail(message) { throw new Error(message); }

async function fetchArchive(name, version) {
  const filename = `${name}_${version}.tar.gz`;
  const urls = [
    `https://cran.r-project.org/src/contrib/${filename}`,
    `https://cran.r-project.org/src/contrib/Archive/${name}/${filename}`
  ];
  const failures = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) { failures.push(`${url}: HTTP ${response.status}`); continue; }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) { failures.push(`${url}: invalid source archive`); continue; }
      return { url, bytes };
    } catch (error) { failures.push(`${url}: ${String(error)}`); }
  }
  fail(`Unable to retrieve CRAN source archive for ${name} ${version}: ${failures.join('; ')}`);
}
function resolveLock(input) {
  if (input) return path.resolve(input);
  if (fs.existsSync(committedLock)) return committedLock;
  fail('No forensics renv lock exists; provide the bootstrap output with --lockfile.');
}
async function buildManifest(lockPath) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const packages = Object.values(lock.Packages || {}).filter(pkg => pkg.Source === 'Repository' && pkg.Repository === 'CRAN')
    .map(pkg => ({ name: pkg.Package, version: pkg.Version })).sort((a, b) => a.name.localeCompare(b.name));
  if (!packages.some(pkg => pkg.name === 'detectseparation' && pkg.version === '0.4.0')) fail('Forensics lock must include detectseparation 0.4.0');
  if (!packages.some(pkg => pkg.name === 'jsonlite' && pkg.version === '2.0.0')) fail('Forensics lock must include jsonlite 2.0.0');
  const rows = [];
  for (const pkg of packages) {
    const archive = await fetchArchive(pkg.name, pkg.version);
    rows.push({ ...pkg, archive_url: archive.url, bytes: archive.bytes.length, sha256: sha(archive.bytes) });
  }
  return {
    schema: 'CP-WEBR-02-CLOSURE-1-E2-diagnostic-source-package-integrity-v1',
    provenance: 'Official CRAN source archives; SHA-256 recorded and checked against the isolated forensics renv lock.',
    lockfile_sha256: sha(fs.readFileSync(lockPath)),
    package_count: rows.length,
    packages: rows
  };
}
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  if (!['bootstrap', 'verify'].includes(mode)) fail('Usage: package_sources.mjs bootstrap --lockfile <file> --output <new-manifest> | verify --lockfile <file>');
  const values = {};
  for (let i = 1; i < args.length; i += 2) {
    if (!['--lockfile', '--output'].includes(args[i]) || !args[i + 1]) fail('Invalid package source arguments');
    values[args[i].slice(2)] = path.resolve(args[i + 1]);
  }
  const lockPath = resolveLock(values.lockfile);
  const actual = await buildManifest(lockPath);
  if (mode === 'bootstrap') {
    if (!values.output || fs.existsSync(values.output)) fail('Bootstrap requires a new --output manifest path');
    fs.mkdirSync(path.dirname(values.output), { recursive: true });
    fs.writeFileSync(values.output, `${JSON.stringify(actual, null, 2)}\n`, { flag: 'wx' });
    console.log(`Captured ${actual.package_count} CRAN source package hashes from the isolated diagnostic lock.`);
    return;
  }
  if (!fs.existsSync(committedManifest)) fail('Committed forensic source package manifest is missing.');
  const expected = JSON.parse(fs.readFileSync(committedManifest, 'utf8'));
  if (expected.lockfile_sha256 !== actual.lockfile_sha256) fail('Forensics source manifest lockfile hash mismatch.');
  if (JSON.stringify(expected.packages) !== JSON.stringify(actual.packages)) fail('CRAN source package archive resolution or SHA-256 differs from the committed manifest.');
  console.log(`Verified ${actual.package_count} isolated diagnostic CRAN source archive hashes.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
