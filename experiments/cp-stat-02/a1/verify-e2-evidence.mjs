import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const arg = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Usage requires ${name} <path>`);
  return resolve(process.argv[index + 1]);
};
const archivePath = arg('--archive');
const evidenceDir = arg('--evidence-dir');
const receiptPath = arg('--output');
const a1Dir = resolve(new URL('.', import.meta.url).pathname);
const repoRoot = resolve(a1Dir, '../../..');
const pins = JSON.parse(await readFile(resolve(repoRoot, 'experiments/cp-webr-02-closure/e3/evidence-pins.json'), 'utf8'));
const expected = pins.e2_scientific_evidence;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fail = (message) => { throw new Error(message); };
const archiveBytes = await readFile(archivePath);
const archiveSha = sha256(archiveBytes);
if (archiveSha !== expected.evidence_archive_sha256) fail(`E2 archive hash mismatch: ${archiveSha}`);

const indexBytes = await readFile(resolve(evidenceDir, 'evidence-index.json'));
if (sha256(indexBytes) !== expected.evidence_index_sha256) fail('E2 internal evidence-index SHA-256 mismatch');
const index = JSON.parse(indexBytes.toString('utf8'));
if (index.commit_sha !== expected.commit_sha || index.workflow_run_id !== expected.workflow_run_id) fail('E2 internal workflow provenance mismatch');
const indexed = new Map(index.files.map((file) => [file.name, file]));
const expectedNames = Object.keys(expected.files).sort();
if (indexed.size !== expectedNames.length || [...indexed.keys()].sort().some((name, i) => name !== expectedNames[i])) fail('E2 indexed file set mismatch');
for (const [name, expectedSha] of Object.entries(expected.files)) {
  const bytes = await readFile(resolve(evidenceDir, name));
  const entry = indexed.get(name);
  if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256 || entry.sha256 !== expectedSha) fail(`E2 indexed file hash mismatch: ${name}`);
}
const commit = (await readFile(resolve(evidenceDir, 'commit-sha.txt'), 'utf8')).trim();
const main = (await readFile(resolve(evidenceDir, 'main-sha.txt'), 'utf8')).trim();
if (commit !== expected.commit_sha || main !== expected.main_sha) fail('E2 commit/main provenance files mismatch');

const comparison = JSON.parse(await readFile(resolve(evidenceDir, 'covariance-comparison.json'), 'utf8'));
if (comparison.schema !== 'CP-WEBR-02-CLOSURE-1-E2-covariance-comparison-v1') fail('E2 comparison schema mismatch');
const target = comparison.fix15_separation_assessment.target;
if (target.length !== 2 || target.some((item) => item.overall !== 'NO' || item.complete !== 'NO' || item.quasi !== 'NO')) fail('Pinned E2 fix15 separation evidence does not match');
if (comparison.fix15_separation_assessment.positive_and_negative_controls_status !== 'PASS') fail('Pinned E2 independent LP controls did not pass');
const complete = comparison.fix15_separation_assessment.fix16_known_complete_fixture;
if (complete.length !== 2 || complete.some((item) => item.overall !== 'YES' || item.complete !== 'YES' || item.quasi !== 'NO')) fail('Pinned E2 fix16 complete-separation evidence does not match');
if (comparison.fix15_separation_assessment.fix16_complete_separation_confirmation !== 'PASS') fail('Pinned E2 fix16 control did not pass');
if (comparison.fix15_separation_assessment.target_tolerance_stability !== 'PASS') fail('Pinned E2 target tolerance stability did not pass');

const receipt = {
  schema: 'CP-STAT-02-A1-E2-PROVENANCE-VERIFICATION-v1',
  status: 'PASS',
  source_workflow_run_id: expected.workflow_run_id,
  source_artifact_id: expected.artifact_id,
  source_commit_sha: expected.commit_sha,
  artifact_digest: expected.artifact_digest,
  evidence_archive_sha256: archiveSha,
  evidence_index_sha256: sha256(indexBytes),
  indexed_file_count: indexed.size,
  fix15_lp: target.map(({ tolerance, overall, complete, quasi }) => ({ tolerance, overall, complete, quasi })),
  fix16_lp: complete.map(({ tolerance, overall, complete, quasi }) => ({ tolerance, overall, complete, quasi })),
  positive_and_negative_controls_status: comparison.fix15_separation_assessment.positive_and_negative_controls_status,
  fix16_complete_separation_confirmation: comparison.fix15_separation_assessment.fix16_complete_separation_confirmation,
  target_tolerance_stability: comparison.fix15_separation_assessment.target_tolerance_stability,
};
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`PASS: verified E2 archive ${receipt.evidence_archive_sha256}; ${indexed.size} indexed files; fix15 no separation and fix16 complete separation retained.\n`);
