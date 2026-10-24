import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const a1 = new URL('.', import.meta.url);
const outdir = resolve(process.env.A1_EVIDENCE_DIR ?? process.argv[2] ?? '');
const matrix = JSON.parse(await readFile(new URL('preregistration-matrix-v1.json', a1), 'utf8'));
const correctionPins = JSON.parse(readFileSync(new URL('fixture-generation-correction-pins-v1.3.json', a1), 'utf8'));
const report = JSON.parse(await readFile(resolve(outdir, 'a1-qualification-results.json'), 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const parseCsvRow = (line) => {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
};

function validateEvidence(candidate) {
  assert.equal(candidate.schema, 'CP-STAT-02-A1-NATIVE-LP-QUALIFICATION-v2');
  assert.equal(candidate.fixtures.length, 50);
  assert.equal(candidate.fixture_generation_execution_correction.correction_sha256, correctionPins.correction_sha256, 'execution correction document digest mismatch');
  assert.equal(candidate.fixture_generation_execution_correction.correction_pins_sha256, sha256(readFileSync(new URL('fixture-generation-correction-pins-v1.3.json', a1))));
  assert.equal(candidate.fixture_generation_execution_correction.correction_path, correctionPins.correction_path);
  assert.deepEqual(candidate.fixture_generation_execution_correction.second_execution, correctionPins.second_execution);
  assert.equal(candidate.fixture_generation_execution_correction.expected_classes_seeds_and_acceptance_rules_changed, false);
  const ids = candidate.fixtures.map((fixture) => fixture.fixture_id);
  assert.equal(new Set(ids).size, 50, 'fixture IDs must be unique');
  assert.deepEqual(ids, matrix.fixtures.map((fixture) => fixture.fixture_id), 'all preregistered IDs must appear once in order');
  const matrixById = new Map(matrix.fixtures.map((fixture) => [fixture.fixture_id, fixture]));
  for (const fixture of candidate.fixtures) {
    const spec = matrixById.get(fixture.fixture_id);
    assert.ok(spec, `unexpected fixture ${fixture.fixture_id}`);
    assert.equal(fixture.expected_separation, spec.expected_separation, `expected class changed for ${fixture.fixture_id}`);
    assert.equal(fixture.expected_product_policy, spec.expected_product_policy, `product policy changed for ${fixture.fixture_id}`);
    assert.match(fixture.input_csv_sha256, /^[a-f0-9]{64}$/);
    assert.match(fixture.spec_sha256, /^[a-f0-9]{64}$/);
    assert.match(fixture.row_order_sha256, /^[a-f0-9]{64}$/);
    assert.match(fixture.response_sha256, /^[a-f0-9]{64}$/);
    const input = readFileSync(resolve(outdir, fixture.input_csv_path));
    assert.equal(sha256(input), fixture.input_csv_sha256, `fixture input hash mismatch: ${fixture.fixture_id}`);
    const inputRows = input.toString('utf8').trimEnd().split(/\r?\n/);
    const inputColumns = parseCsvRow(inputRows[0]);
    assert.equal(inputColumns[0], 'row_id');
    assert.equal(inputColumns[1], 'treat');
    const ids = inputRows.slice(1).map((row) => parseCsvRow(row)[0]);
    const response = inputRows.slice(1).map((row) => parseCsvRow(row)[1]);
    assert.deepEqual(fixture.row_ids, ids, `row identities mismatch: ${fixture.fixture_id}`);
    assert.deepEqual(fixture.response_values.map(String), response, `response values mismatch: ${fixture.fixture_id}`);
    assert.equal(sha256(Buffer.from(ids.join('\n'))), fixture.row_order_sha256, `row order hash mismatch: ${fixture.fixture_id}`);
    assert.equal(sha256(Buffer.from(response.join('\n'))), fixture.response_sha256, `response hash mismatch: ${fixture.fixture_id}`);
    const specRecord = JSON.parse(readFileSync(resolve(outdir, fixture.spec_path), 'utf8'));
    assert.deepEqual(specRecord, spec, `serialized fixture spec changed: ${fixture.fixture_id}`);
    if (spec.expected_separation === 'NOT_CLASSIFIABLE_INVALID_MODEL') {
      assert.equal(fixture.detector_invoked, false, `invalid fixture reached LP: ${fixture.fixture_id}`);
      assert.equal(fixture.detector_runs.length, 0);
      assert.equal(fixture.status, 'PASS');
      continue;
    }
    assert.ok(fixture.ground_truth_proof);
    if (fixture.model_matrix_sha256) {
      const modelPath = resolve(outdir, 'model-matrices', `${fixture.fixture_id}.csv`);
      const modelBytes = readFileSync(modelPath);
      assert.equal(sha256(modelBytes), fixture.model_matrix_sha256, `model-matrix hash mismatch: ${fixture.fixture_id}`);
      const modelRows = modelBytes.toString('utf8').trimEnd().split(/\r?\n/).map(parseCsvRow);
      assert.deepEqual(modelRows[0].slice(1), fixture.model_matrix_columns);
      assert.deepEqual(modelRows.slice(1).map((row) => row[0]), ids, `model-matrix row identities/order mismatch: ${fixture.fixture_id}`);
      assert.equal(fixture.model_matrix_values.length, ids.length);
      fixture.model_matrix_values.forEach((row, index) => {
        assert.ok(row && typeof row === 'object' && !Array.isArray(row));
        assert.deepEqual(Object.keys(row), fixture.model_matrix_columns, `named model-matrix row columns/order mismatch: ${fixture.fixture_id}`);
        assert.ok(Object.values(row).every((value) => typeof value === 'string'));
        assert.deepEqual(fixture.model_matrix_columns.map((column) => row[column]), modelRows[index + 1].slice(1), `named model-matrix numeric values/order mismatch: ${fixture.fixture_id}`);
      });
    }
    if (fixture.ground_truth_proof.proof_ok !== true) {
      assert.equal(fixture.status, 'FAIL', `failed ground truth was not retained as a failure: ${fixture.fixture_id}`);
      assert.equal(fixture.detector_invoked, false, `candidate method ran before ground-truth proof: ${fixture.fixture_id}`);
      assert.ok(fixture.failure_codes.includes('CONSTRUCTIVE_GROUND_TRUTH_FAILED') || fixture.failure_codes.includes('GROUND_TRUTH_PROOF_ERROR'));
      continue;
    }
    if (spec.expected_separation === 'OVERLAP_FINITE_MLE') {
      assert.equal(fixture.ground_truth_proof.anchor_pairs_exact, true, `overlap anchor pairs must remain identical: ${fixture.fixture_id}`);
      assert.equal(fixture.ground_truth_proof.anchor_matrix_rank, fixture.matrix_rank, `overlap anchors must span the observed design: ${fixture.fixture_id}`);
    }
    assert.equal(fixture.detector_invoked, true);
    assert.equal(fixture.detector_runs.length, 4, `two tolerances times two runs required: ${fixture.fixture_id}`);
    assert.ok(fixture.model_matrix_sha256);
    if (spec.expected_design_rank === 'full_rank') assert.equal(fixture.matrix_rank, fixture.model_matrix_columns.length);
    if (spec.expected_design_rank === 'rank_deficient') assert.ok(fixture.matrix_rank < fixture.model_matrix_columns.length);
    assert.ok(['COMPLETE_SEPARATION', 'QUASI_COMPLETE_SEPARATION', 'OVERLAP_FINITE_MLE', 'UNRESOLVED'].includes(fixture.analytic_x1_crosscheck.class));
    assert.equal(fixture.analytic_x1_crosscheck.class, fixture.expected_separation, `analytic x1 check mismatch: ${fixture.fixture_id}`);
    for (const tolerance of [1e-4, 1e-8]) {
      const repeats = fixture.detector_runs.filter((run) => run.tolerance === tolerance);
      assert.equal(repeats.length, 2);
      assert.deepEqual(repeats.map((run) => run.replicate).sort(), [1, 2]);
      assert.equal(new Set(repeats.map((run) => run.execution_id)).size, 2, `replicates were not separately invoked: ${fixture.fixture_id}`);
    }
    for (const run of fixture.detector_runs) {
      assert.equal(typeof run.class, 'string');
      assert.ok(run.direct_solver_probe);
      for (const lp of [run.direct_solver_probe.complete_margin, run.direct_solver_probe.weak_direction]) {
        assert.ok(Number.isInteger(lp.return_code), `solver code missing for ${fixture.fixture_id}`);
        assert.equal([0, 9].includes(lp.return_code), ['OPTIMAL', 'PRESOLVED'].includes(lp.status));
        assert.ok(Array.isArray(lp.threshold_interpretations));
        assert.equal(lp.threshold_interpretations.length, 2);
      }
    }
    const packageMatchesGroundTruth = fixture.detector_runs.every((run) => run.class === fixture.expected_separation);
    const directMatchesGroundTruth = fixture.detector_runs.every((run) => run.direct_probe_assessments.every((item) => item.classification === 'CONSTRUCTIVE_CLASS_SUPPORTED'));
    if (!packageMatchesGroundTruth || !directMatchesGroundTruth || fixture.failure_codes.length > 0) assert.notEqual(fixture.status, 'PASS', `failure concealed for ${fixture.fixture_id}`);
  }
  assert.equal(candidate.counts.preregistered, 50);
  assert.equal(candidate.counts.evaluated, 50);
  assert.equal(candidate.counts.valid_input_models, 48);
  assert.equal(candidate.counts.invalid_input_models, 2);
  assert.equal(candidate.counts.method_evaluated_models, candidate.fixtures.filter((fixture) => fixture.detector_invoked).length);
  assert.equal(candidate.counts.ground_truth_failed, candidate.fixtures.filter((fixture) => fixture.expected_separation !== 'NOT_CLASSIFIABLE_INVALID_MODEL' && fixture.ground_truth_proof?.proof_ok !== true).length);
  assert.equal(candidate.verdict, candidate.fixtures.every((fixture) => fixture.status === 'PASS') && Object.values(candidate.controls).every((value) => value === 'PASS') ? 'PASS' : 'FAIL');
}

test('all 50 preregistered fixtures have preserved identity and output schema', () => {
  validateEvidence(report);
});

test('removing a fixture is rejected', () => {
  const altered = structuredClone(report);
  altered.fixtures.pop();
  assert.throws(() => validateEvidence(altered), assert.AssertionError);
});

test('duplicating a fixture is rejected', () => {
  const altered = structuredClone(report);
  altered.fixtures[1].fixture_id = altered.fixtures[0].fixture_id;
  assert.throws(() => validateEvidence(altered), /unique/);
});

test('changing an expected class is rejected independently of its stored result', () => {
  const altered = structuredClone(report);
  const fixture = altered.fixtures.find((item) => item.expected_separation === 'COMPLETE_SEPARATION');
  fixture.expected_separation = 'OVERLAP_FINITE_MLE';
  assert.throws(() => validateEvidence(altered), /expected class changed/);
});

test('mutating an observed detector class cannot retain a passing fixture status', () => {
  const altered = structuredClone(report);
  const fixture = altered.fixtures.find((item) => item.status === 'PASS' && item.detector_invoked);
  assert.ok(fixture);
  fixture.detector_runs[0].class = fixture.expected_separation === 'COMPLETE_SEPARATION' ? 'OVERLAP_FINITE_MLE' : 'COMPLETE_SEPARATION';
  assert.throws(() => validateEvidence(altered), /failure concealed/);
});

test('an input hash mutation is rejected', () => {
  const altered = structuredClone(report);
  altered.fixtures[0].input_csv_sha256 = '0'.repeat(64);
  assert.throws(() => validateEvidence(altered), /fixture input hash mismatch/);
});

test('invalid inputs remain blocked before LP', () => {
  const altered = structuredClone(report);
  const invalid = altered.fixtures.find((item) => item.expected_separation === 'NOT_CLASSIFIABLE_INVALID_MODEL');
  invalid.detector_invoked = true;
  assert.throws(() => validateEvidence(altered), /invalid fixture reached LP/);
});

test('a lost direct solver status is rejected', () => {
  const altered = structuredClone(report);
  const valid = altered.fixtures.find((item) => item.detector_invoked);
  valid.detector_runs[0].direct_solver_probe.complete_margin.return_code = null;
  assert.throws(() => validateEvidence(altered), /solver code missing/);
});

test('a changed post-run generator-correction hash is rejected', () => {
  const altered = structuredClone(report);
  altered.fixture_generation_execution_correction.correction_sha256 = '0'.repeat(64);
  assert.throws(() => validateEvidence(altered), /execution correction/);
});

test('missing native results produce a checksummed UNMEASURED prequalification index', () => {
  const temp = mkdtempSync(join(tmpdir(), 'cp-stat-02-a1-unmeasured-'));
  try {
    const script = resolve(dirname(fileURLToPath(import.meta.url)), 'build-evidence-index.mjs');
    execFileSync(process.execPath, [script, '--outdir', temp, '--allow-unmeasured'], {
      env: { ...process.env, GITHUB_SHA: 'synthetic-test-sha', GITHUB_RUN_ID: 'synthetic-test-run' },
      stdio: 'pipe',
    });
    const status = JSON.parse(readFileSync(resolve(temp, 'qualification-run-status.json'), 'utf8'));
    const index = JSON.parse(readFileSync(resolve(temp, 'evidence-index.json'), 'utf8'));
    const checksums = readFileSync(resolve(temp, 'SHA256SUMS'), 'utf8');
    assert.equal(status.status, 'UNMEASURED');
    assert.equal(status.evaluated_fixture_count, 0);
    assert.equal(status.preregistered_fixture_count, 50);
    assert.equal(index.verdict, 'UNMEASURED');
    assert.equal(index.result_fixture_count, 0);
    assert.deepEqual(index.evaluated_status_counts, { UNMEASURED: 50 });
    assert.match(checksums, /qualification-run-status\.json$/m);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
