import { createHash } from 'node:crypto';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve, sep } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };
const outputArg = process.argv.indexOf('--outdir');
if (outputArg < 0 || !process.argv[outputArg + 1]) fail('Usage: node build-evidence-index.mjs --outdir <evidence-directory>');
const outdir = resolve(process.argv[outputArg + 1]);
const allowUnmeasured = process.argv.includes('--allow-unmeasured');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const matrix = await readJson(resolve(here, 'preregistration-matrix-v1.json'));
const pins = await readJson(resolve(here, 'preregistration-pins-v1.json'));
const clarificationPins = await readJson(resolve(here, 'fixture-generation-clarification-pins-v1.1.json'));
const resultsPath = resolve(outdir, 'a1-qualification-results.json');
if (clarificationPins.matrix_sha256 !== pins.preregistration_matrix.sha256 || clarificationPins.base_generation_contract_sha256 !== pins.fixture_generation_contract.sha256) fail('Generation clarification pin does not match the original preregistration');
if (clarificationPins.original_preregistration_pins_sha256 !== sha256(await readFile(resolve(here, 'preregistration-pins-v1.json'))) || clarificationPins.hypotheses_expected_classes_seeds_and_acceptance_rules_changed !== false) fail('Generation clarification changed or lost the original preregistration pin');
if (clarificationPins.clarification_sha256 !== sha256(await readFile(resolve(here, clarificationPins.clarification_path.split('/').at(-1))))) fail('Generation clarification SHA-256 mismatch');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const absolute = resolve(dir, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(absolute));
    else if (entry.isFile()) paths.push(absolute);
  }
  return paths;
}

const sourcePaths = [
  'qualification.R',
  'verify-source-archives.mjs',
  'verify-e2-evidence.mjs',
  'build-evidence-index.mjs',
  'qualification-evidence.test.mjs',
  'preregistration-matrix-v1.json',
  'preregistration-pins-v1.json',
  'fixture-generation-clarification-pins-v1.1.json',
  'fixture-generation-contract-v1.md',
  'fixture-generation-clarifications-v1.1.md',
  'CP-STAT-02-A1-PROTOCOL-v1.md',
  'CP-WEBR-02-INDEPENDENT-CLOSURE-VERIFICATION-v1.md',
  'solver-status-probe-preregistration-v1.md',
  'solver-status-probe-pins-v1.json',
  'renv.lock',
  'source-package-integrity.json',
];
const sourceDigests = {};
for (const path of sourcePaths) sourceDigests[path] = sha256(await readFile(resolve(here, path)));
sourceDigests['.github/workflows/experiment-cp-stat-02-a1.yml'] = sha256(await readFile(resolve(here, '../../../.github/workflows/experiment-cp-stat-02-a1.yml')));

if (matrix.fixtures.length !== 50) fail('Expected exactly 50 preregistered fixtures');
try {
  await access(resultsPath);
} catch (error) {
  if (error.code !== 'ENOENT' || !allowUnmeasured) throw error;
  const status = {
    schema: 'CP-STAT-02-A1-PREQUALIFICATION-STATUS-v1',
    status: 'UNMEASURED',
    reason: 'Native qualification did not produce its results file; inspect workflow logs for the earlier failed step.',
    commit_sha: process.env.GITHUB_SHA ?? null,
    workflow_run_id: process.env.GITHUB_RUN_ID ?? null,
    preregistered_fixture_count: matrix.fixtures.length,
    evaluated_fixture_count: 0,
    expected_matrix_sha256: pins.preregistration_matrix.sha256,
    method_result: 'NOT_RUN_OR_NOT_REPORTED',
  };
  await writeFile(resolve(outdir, 'qualification-run-status.json'), `${JSON.stringify(status, null, 2)}\n`);
  const checksumPath = resolve(outdir, 'SHA256SUMS');
  const existingFiles = (await walk(outdir)).filter((path) => path !== checksumPath && !path.endsWith(`${sep}evidence-index.json`)).sort();
  const checksumLines = [];
  for (const path of existingFiles) checksumLines.push(`${sha256(await readFile(path))}  ${relative(outdir, path).split(sep).join('/')}`);
  await writeFile(checksumPath, `${checksumLines.join('\n')}\n`);
  const indexedFiles = (await walk(outdir)).filter((path) => !path.endsWith(`${sep}evidence-index.json`)).sort();
  const index = {
    schema: 'CP-STAT-02-A1-EVIDENCE-INDEX-v1',
    evidence_class: 'EXPERIMENTAL_NATIVE_R_METHOD_QUALIFICATION_NOT_PRODUCTION',
    verdict: 'UNMEASURED',
    commit_sha: process.env.GITHUB_SHA ?? null,
    workflow_run_id: process.env.GITHUB_RUN_ID ?? null,
    workflow_attempt: process.env.GITHUB_RUN_ATTEMPT ?? 'LOCAL',
    phase_baseline_sha: pins.phase_baseline_sha,
    fixture_count: 50,
    result_fixture_count: 0,
    evaluated_status_counts: { UNMEASURED: 50 },
    preregistered_matrix_sha256: pins.preregistration_matrix.sha256,
    generator_contract_sha256: pins.fixture_generation_contract.sha256,
    generator_clarification_sha256: clarificationPins.clarification_sha256,
    scientific_protocol_sha256: pins.scientific_protocol.sha256,
    source_digests: sourceDigests,
    files: await Promise.all(indexedFiles.map(async (path) => ({
      path: relative(outdir, path).split(sep).join('/'),
      bytes: (await readFile(path)).length,
      sha256: sha256(await readFile(path)),
    }))),
  };
  await writeFile(resolve(outdir, 'evidence-index.json'), `${JSON.stringify(index, null, 2)}\n`);
  process.stdout.write('Evidence index records all 50 fixtures as UNMEASURED; no scientific outcome is inferred.\n');
  process.exit(0);
}

const results = await readJson(resultsPath);
if (results.fixtures?.length !== 50) fail('Expected exactly 50 reported fixtures');
const expectedIds = matrix.fixtures.map((fixture) => fixture.fixture_id);
const resultIds = results.fixtures.map((fixture) => fixture.fixture_id);
if (new Set(expectedIds).size !== 50 || new Set(resultIds).size !== 50) fail('Fixture identity is duplicated');
if (expectedIds.some((id, index) => resultIds[index] !== id)) fail('Result fixture order or identity differs from preregistration');
if (results.commit_sha !== (process.env.GITHUB_SHA ?? results.commit_sha)) fail('Qualification report commit SHA differs from workflow commit');
if (String(results.workflow_run_id) !== (process.env.GITHUB_RUN_ID ?? String(results.workflow_run_id))) fail('Qualification report workflow run ID differs from CI');

const resultById = new Map(results.fixtures.map((fixture) => [fixture.fixture_id, fixture]));
let validCount = 0;
let invalidCount = 0;
for (const spec of matrix.fixtures) {
  const record = resultById.get(spec.fixture_id);
  const inputPath = resolve(outdir, record.input_csv_path ?? '');
  const specPath = resolve(outdir, record.spec_path ?? '');
  if (!inputPath.startsWith(`${outdir}${sep}`) || !specPath.startsWith(`${outdir}${sep}`)) fail(`Unsafe or absent output path for ${spec.fixture_id}`);
  const inputBytes = await readFile(inputPath);
  const specBytes = await readFile(specPath);
  if (sha256(inputBytes) !== record.input_csv_sha256) fail(`Input fixture SHA mismatch: ${spec.fixture_id}`);
  if (sha256(specBytes) !== record.spec_sha256) fail(`Fixture spec SHA mismatch: ${spec.fixture_id}`);
  if (!/^[a-f0-9]{64}$/.test(record.row_order_sha256) || !/^[a-f0-9]{64}$/.test(record.response_sha256)) fail(`Missing row or response digest: ${spec.fixture_id}`);
  if (spec.expected_separation === 'NOT_CLASSIFIABLE_INVALID_MODEL') {
    invalidCount += 1;
    if (record.detector_invoked !== false || record.status !== 'PASS') fail(`Invalid fixture reached candidate method: ${spec.fixture_id}`);
  } else {
    validCount += 1;
    if (record.detector_invoked !== true || !record.model_matrix_sha256 || record.detector_runs?.length !== 4) fail(`Missing valid-model evidence: ${spec.fixture_id}`);
    const modelPath = resolve(outdir, 'model-matrices', `${spec.fixture_id}.csv`);
    if (sha256(await readFile(modelPath)) !== record.model_matrix_sha256) fail(`Model-matrix SHA mismatch: ${spec.fixture_id}`);
  }
}
if (validCount !== 48 || invalidCount !== 2) fail(`Unexpected valid/invalid scenario counts: ${validCount}/${invalidCount}`);

const checksumPath = resolve(outdir, 'SHA256SUMS');
const existingFiles = (await walk(outdir)).filter((path) => path !== checksumPath && !path.endsWith(`${sep}evidence-index.json`)).sort();
const checksumLines = [];
for (const path of existingFiles) checksumLines.push(`${sha256(await readFile(path))}  ${relative(outdir, path).split(sep).join('/')}`);
await writeFile(checksumPath, `${checksumLines.join('\n')}\n`);

const indexedFiles = (await walk(outdir)).filter((path) => !path.endsWith(`${sep}evidence-index.json`)).sort();
const index = {
  schema: 'CP-STAT-02-A1-EVIDENCE-INDEX-v1',
  evidence_class: 'EXPERIMENTAL_NATIVE_R_METHOD_QUALIFICATION_NOT_PRODUCTION',
  verdict: results.verdict,
  commit_sha: process.env.GITHUB_SHA ?? results.commit_sha,
  workflow_run_id: process.env.GITHUB_RUN_ID ?? results.workflow_run_id,
  workflow_attempt: process.env.GITHUB_RUN_ATTEMPT ?? 'LOCAL',
  phase_baseline_sha: pins.phase_baseline_sha,
  fixture_count: 50,
  result_fixture_count: results.fixtures.length,
  evaluated_status_counts: results.counts.status,
  preregistered_matrix_sha256: pins.preregistration_matrix.sha256,
  generator_contract_sha256: pins.fixture_generation_contract.sha256,
  generator_clarification_sha256: clarificationPins.clarification_sha256,
  scientific_protocol_sha256: pins.scientific_protocol.sha256,
  solver_probe_preregistration_sha256: pins.solver_probe?.sha256 ?? sha256(await readFile(resolve(here, 'solver-status-probe-preregistration-v1.md'))),
  source_digests: sourceDigests,
  files: await Promise.all(indexedFiles.map(async (path) => ({
    path: relative(outdir, path).split(sep).join('/'),
    bytes: (await readFile(path)).length,
    sha256: sha256(await readFile(path)),
  }))),
};
await writeFile(resolve(outdir, 'evidence-index.json'), `${JSON.stringify(index, null, 2)}\n`);
process.stdout.write(`Evidence index recorded ${index.files.length} files for ${validCount} valid and ${invalidCount} invalid fixtures. Verdict=${results.verdict}\n`);
