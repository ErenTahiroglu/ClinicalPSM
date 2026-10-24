import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const readJson = async (name) => JSON.parse(await readFile(resolve(here, name), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };
const outputIndex = process.argv.indexOf('--output');
const outputPath = outputIndex >= 0 ? resolve(process.argv[outputIndex + 1]) : null;
if (outputIndex >= 0 && !process.argv[outputIndex + 1]) fail('--output requires a path');

const pins = await readJson('preregistration-pins-v1.json');
const lockBytes = await readFile(resolve(here, 'renv.lock'));
const manifestBytes = await readFile(resolve(here, 'source-package-integrity.json'));
const lock = JSON.parse(lockBytes.toString('utf8'));
const manifest = JSON.parse(manifestBytes.toString('utf8'));

if (pins.phase_baseline_sha !== 'c3bda2ed841486aadcb5c44f0caa883662a17cf2') fail('Unexpected CP-STAT-02 baseline pin');
if (sha256(lockBytes) !== pins.experimental_environment.renv_lock_sha256) fail('renv.lock SHA-256 differs from preregistration pin');
if (sha256(manifestBytes) !== pins.experimental_environment.source_archive_manifest_sha256) fail('Source archive manifest SHA-256 differs from preregistration pin');
if (sha256(lockBytes) !== manifest.lockfile_sha256) fail('Source archive manifest points to a different renv.lock');
if (manifest.packages.length !== manifest.package_count || manifest.package_count !== 39) fail('Source archive record cardinality mismatch');
if (lock.R?.Version !== '4.6.0') fail('Pinned R version mismatch');

const seen = new Set();
for (const pkg of manifest.packages) {
  if (seen.has(pkg.name)) fail(`Duplicate source package record: ${pkg.name}`);
  seen.add(pkg.name);
  if (!/^[a-f0-9]{64}$/.test(pkg.sha256) || !Number.isSafeInteger(pkg.bytes) || pkg.bytes <= 0) fail(`Malformed archive integrity record: ${pkg.name}`);
  const url = new URL(pkg.archive_url);
  if (url.protocol !== 'https:' || url.hostname !== 'cran.r-project.org') fail(`Non-authoritative package archive URL for ${pkg.name}`);
  if (lock.Packages?.[pkg.name]?.Version !== pkg.version) fail(`Lockfile package version mismatch for ${pkg.name}`);
}

const queue = [...manifest.packages];
const verified = [];
const worker = async () => {
  while (queue.length) {
    const pkg = queue.shift();
    const response = await fetch(pkg.archive_url, { signal: AbortSignal.timeout(120_000), redirect: 'follow' });
    if (!response.ok) fail(`Archive download HTTP ${response.status} for ${pkg.name}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const observedSha = sha256(bytes);
    if (bytes.length !== pkg.bytes) fail(`Archive byte-count mismatch for ${pkg.name}: ${bytes.length} != ${pkg.bytes}`);
    if (observedSha !== pkg.sha256) fail(`Archive SHA-256 mismatch for ${pkg.name}: ${observedSha} != ${pkg.sha256}`);
    verified.push({ name: pkg.name, version: pkg.version, bytes: bytes.length, sha256: observedSha });
    process.stdout.write(`verified ${pkg.name} ${pkg.version} ${bytes.length} ${observedSha}\n`);
  }
};

await Promise.all(Array.from({ length: 4 }, worker));
if (verified.length !== 39) fail(`Verified ${verified.length} archives, expected 39`);
if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    schema: 'CP-STAT-02-A1-SOURCE-ARCHIVE-VERIFICATION-v1',
    status: 'PASS',
    commit_sha: process.env.GITHUB_SHA ?? 'LOCAL',
    workflow_run_id: process.env.GITHUB_RUN_ID ?? 'LOCAL',
    verified_at_utc: new Date().toISOString(),
    renv_lock_sha256: sha256(lockBytes),
    package_integrity_manifest_sha256: sha256(manifestBytes),
    package_count: verified.length,
    total_archive_bytes: verified.reduce((sum, pkg) => sum + pkg.bytes, 0),
    packages: verified.sort((a, b) => a.name.localeCompare(b.name)),
  }, null, 2)}\n`);
}
process.stdout.write(`PASS: ${verified.length} pinned official CRAN source archives verified (${verified.reduce((sum, pkg) => sum + pkg.bytes, 0)} bytes).\n`);
