import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const closure = path.join(root, 'experiments/cp-webr-02-closure');
const fixtureRoot = path.join(root, 'experiments/cp-webr-02a/fixtures');
const manifestPath = path.join(fixtureRoot, 'fixtures_manifest.json');
const lockPath = path.join(closure, 'renv.lock');
const sourceManifestPath = path.join(closure, 'source-package-integrity.json');
const fixtureIntegrityPath = path.join(closure, 'fixture-integrity.json');
const oracleSourcePath = path.join(closure, 'native_oracle.R');
const frozenTemplatePath = path.join(root, 'experiments/cp-webr-02a/adapter/r_template.R');
const expectedTemplateSha256 = '7989403c7d093031b93a9c971a6d4f055101bab83c0ec4417fc52e4dceee24a4';

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function shaFile(file) { return sha(fs.readFileSync(file)); }
function fail(message) { throw new Error(message); }
function cli() {
  const args = process.argv.slice(2);
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--candidate', '--sidecar'].includes(args[i]) || !args[i + 1]) fail('Usage: node validate_reference.mjs --candidate <candidate.json> --sidecar <new-sidecar.json>');
    values[args[i].slice(2)] = path.resolve(args[i + 1]);
  }
  if (!values.candidate || !values.sidecar) fail('Candidate and sidecar output paths are required');
  if (fs.existsSync(values.sidecar)) fail(`Refusing to overwrite existing sidecar: ${values.sidecar}`);
  return values;
}
function exact(condition, message) { if (!condition) fail(message); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function validate(candidate, candidateBytes, candidatePath) {
  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const packageManifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
  const fixtureIntegrity = JSON.parse(fs.readFileSync(fixtureIntegrityPath, 'utf8'));
  exact(candidate.schema_version === 1, 'Unsupported candidate schema');
  exact(candidate.evidence_class === 'CANDIDATE_NATIVE_GOLDEN_PENDING_INDEPENDENT_RED_TEAM_ACCEPTANCE', 'Candidate evidence class is invalid');
  exact(candidate.status === 'CANDIDATE_GENERATED', 'Candidate status is invalid');
  exact(candidate.commit_sha === (process.env.GITHUB_SHA || candidate.commit_sha), 'Candidate commit SHA does not match workflow commit');
  exact(/^[0-9a-f]{40}$/.test(candidate.commit_sha), 'Candidate commit SHA is absent or malformed');
  exact(candidate.fixture_count === 25 && candidate.fixtures.length === 25 && manifest.fixture_count === 25 && manifest.fixtures.length === 25, 'Candidate/manifest fixture count must be exactly 25');

  const provenance = candidate.provenance || {};
  exact(provenance.oracle_source_sha256 === shaFile(oracleSourcePath), 'Native oracle source hash differs from executed source');
  exact(shaFile(frozenTemplatePath) === expectedTemplateSha256 && provenance.frozen_template_sha256 === expectedTemplateSha256, 'Frozen authoritative R template digest differs');
  exact(provenance.fixture_manifest_sha256 === sha(Buffer.from(manifestText)), 'Preserved manifest hash differs');
  exact(provenance.fixture_integrity_sha256 === shaFile(fixtureIntegrityPath), 'Fixture integrity pin SHA-256 differs');
  exact(fixtureIntegrity.manifest_sha256 === provenance.fixture_manifest_sha256 && fixtureIntegrity.fixtures.length === 25, 'Committed fixture integrity pin is inconsistent');
  exact(provenance.renv_lock_sha256 === shaFile(lockPath), 'renv.lock SHA-256 differs');
  exact(provenance.source_package_manifest_sha256 === shaFile(sourceManifestPath), 'CRAN source package integrity manifest SHA-256 differs');
  exact(JSON.stringify(canonical(provenance.source_package_manifest)) === JSON.stringify(canonical(packageManifest)), 'Candidate package provenance differs from committed source package manifest');
  exact(provenance.source_package_manifest?.renv_lock_sha256 === shaFile(lockPath), 'Package manifest does not identify committed renv.lock');
  exact(provenance.source_package_manifest?.package_count === Object.keys(lock.Packages).length, 'Source archive manifest does not cover all locked packages');
  exact(provenance.r_version === '4.6.0', `Unexpected native R version: ${provenance.r_version}`);
  exact(provenance.package_versions?.MatchIt === '4.8.1', 'Native MatchIt version is not 4.8.1');
  exact(provenance.package_versions?.cobalt === '5.0.0', 'Native cobalt version is not 5.0.0');
  const packages = provenance.source_package_manifest.packages || [];
  const packageNames = packages.map(item => item.name);
  exact(new Set(packageNames).size === packageNames.length, 'Source package archive manifest contains duplicate package names');
  exact(packageNames.length === provenance.source_package_manifest.package_count, 'Source package archive manifest has inconsistent package count');
  exact(packages.every(item => /^[0-9a-f]{64}$/.test(item.sha256) && Number.isSafeInteger(item.bytes) && item.bytes > 0), 'A locked CRAN source archive lacks a valid SHA-256 or size');
  const lockedPackages = Object.entries(lock.Packages).map(([name, metadata]) => [name, metadata.Version]).sort(([a], [b]) => a.localeCompare(b));
  const sourcePackages = packages.map(item => [item.name, item.version]).sort(([a], [b]) => a.localeCompare(b));
  exact(JSON.stringify(sourcePackages) === JSON.stringify(lockedPackages), 'CRAN source package versions do not exactly match renv.lock');

  const manifestById = new Map(manifest.fixtures.map(spec => [spec.id, spec]));
  const seen = new Set();
  for (const fixture of candidate.fixtures) {
    exact(manifestById.has(fixture.id), `Unexpected candidate fixture: ${fixture.id}`);
    exact(!seen.has(fixture.id), `Duplicate candidate fixture: ${fixture.id}`);
    seen.add(fixture.id);
    const spec = manifestById.get(fixture.id);
    exact(fixture.manifest_expected_status === spec.expected_status, `Manifest classification changed for ${fixture.id}`);
    const csv = path.join(fixtureRoot, `${fixture.id}.csv`);
    const config = path.join(fixtureRoot, `${fixture.id}.json`);
    const pinned = fixtureIntegrity.fixtures.find(item => item.id === fixture.id);
    exact(Boolean(pinned), `Committed fixture pin missing for ${fixture.id}`);
    exact(fixture.fixture_sha256?.csv === shaFile(csv) && fixture.fixture_sha256?.csv === pinned.csv_sha256, `CSV input hash mismatch for ${fixture.id}`);
    exact(fixture.fixture_sha256?.config === shaFile(config) && fixture.fixture_sha256?.config === pinned.config_sha256, `Configuration hash mismatch for ${fixture.id}`);
    exact(typeof fixture.native_classification === 'string' && fixture.native_classification.length > 0, `Native classification absent for ${fixture.id}`);
    exact(Array.isArray(fixture.input_identity?.row_ids), `Native row identity absent for ${fixture.id}`);
    if (fixture.id === 'fix_24_duplicate_ids') {
      exact(fixture.native_classification === 'NOT_RUN_PRODUCT_POLICY_REJECTION', 'Duplicate-ID fixture must not be computed by native oracle');
    }
  }
  exact(seen.size === manifestById.size && [...manifestById.keys()].every(id => seen.has(id)), 'Candidate fixture IDs do not exactly equal manifest IDs');

  return {
    schema_version: 1,
    evidence_class: 'VALIDATED_CANDIDATE_NATIVE_GOLDEN_PENDING_RED_TEAM',
    status: 'PASS_CANDIDATE_INTEGRITY',
    commit_sha: candidate.commit_sha,
    candidate_file: path.basename(candidatePath),
    candidate_sha256: sha(candidateBytes),
    fixture_count: seen.size,
    fixture_manifest_sha256: provenance.fixture_manifest_sha256,
    fixture_integrity_sha256: provenance.fixture_integrity_sha256,
    native_oracle_source_sha256: provenance.oracle_source_sha256,
    frozen_template_sha256: provenance.frozen_template_sha256,
    renv_lock_sha256: provenance.renv_lock_sha256,
    package_source_manifest_sha256: provenance.source_package_manifest_sha256,
    package_count: provenance.source_package_manifest.package_count,
    r_version: provenance.r_version,
    package_versions: provenance.package_versions,
    reference_is_finally_frozen: false
  };
}

try {
  const { candidate: candidatePath, sidecar: sidecarPath } = cli();
  const candidateBytes = fs.readFileSync(candidatePath);
  const candidate = JSON.parse(candidateBytes.toString('utf8'));
  const sidecar = validate(candidate, candidateBytes, candidatePath);
  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  fs.writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, { flag: 'wx' });
  console.log(`Validated candidate integrity: ${sidecar.candidate_sha256}`);
  console.log(`Fixture IDs and inputs verified: ${sidecar.fixture_count}`);
  console.log('Candidate is not frozen; independent Red Team acceptance remains required.');
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
