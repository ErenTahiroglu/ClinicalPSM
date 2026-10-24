#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PINS_PATH = path.join(HERE, 'evidence-pins.json');
const RATIFICATION_PATH = path.join(HERE, 'CP-WEBR-02-RATIFICATION-v1.md');
const CP_STAT_INVENTORY_PATH = path.join(HERE, 'CP-STAT-02-STARTING-INVENTORY.md');
const AMENDMENT_PATH = path.join(ROOT, 'experiments/cp-webr-02-closure/e4/CP-WEBR-02-SCIENTIFIC-EQUIVALENCE-AMENDMENT-v1.md');

export function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function requireValue(value, label, message) {
  if (!value) throw new Error(`${label}: ${message}`);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function findFile(directory, name) {
  const matches = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === name) matches.push(full);
    }
  };
  walk(directory);
  requireValue(matches.length === 1, `artifact.${name}`, `expected one file, found ${matches.length}`);
  return matches[0];
}

function verifySha256Manifest(directory, manifestName, expectedManifestSha) {
  const manifestPath = path.join(directory, manifestName);
  requireValue(fs.existsSync(manifestPath), manifestName, 'manifest missing from artifact root');
  const manifestBytes = fs.readFileSync(manifestPath);
  assertEqual(sha256(manifestBytes), expectedManifestSha, `${manifestName}.sha256`);
  const base = path.dirname(manifestPath);
  const lines = manifestBytes.toString('utf8').trim().split(/\r?\n/);
  requireValue(lines.length > 0, manifestName, 'empty SHA256 manifest');
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    requireValue(match, manifestName, `invalid line ${line}`);
    const resolved = path.resolve(base, match[2]);
    requireValue(resolved.startsWith(`${base}${path.sep}`), manifestName, `unsafe path ${match[2]}`);
    assertEqual(sha256(fs.readFileSync(resolved)), match[1], `${manifestName}.${match[2]}`);
  }
  return { manifest_path: manifestPath, entries_verified: lines.length, sha256: sha256(manifestBytes) };
}

export function validateStrictComparison(report, pins) {
  assertEqual(report.commit_sha, pins.required_baseline_sha, 'strict.commit_sha');
  assertEqual(report.status, 'FAIL', 'strict.status');
  assertEqual(report.summary, {
    manifest_fixture_count: 25,
    compared_fixture_count: 25,
    passing_fixture_count: 23,
    failing_fixture_count: 2,
    numerical_comparison_count: 16047,
    numerical_pass_count: 16044,
    numerical_fail_count: 3,
    baseline_failure_count: 4,
    negative_control_count: 18,
    negative_control_status: 'PASS'
  }, 'strict.summary');
  requireValue(Array.isArray(report.fixtures) && report.fixtures.length === 25, 'strict.fixtures', 'expected all 25 fixtures');
  const expectedIds = pins.fixture_ids;
  assertEqual(report.fixtures.map(row => row.id), expectedIds, 'strict.fixture_ids');
  const failedFixtures = report.fixtures.filter(row => row.status === 'FAIL').map(row => row.id);
  assertEqual(failedFixtures, ['fix_15_quasi_separation', 'fix_16_complete_separation'], 'strict.failed_fixture_ids');
  assertEqual(report.failures.length, 4, 'strict.failures.length');
  assertEqual(report.failures[0], pins.expected_strict_failures[0], 'strict.fix15_failure');
  const numericFailures = report.numeric_comparisons.filter(row => row.status === 'FAIL');
  assertEqual(numericFailures.length, 3, 'strict.numeric_failures.length');
  assertEqual(numericFailures.map(row => ({
    name: row.name,
    actual: row.actual,
    reference: row.reference,
    absolute_difference: row.absolute_difference,
    tolerance: row.tolerance,
    status: row.status
  })), pins.ratification_strict_numeric_failures, 'strict.raw_numeric_failure_matrix');
  assertEqual(report.failures.slice(1).map(text => text.split(':difference=')[0]), pins.expected_strict_failures.slice(1), 'strict.numeric_failure_paths');
  assertEqual(report.negative_controls.status, 'PASS', 'strict.negative_controls.status');
  assertEqual(report.negative_controls.count, 18, 'strict.negative_controls.count');
  assertEqual(report.negative_controls.controls.length, 18, 'strict.negative_controls.controls');
  assertEqual(report.negative_controls.controls.map(row => row.name), pins.current_strict_negative_control_names, 'strict.negative_controls.names');
  requireValue(report.negative_controls.controls.every(row => row.status === 'PASS'), 'strict.negative_controls', 'a comparator negative control failed');
  const warningRow = report.warning_diagnostic_distinctions.find(row => row.id === 'fix_15_quasi_separation');
  requireValue(warningRow, 'strict.fix15.warning_record', 'fix15 warning ledger missing');
  assertEqual(warningRow.preserved_manifest_classification, 'SUCCESS_WITH_WARNING', 'strict.fix15.manifest');
  assertEqual(warningRow.native_warning_messages, { glm: [], matchit: [], cobalt_raw: [], cobalt_std: [] }, 'strict.fix15.native_warnings');
  return { fixture_count: 25, failed_fixture_ids: failedFixtures, numeric_failures: numericFailures, negative_controls: 18 };
}

export function validateScientificClassification(e3, e4, pins) {
  const expectedCounts = pins.ratification_counts;
  assertEqual(e3.fixture_adjudications.length, 25, 'e3.fixture_adjudications.length');
  assertEqual(e3.fixture_adjudications.map(row => row.fixture_id), pins.fixture_ids, 'e3.fixture_ids');
  const counts = {
    NUMERICAL_AND_STRUCTURAL_PARITY_PASS: 0,
    EXPECTED_ERROR_OR_POLICY_PARITY_PASS: 0,
    HISTORICAL_WARNING_CONTRACT_EXCEPTION: 0,
    NON_IDENTIFIABLE_INFERENCE_RESTRICTED: 0
  };
  for (const row of e3.fixture_adjudications) {
    requireValue(Object.hasOwn(counts, row.outcome), `e3.${row.fixture_id}.outcome`, 'unexpected or unmeasured classification');
    counts[row.outcome] += 1;
  }
  assertEqual(counts, {
    NUMERICAL_AND_STRUCTURAL_PARITY_PASS: 18,
    EXPECTED_ERROR_OR_POLICY_PARITY_PASS: 5,
    HISTORICAL_WARNING_CONTRACT_EXCEPTION: 1,
    NON_IDENTIFIABLE_INFERENCE_RESTRICTED: 1
  }, 'e3.classification_counts');
  assertEqual(e4.summary.total_fixtures_evaluated, expectedCounts.total, 'e4.total');
  assertEqual(e4.summary.ordinary_scientific_parity_passes, expectedCounts.ordinary_parity, 'e4.ordinary');
  assertEqual(e4.summary.expected_policy_error_passes, expectedCounts.expected_policy_error, 'e4.policy');
  assertEqual(e4.summary.erratum_dependent_exceptions, 2, 'e4.exceptions');
  assertEqual(e4.summary.frozen_numerical_failures, 3, 'e4.numeric_failures');
  assertEqual(e4.summary.aggregate_numerical_parity_pass, false, 'e4.aggregate_parity');
  assertEqual(e4.fix16.publication_restriction, 'OUTPUT_GENERATION_RESTRICTED', 'e4.fix16.publication_restriction');
  assertEqual(e4.fix16.covariance_causal_explanation, 'UNRESOLVED', 'e4.fix16.covariance_cause');
  assertEqual(e4.fix16.original_numeric_failures_remain_fail, true, 'e4.fix16.raw_failures');
  assertEqual(e4.original_numerical_comparison.numeric_failures, 3, 'e4.strict.numeric_failures');
  assertEqual(e4.outcomes.original_numerical_parity, 'FAIL', 'e4.strict.outcome');
  assertEqual(e4.outcomes.fix16_publication_safety, 'PASS_RESTRICTION_PRESERVED', 'e4.publication.outcome');
  assertEqual(e4.negative_control_audit.length, 19, 'e4.negative_controls.length');
  assertEqual(e4.negative_control_audit.map(row => row.name), pins.e3_negative_control_names, 'e4.negative_controls.names');
  assertEqual(e3.negative_controls.map(row => row.name), pins.e3_negative_control_names, 'e3.negative_controls.names');
  requireValue(e3.negative_controls.every(row => row.status === 'PASS_REJECTED'), 'e3.negative_controls', 'one E3 negative control did not reject its mutation');
  requireValue(e4.negative_control_audit.every(row => row.E3_mutation_result === 'PASS_REJECTED'), 'e4.negative_controls', 'one archived E3 mutation did not reject');
  requireValue(e4.negative_control_audit.every(row => ['PASS', 'FULL_ARCHIVED_EVIDENCE_VALIDATOR'].includes(row.direct_falsification_status)), 'e4.negative_controls', 'one required E3 negative control lacks a passing verifier');
  assertEqual(e4.direct_falsification_tests.failed, 0, 'e4.direct_tests.failed');
  assertEqual(e4.direct_falsification_tests.passed, 33, 'e4.direct_tests.passed');
  assertEqual(e4.direct_falsification_tests.tests, 33, 'e4.direct_tests.count');
  const fix15 = e3.fixture_adjudications.find(row => row.fixture_id === 'fix_15_quasi_separation');
  const fix16 = e3.fixture_adjudications.find(row => row.fixture_id === 'fix_16_complete_separation');
  assertEqual(fix15.outcome, 'HISTORICAL_WARNING_CONTRACT_EXCEPTION', 'e3.fix15.outcome');
  assertEqual(fix16.outcome, 'NON_IDENTIFIABLE_INFERENCE_RESTRICTED', 'e3.fix16.outcome');
  assertEqual(e3.fix15.proposal, 'OBSERVED_SUCCESS_WITHOUT_SEPARATION_WARNING', 'e3.fix15.proposal');
  assertEqual(e3.fix15.historical_manifest_unchanged, 'SUCCESS_WITH_WARNING / SEPARATION_WARNING', 'e3.fix15.historical_manifest');
  assertEqual(e3.fix15.historical_assertion_matrix_unchanged, 'OUTPUT_READY', 'e3.fix15.assertion_matrix');
  assertEqual(e3.fix15.lp.positive_and_negative_controls_status, 'PASS', 'e3.fix15.lp_controls');
  assertEqual(e3.fix15.lp.warning_capture_positive_control.capture_status, 'PASS', 'e3.fix15.warning_capture');
  assertEqual(e3.fix15.lp.target.map(row => [row.tolerance, row.overall, row.complete, row.quasi]), [[0.0001, 'NO', 'NO', 'NO'], [1e-8, 'NO', 'NO', 'NO']], 'e3.fix15.lp_target');
  assertEqual(e3.fix16.mathematical_classification, 'COMPLETE_SEPARATION_NO_FINITE_MLE', 'e3.fix16.mathematics');
  assertEqual(e3.fix16.lp.map(row => [row.tolerance, row.overall, row.complete, row.quasi, row.finite.every(term => term.finite_mle === false)]), [[0.0001, 'YES', 'YES', 'NO', true], [1e-8, 'YES', 'YES', 'NO', true]], 'e3.fix16.lp');
  assertEqual(e3.fix16.publication_restriction, 'OUTPUT_GENERATION_RESTRICTED', 'e3.fix16.publication');
  assertEqual(e3.fix16.production_worker_anchor.status, 'PASS', 'e3.fix16.worker_anchor');
  assertEqual(e3.fix16.production_worker_anchor.publication_verdict_preserved_as_anchor, 'OUTPUT_GENERATION_RESTRICTED', 'e3.fix16.worker_anchor.publication');
  assertEqual(e3.fix16.covariance.causal_explanation, 'UNRESOLVED', 'e3.fix16.covariance_cause');
  return { counts, e3_negative_controls: 19, direct_falsification_tests: 33 };
}

function verifyCurrentArchive(directory, pins) {
  const metadataPath = findFile(directory, 'cp-webr-02-closure-evidence.tar.gz.metadata.json');
  const metadata = readJson(metadataPath);
  assertEqual(metadata.commit_sha, pins.required_baseline_sha, 'current_archive.commit_sha');
  assertEqual(metadata.github_actions_run_id, pins.required_baseline_workflows.strict_closure.workflow_run_id, 'current_archive.run_id');
  assertEqual(metadata.archive_sha256, pins.required_baseline_workflows.strict_closure.evidence_archive_sha256, 'current_archive.sha256');
  assertEqual(metadata.archive_size_bytes, pins.required_baseline_workflows.strict_closure.evidence_archive_size_bytes, 'current_archive.size');
  const archivePath = findFile(directory, 'cp-webr-02-closure-evidence.tar.gz');
  assertEqual(sha256(fs.readFileSync(archivePath)), metadata.archive_sha256, 'current_archive.bytes');
  const sidecar = findFile(directory, 'cp-webr-02-closure-evidence.tar.gz.sha256');
  requireValue(fs.readFileSync(sidecar, 'utf8').includes(metadata.archive_sha256), 'current_archive.sidecar', 'archive checksum sidecar does not match');
  const unpacked = path.resolve(directory, '../current-evidence-unpacked');
  requireValue(fs.existsSync(unpacked), 'current_archive.unpacked', 'archive was not extracted');
  const indexPath = findFile(unpacked, 'evidence-index.json');
  assertEqual(sha256(fs.readFileSync(indexPath)), metadata.evidence_index_sha256, 'current_archive.index_sha256');
  const index = readJson(indexPath);
  assertEqual(index.commit_sha, pins.required_baseline_sha, 'current_archive.index.commit_sha');
  assertEqual(index.github_actions_run_id, pins.required_baseline_workflows.strict_closure.workflow_run_id, 'current_archive.index.run_id');
  for (const [relative, expected] of Object.entries(index.files_sha256 || {})) {
    const source = path.join(path.dirname(indexPath), relative);
    assertEqual(sha256(fs.readFileSync(source)), expected, `current_archive.files_sha256.${relative}`);
  }
  assertEqual(index.candidate_reference_is_not_frozen, true, 'current_archive.candidate_not_frozen');
  assertEqual(index.fixture_count, 25, 'current_archive.fixture_count');
  assertEqual(index.baseline_failure_count, 4, 'current_archive.baseline_failure_count');
  const requiredGateStatus = {
    exact_native_R_4_6_0: 'PASS',
    exact_MatchIt_4_8_1: 'PASS',
    exact_cobalt_5_0_0: 'PASS',
    official_CRAN_source_archive_hashes: 'PASS',
    preserved_25_fixture_input_hashes: 'PASS',
    native_oracle_generation: 'PASS_CANDIDATE_PENDING_REVIEW',
    candidate_reference_integrity: 'PASS',
    static_application_build: 'PASS',
    production_dedicated_worker_chromium_execution: 'PASS',
    native_vs_worker_parity_and_classifications: 'FAIL',
    comparator_negative_controls: 'PASS',
    nominal_network_privacy: 'PASS',
    nested_webr_worker_http_interception: 'MEASURED',
    page_egress_positive_control: 'PASS',
    worker_egress_positive_control: 'PASS',
    e1_chromium_security_csp_network_storage_regression: 'PASS',
    websocket_monitoring: 'UNMEASURED',
    webtransport_monitoring: 'UNMEASURED',
    non_chromium_release_qualification: 'UNMEASURED',
    automated_separation_safety: 'BLOCKED',
    production_licensing_clearance: 'BLOCKED',
    final_scientific_reference_acceptance: 'PENDING_INDEPENDENT_RED_TEAM'
  };
  for (const [key, expected] of Object.entries(requiredGateStatus)) assertEqual(index.gate_status?.[key], expected, `current_archive.gate_status.${key}`);
  assertEqual(index.privacy?.websocket, 'UNMEASURED', 'current_archive.privacy.websocket');
  assertEqual(index.privacy?.webtransport, 'UNMEASURED', 'current_archive.privacy.webtransport');
  return { archive_sha256: metadata.archive_sha256, index_sha256: metadata.evidence_index_sha256, entries_verified: Object.keys(index.files_sha256 || {}).length, current_candidate_sha256: index.files_sha256['native-reference-candidate.json'] };
}

function validateArtifactMetadata(metadata, pins) {
  const expected = [
    ['12501434045', pins.source_evidence.e1_worker],
    ['12532397023', pins.source_evidence.e2],
    ['12533809065', pins.source_evidence.e3],
    ['12536466975', pins.source_evidence.e4],
    ['12535595517', pins.historical_strict],
    ['12534797742', pins.historical_strict],
    ['12537164468', pins.required_baseline_workflows.strict_closure],
    ['12538240630', pins.required_baseline_workflows.strict_closure]
  ];
  for (const [id, pin] of expected) {
    const item = metadata.artifacts[id];
    const comparisonArtifact = ['12535595517', '12537164468'].includes(id);
    const expectedDigest = pin.artifact_digest || (comparisonArtifact ? pin.comparison_artifact_digest : pin.evidence_artifact_digest);
    const expectedSize = pin.artifact_size_bytes || (comparisonArtifact ? pin.comparison_artifact_size_bytes : pin.evidence_artifact_size_bytes);
    requireValue(item, `artifact_metadata.${id}`, 'artifact metadata missing');
    assertEqual(String(item.id), id, `artifact_metadata.${id}.id`);
    assertEqual(item.expired, false, `artifact_metadata.${id}.expired`);
    assertEqual(item.digest, expectedDigest, `artifact_metadata.${id}.digest`);
    assertEqual(item.size_in_bytes, expectedSize, `artifact_metadata.${id}.size`);
    assertEqual(String(item.workflow_run?.id), String(pin.workflow_run_id), `artifact_metadata.${id}.run_id`);
    assertEqual(item.workflow_run?.head_sha, pin.commit_sha || pin.source_commit_sha, `artifact_metadata.${id}.head_sha`);
    const expectedName = pin.artifact_name || (comparisonArtifact ? pin.comparison_artifact_name : pin.evidence_artifact_name);
    assertEqual(item.name, expectedName, `artifact_metadata.${id}.name`);
  }
}

function validateRunMetadata(metadata, pins) {
  const expected = [
    ['39954671878', 'failure'],
    ['40021019295', 'success'],
    ['40030723272', 'success'],
    ['40030723201', 'failure'],
    ['40034455633', 'failure'], ['40034455858', 'success'], ['40034455827', 'success'], ['40034455721', 'success'],
  ];
  for (const [id, conclusion] of expected) {
    const run = metadata.runs[id];
    requireValue(run, `run_metadata.${id}`, 'run metadata missing');
    assertEqual(String(run.id), id, `run_metadata.${id}.id`);
    assertEqual(run.head_branch, 'development', `run_metadata.${id}.branch`);
    assertEqual(run.conclusion, conclusion, `run_metadata.${id}.conclusion`);
    assertEqual(run.status, 'completed', `run_metadata.${id}.status`);
  }
  const sourceShas = {
    '39954671878': pins.source_evidence.e1_worker.source_commit_sha,
    '40021019295': pins.source_evidence.e2.commit_sha,
    '40030723272': pins.source_evidence.e3.commit_sha,
    '40030723201': pins.historical_strict.commit_sha
  };
  for (const [id, sha] of Object.entries(sourceShas)) assertEqual(metadata.runs[id].head_sha, sha, `run_metadata.${id}.sha`);
  for (const id of ['40034455633', '40034455858', '40034455827', '40034455721']) assertEqual(metadata.runs[id].head_sha, pins.required_baseline_sha, `run_metadata.${id}.sha`);
  assertEqual(metadata.runs['40030723201'].head_sha, pins.historical_strict.commit_sha, 'run_metadata.historical_strict.sha');
}

export function validateStrictWorkflowJobs(jobsResponse) {
  const jobs = jobsResponse.jobs;
  requireValue(Array.isArray(jobs), 'strict_run.jobs', 'jobs response is missing');
  const expected = [
    ['Gate A exact native R and package provisioning', 'success'],
    ['Generate and validate native candidate across 25 fixtures', 'success'],
    ['Static build, Chromium Worker, privacy and regressions', 'success'],
    ['Native versus Chromium parity, falsification and evidence package', 'failure'],
    ['Aggregate required gate states', 'success']
  ];
  assertEqual(jobs.map(job => [job.name, job.conclusion]), expected, 'strict_run.jobs.conclusions');
  const failedJobs = jobs.filter(job => job.conclusion === 'failure');
  assertEqual(failedJobs.length, 1, 'strict_run.failed_jobs.length');
  assertEqual(failedJobs[0].steps.filter(step => step.conclusion === 'failure').map(step => step.name), ['Compare all fixtures and execute negative controls'], 'strict_run.failed_steps');
  return expected.map(([name, conclusion]) => ({ name, conclusion }));
}

function verifyFrozenHashes(pins, recordSha) {
  const e4PinsPath = path.join(ROOT, 'experiments/cp-webr-02-closure/e4/evidence-pins.json');
  assertEqual(sha256(fs.readFileSync(e4PinsPath)), pins.e4_pins_sha256, 'e4_pins.sha256');
  const e4Pins = readJson(e4PinsPath);
  const checks = [
    ['docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md', pins.original_roadmap_sha256],
    ['experiments/cp-webr-02a/fixtures/fixtures_manifest.json', pins.frozen.fixture_manifest_sha256],
    ['experiments/cp-webr-02a/adapter/r_template.R', pins.frozen.template_sha256],
    ['experiments/cp-webr-02a/r1.2a/FIXTURE-ASSERTION-MATRIX.json', pins.frozen.assertion_matrix_sha256],
    ['experiments/cp-webr-02-closure/native_oracle.R', pins.frozen.native_oracle_source_sha256],
    ['experiments/cp-webr-02-closure/e4/CP-WEBR-02-SCIENTIFIC-EQUIVALENCE-AMENDMENT-v1.md', pins.amendment_sha256],
    ['experiments/cp-webr-02-closure/ratification-v1/CP-WEBR-02-RATIFICATION-v1.md', recordSha]
  ];
  for (const [relative, expected] of checks) assertEqual(sha256(fs.readFileSync(path.join(ROOT, relative))), expected, `frozen.${relative}`);
  const fixtureIntegrityPath = path.join(ROOT, 'experiments/cp-webr-02-closure/fixture-integrity.json');
  assertEqual(sha256(fs.readFileSync(fixtureIntegrityPath)), pins.frozen.fixture_integrity_sha256, 'fixture_integrity.sha256');
  const fixtureIntegrity = readJson(fixtureIntegrityPath);
  assertEqual(fixtureIntegrity.manifest_sha256, pins.frozen.fixture_manifest_sha256, 'fixture_integrity.manifest');
  assertEqual(fixtureIntegrity.fixture_count, 25, 'fixture_integrity.count');
  assertEqual(fixtureIntegrity.fixtures.map(row => row.id), pins.fixture_ids, 'fixture_integrity.ids');
  for (const fixture of fixtureIntegrity.fixtures) {
    const csv = path.join(ROOT, 'experiments/cp-webr-02a/fixtures', `${fixture.id}.csv`);
    const config = path.join(ROOT, 'experiments/cp-webr-02a/fixtures', `${fixture.id}.json`);
    assertEqual(sha256(fs.readFileSync(csv)), fixture.csv_sha256, `fixture.${fixture.id}.csv_sha256`);
    assertEqual(sha256(fs.readFileSync(config)), fixture.config_sha256, `fixture.${fixture.id}.config_sha256`);
  }
  assertEqual(e4Pins.amendment_sha256, pins.amendment_sha256, 'e4_pins.amendment');
  const pkg = readJson(path.join(ROOT, 'package.json'));
  const lock = readJson(path.join(ROOT, 'package-lock.json'));
  const webr = readJson(path.join(ROOT, 'experiments/cp-webr-00b/dependency-lock.json'));
  const renv = readJson(path.join(ROOT, 'experiments/cp-webr-02-closure/renv.lock'));
  assertEqual([pkg.dependencies.next, pkg.devDependencies['eslint-config-next'], lock.packages['node_modules/next'].version, lock.packages['node_modules/eslint-config-next'].version], ['16.4.1', '16.4.1', '16.4.1', '16.4.1'], 'toolchain.next');
  assertEqual([webr.runtime.webr_npm, webr.runtime.r_version, renv.Packages.MatchIt.Version, renv.Packages.cobalt.Version], ['0.6.0', '4.6.0', '4.8.1', '5.0.0'], 'toolchain.R_and_packages');
  return e4Pins;
}

function renderMarkdown(report) {
  const matrix = report.strict_matrix.numeric_failures.map(row => `| ${row.name} | ${row.reference} | ${row.actual} | ${row.absolute_difference} | ${row.tolerance} | FAIL |`).join('\n');
  return `# CP-WEBR-02 Ratification Qualification Report\n\nStatus: \`${report.final_verdict}\`  \nExact commit: \`${report.commit_sha}\`  \nWorkflow run: \`${report.workflow_run_id}\`\n\n## Outcomes\n\n- CP-WEBR-02: \`${report.phase_status}\`\n- Original strict numerical parity: **FAIL**\n- Aggregate 25/25 numerical parity: **FALSE**\n- Ratified classification: 18 ordinary numerical/structural parity, 5 expected error/product-policy parity, 1 exact fix15 warning exception, 1 exact fix16 restricted non-identifiable inference exception.\n- Covariance cause: **UNRESOLVED**.\n- fix16 publication: \`OUTPUT_GENERATION_RESTRICTED\`.\n- Production release and real clinical data: **NOT AUTHORIZED**.\n\n## Original strict matrix from the exact-baseline run\n\nRun ${report.strict_run.workflow_run_id} concluded \`${report.strict_run.conclusion.toUpperCase()}\`. It has the same four previously established rows: one fix15 warning distinction and the three fix16 numeric rows below. All remain raw strict failures.\n\n| Numeric field | Reference | Actual | Absolute difference | Tolerance | Status |\n|---|---:|---:|---:|---:|---|\n${matrix}\n\nThe preserved E4 historical strict matrix is separately included in the machine report with its exact raw values. The baseline strict run generated a separate non-frozen candidate. Its candidate-to-candidate numeric changes from the accepted observation dataset were within the original tolerance, but the cause of those changes is not claimed. The accepted reference bytes remain SHA-256 \`${report.scientific_adjudication.native_reference.sha256}\`.\n\n## Evidence integrity\n\nE4 artifact ${report.evidence.artifacts.e4.artifact_id} was verified against its GitHub digest and internal SHA256SUMS. E1, E2, E3, current strict comparison, strict evidence, Security and Cumulative run metadata were pinned and checked. The report and evidence manifest are bound to this exact commit and run.\n\n## Boundaries\n\n- \`AUTOMATED_SEPARATION_SAFETY = BLOCKED\`\n- \`PRODUCTION_LICENSING_CLEARANCE = BLOCKED\`\n- \`CP_STAT_02_COMPLETE = FALSE\`; its \`100% semantic and numerical tolerance parity\` stop condition is unchanged.\n- CP-PUB-01 and CP-RELEASE remain deferred.\n- No main merge, deployment, or real clinical data was authorized or performed.\n`;
}

export function buildReport({ pins, e3, e4, strict, strictRun, evidence, metadata, commitSha, workflowRunId }) {
  const currentStrict = validateStrictComparison(strict, pins);
  const classifications = validateScientificClassification(e3, e4, pins);
  validateRunMetadata(metadata, pins);
  validateArtifactMetadata(metadata, pins);
  assertEqual(strictRun.id, Number(pins.required_baseline_workflows.strict_closure.workflow_run_id), 'strict_run.id');
  assertEqual(strictRun.head_sha, pins.required_baseline_sha, 'strict_run.head_sha');
  assertEqual(strictRun.conclusion, 'failure', 'strict_run.conclusion');
  assertEqual(e4.final_verdict, 'CLOSURE_E4_READY_FOR_INDEPENDENT_PHASE_CLOSURE', 'e4.verdict');
  assertEqual(e4.self_declared_closure, false, 'e4.self_declared_closure');
  assertEqual(e4.golden_reference_governance.candidate_sha256, pins.frozen.candidate_native_reference_sha256, 'e4.native_reference_hash');
  assertEqual(e4.golden_reference_governance.webr_numerical_parity_certified, false, 'e4.native_reference_parity');
  const report = {
    schema: 'CP-WEBR-02-RATIFICATION-QUALIFICATION-v1',
    final_verdict: 'CP_WEBR_02_RATIFICATION_COMPLETE_FOR_RED_TEAM_VERIFICATION',
    phase_status: 'CP_WEBR_02_CLOSED_UNDER_RATIFIED_SCIENTIFIC_EQUIVALENCE_AMENDMENT_V1',
    commit_sha: commitSha,
    workflow_run_id: workflowRunId,
    ratification_date: pins.ratification_date,
    approvals: {
      independent_red_team: 'E4_INDEPENDENT_RED_TEAM_ACCEPTED',
      owner_authorization: 'AUTHORIZED_BY_OWNER_PROMPT_DELIVERED_2026-10-24',
      ratified_amendment_sha256: pins.amendment_sha256,
      ratification_record_sha256: sha256(fs.readFileSync(RATIFICATION_PATH))
    },
    phase_contract: {
      original_cp_webr_02_stop_condition: '25 synthetic fixtures match native R golden results',
      unchanged_cp_stat_02_stop_condition: '100% semantic and numerical tolerance parity',
      precedence: 'The exact v1 amendment governs CP-WEBR-02 only; historical roadmap, manifest, strict reports and candidate reference remain preserved and traceable.',
      counts: pins.ratification_counts
    },
    evidence: {
      baseline_sha: pins.required_baseline_sha,
      main_sha: pins.main_sha,
      frozen_hashes: pins.frozen,
      toolchain: pins.toolchain,
      original_roadmap_sha256: pins.original_roadmap_sha256,
      amendment_sha256: pins.amendment_sha256,
      artifacts: Object.fromEntries(Object.entries(pins.source_evidence).map(([key, value]) => [key, value])),
      e4_verified: evidence.e4,
      current_evidence_archive: evidence.currentArchive,
      workflow_metadata: metadata
    },
    historical_strict_matrix: e4.historical_comparison,
    strict_run: {
      workflow_run_id: strictRun.id,
      commit_sha: strictRun.head_sha,
      conclusion: strictRun.conclusion,
      jobs: validateStrictWorkflowJobs(metadata.jobs.strict_baseline),
      comparison_report_sha256: pins.required_baseline_workflows.strict_closure.comparison_report_sha256,
      artifact_digest: pins.required_baseline_workflows.strict_closure.comparison_artifact_digest,
      failure_paths: strict.failures,
      fixture_count: currentStrict.fixture_count,
      negative_controls: currentStrict.negative_controls
    },
    strict_matrix: {
      status: strict.status,
      numerical_comparisons: strict.summary.numerical_comparison_count,
      numerical_passes: strict.summary.numerical_pass_count,
      numerical_failures: strict.summary.numerical_fail_count,
      aggregate_25_of_25_numerical_parity: false,
      numeric_failures: currentStrict.numeric_failures
    },
    scientific_adjudication: {
      classifications,
      native_reference: {
        status: 'NATIVE_R_OBSERVATION_DATASET_ACCEPTED_WITH_LIMITATIONS',
        sha256: pins.frozen.candidate_native_reference_sha256,
        webR_numerical_parity_certified: false,
        regenerated_or_overwritten: false
      },
      fix15: 'HISTORICAL_WARNING_CONTRACT_EXCEPTION',
      fix16: 'INFERENCE_NON_IDENTIFIABLE_OUTPUT_RESTRICTED',
      fix16_publication_restriction: 'OUTPUT_GENERATION_RESTRICTED',
      covariance_cause: 'UNRESOLVED'
    },
    phase_state: {
      original_strict_numerical_parity: 'FAIL',
      production_release_authorized: false,
      real_clinical_data_authorized: false,
      automated_separation_safety: 'BLOCKED',
      production_licensing_clearance: 'BLOCKED',
      cp_stat_02_complete: false,
      cp_stat_02_starting_inventory_sha256: sha256(fs.readFileSync(CP_STAT_INVENTORY_PATH)),
      cp_pub_01: 'DEFERRED',
      cp_release: 'DEFERRED',
      issue_tracker: 'No open project issue existed; this versioned repository governance record is the phase tracker.'
    },
    open_blockers: [
      'Automated general-purpose separation safety remains BLOCKED pending CP-STAT-02 validation.',
      'Production licensing clearance remains BLOCKED.',
      'WebSocket and WebTransport monitoring are UNMEASURED; non-Chromium release qualification is UNMEASURED.',
      'The fix16 native/WebR covariance cause remains UNRESOLVED.',
      'CP-STAT-02, CP-PUB-01 and CP-RELEASE requirements remain deferred.'
    ],
    limitations: [
      'No 25/25 numerical parity claim is made; the original strict matrix and its three numeric FAIL rows remain unchanged.',
      'The cause of the native/WebR covariance discrepancy is UNRESOLVED.',
      'The latest strict workflow generated a separate non-frozen native candidate; it does not replace the accepted reference.',
      'Fixture-specific LP evidence does not validate a universal production separation detector or PSM causal validity.',
      'CP-STAT-02, CP-PUB-01, CP-RELEASE, production release, licensing clearance and real clinical data remain outside this ratification.'
    ]
  };
  return report;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--') || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`invalid argument near ${key}`);
    out[key.slice(2)] = argv[++i];
  }
  for (const key of ['evidence-dir', 'output-dir', 'commit-sha', 'workflow-run-id']) requireValue(out[key], 'arguments', `--${key} required`);
  return out;
}

function copyEvidenceFile(source, output, targetName, manifestFiles) {
  const target = path.join(output, targetName);
  fs.copyFileSync(source, target);
  manifestFiles[targetName] = sha256(fs.readFileSync(target));
}

function cli() {
  const args = parseArgs(process.argv.slice(2));
  const pinsBytes = fs.readFileSync(PINS_PATH);
  const pins = JSON.parse(pinsBytes.toString('utf8'));
  const recordBytes = fs.readFileSync(RATIFICATION_PATH);
  const recordSha = sha256(recordBytes);
  assertEqual(recordSha, pins.ratification_record_sha256, 'ratification_record.sha256');
  const recordText = recordBytes.toString('utf8');
  for (const requiredText of ['RATIFIED_SUBJECT_TO_EXACT_SHA_QUALIFICATION', 'E4_INDEPENDENT_RED_TEAM_ACCEPTED', 'authorized ratification by delivering the CP-WEBR-02-RATIFICATION prompt on 2026-10-24', 'Scope:** CP-WEBR-02 only', '100% semantic and numerical tolerance parity', 'ORIGINAL_STRICT_NUMERICAL_PARITY = FAIL']) {
    requireValue(recordText.includes(requiredText), 'ratification_record.authority_and_scope', `required statement absent: ${requiredText}`);
  }
  const e4Pins = verifyFrozenHashes(pins, recordSha);
  const evidenceRoot = path.resolve(args['evidence-dir']);
  const e4Dir = path.join(evidenceRoot, 'e4-download');
  const currentComparisonDir = path.join(evidenceRoot, 'current-comparison');
  const currentEvidenceDir = path.join(evidenceRoot, 'current-evidence-download');
  const currentUnpackedDir = path.join(evidenceRoot, 'current-evidence-unpacked');
  const e4IndexPath = path.join(e4Dir, 'e4-evidence-index.json');
  const nestedE4IndexPath = fs.existsSync(e4IndexPath) ? e4IndexPath : findFile(e4Dir, 'e4-evidence-index.json');
  const e4Root = path.dirname(nestedE4IndexPath);
  const sums = verifySha256Manifest(e4Root, 'SHA256SUMS', pins.source_evidence.e4.sha256sums_sha256);
  const e4Index = readJson(nestedE4IndexPath);
  assertEqual(sha256(fs.readFileSync(nestedE4IndexPath)), pins.source_evidence.e4.evidence_index_sha256, 'e4.index.sha256');
  assertEqual(e4Index.commit_sha, pins.required_baseline_sha, 'e4.index.commit_sha');
  assertEqual(String(e4Index.workflow_run_id), pins.source_evidence.e4.workflow_run_id, 'e4.index.run_id');
  assertEqual(e4Index.final_verdict, 'CLOSURE_E4_READY_FOR_INDEPENDENT_PHASE_CLOSURE', 'e4.index.verdict');
  const e4ReportPath = path.join(e4Root, 'e4-closure-qualification.json');
  const e3ReportPath = path.join(e4Root, 'e3-adjudication-report.json');
  const oldStrictPath = path.join(e4Root, 'strict-comparison-report-run-40030723201.json');
  const acceptedRefPath = path.join(e4Root, 'source-e1-unpacked/native-reference-candidate.json');
  assertEqual(sha256(fs.readFileSync(acceptedRefPath)), pins.frozen.candidate_native_reference_sha256, 'accepted_reference.sha256');
  const e4 = readJson(e4ReportPath);
  const e3 = readJson(e3ReportPath);
  const oldStrict = readJson(oldStrictPath);
  assertEqual(sha256(fs.readFileSync(oldStrictPath)), pins.historical_strict.comparison_report_sha256, 'historical_strict.report_sha256');
  assertEqual(oldStrict.status, 'FAIL', 'historical_strict.status');
  assertEqual(oldStrict.summary.baseline_failure_count, 4, 'historical_strict.failure_count');
  assertEqual(oldStrict.summary.numerical_fail_count, 3, 'historical_strict.numeric_failures');
  assertEqual(oldStrict.failures.length, 4, 'historical_strict.rows');
  assertEqual(oldStrict.failures[0], pins.expected_strict_failures[0], 'historical_strict.fix15_failure');
  assertEqual(oldStrict.failures.slice(1).map(text => text.split(':difference=')[0]), pins.expected_strict_failures.slice(1), 'historical_strict.numeric_failure_paths');
  const oldNumericFailures = oldStrict.numeric_comparisons.filter(row => row.status === 'FAIL').map(row => ({
    name: row.name, actual: row.actual, reference: row.reference, absolute_difference: row.absolute_difference, tolerance: row.tolerance, status: row.status
  }));
  assertEqual(oldNumericFailures, e4Pins.original_numeric_failure_rows, 'historical_strict.raw_numeric_failure_matrix');
  const currentReportPath = findFile(currentComparisonDir, 'comparison-report.json');
  assertEqual(sha256(fs.readFileSync(currentReportPath)), pins.required_baseline_workflows.strict_closure.comparison_report_sha256, 'current_strict.report_sha256');
  const strict = readJson(currentReportPath);
  const strictRun = readJson(path.join(evidenceRoot, 'strict-run.json'));
  const metadata = readJson(path.join(evidenceRoot, 'upstream-metadata.json'));
  validateRunMetadata(metadata, pins);
  validateArtifactMetadata(metadata, pins);
  const currentArchive = verifyCurrentArchive(currentEvidenceDir, pins);
  assertEqual(strict.reference_sha256, currentArchive.current_candidate_sha256, 'strict.current_candidate_reference_sha256');
  const e4Metadata = metadata.artifacts['12536466975'];
  assertEqual(e4Metadata.digest, pins.source_evidence.e4.artifact_digest, 'e4.external_artifact_digest');
  const strictSummary = validateStrictComparison(strict, pins);
  const classifications = validateScientificClassification(e3, e4, pins);
  validateRunMetadata(metadata, pins);
  validateArtifactMetadata(metadata, pins);
  assertEqual(strictRun.id, Number(pins.required_baseline_workflows.strict_closure.workflow_run_id), 'strict_run.id');
  assertEqual(strictRun.head_sha, pins.required_baseline_sha, 'strict_run.head_sha');
  assertEqual(strictRun.conclusion, 'failure', 'strict_run.conclusion');
  const report = buildReport({ pins, e3, e4, strict, strictRun, evidence: { e4: sums, currentArchive }, metadata, commitSha: args['commit-sha'], workflowRunId: args['workflow-run-id'] });
  requireValue(report.commit_sha === args['commit-sha'], 'report.commit_sha', 'commit binding failed');

  const output = path.resolve(args['output-dir']);
  fs.mkdirSync(output, { recursive: true });
  const manifestFiles = {};
  copyEvidenceFile(RATIFICATION_PATH, output, 'CP-WEBR-02-RATIFICATION-v1.md', manifestFiles);
  copyEvidenceFile(CP_STAT_INVENTORY_PATH, output, 'CP-STAT-02-STARTING-INVENTORY.md', manifestFiles);
  copyEvidenceFile(PINS_PATH, output, 'evidence-pins.json', manifestFiles);
  copyEvidenceFile(AMENDMENT_PATH, output, 'CP-WEBR-02-SCIENTIFIC-EQUIVALENCE-AMENDMENT-v1.md', manifestFiles);
  copyEvidenceFile(e4ReportPath, output, 'e4-closure-qualification.json', manifestFiles);
  copyEvidenceFile(e3ReportPath, output, 'e3-adjudication-report.json', manifestFiles);
  copyEvidenceFile(oldStrictPath, output, 'historical-strict-comparison-report.json', manifestFiles);
  copyEvidenceFile(currentReportPath, output, 'ratification-baseline-strict-comparison-report.json', manifestFiles);
  copyEvidenceFile(findFile(e4Dir, 'adjudicator-tests.tap'), output, 'e4-adjudicator-tests.tap', manifestFiles);
  copyEvidenceFile(findFile(e4Dir, 'e4-evidence-pins.json'), output, 'e4-evidence-pins.json', manifestFiles);
  copyEvidenceFile(findFile(e4Dir, 'production-worker.js'), output, 'production-worker.js', manifestFiles);
  fs.writeFileSync(path.join(output, 'closure-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  manifestFiles['closure-report.json'] = sha256(fs.readFileSync(path.join(output, 'closure-report.json')));
  const openBlockers = report.open_blockers.map(item => `- ${item}`).join('\n');
  const markdown = `${renderMarkdown(report)}\n## Open blockers\n\n${openBlockers}\n\nRead-only CP-STAT-02 inventory: \`CP-STAT-02-STARTING-INVENTORY.md\` (SHA-256 ${report.phase_state.cp_stat_02_starting_inventory_sha256}).\n`;
  fs.writeFileSync(path.join(output, 'closure-report.md'), markdown);
  manifestFiles['closure-report.md'] = sha256(fs.readFileSync(path.join(output, 'closure-report.md')));
  const evidenceManifest = {
    schema: 'CP-WEBR-02-RATIFICATION-EVIDENCE-MANIFEST-v1',
    commit_sha: report.commit_sha,
    workflow_run_id: report.workflow_run_id,
    files_sha256: manifestFiles,
    verified_artifacts: metadata.artifacts,
    verified_runs: metadata.runs,
    internal_e4_manifest: sums,
    current_strict_archive: currentArchive
  };
  fs.writeFileSync(path.join(output, 'evidence-manifest.json'), `${JSON.stringify(evidenceManifest, null, 2)}\n`);
  const manifest = Object.entries({ ...manifestFiles, 'evidence-manifest.json': sha256(fs.readFileSync(path.join(output, 'evidence-manifest.json'))) })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, digest]) => `${digest}  ${name}`)
    .join('\n') + '\n';
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), manifest);
  process.stdout.write(`${JSON.stringify({ final_verdict: report.final_verdict, phase_status: report.phase_status, commit_sha: report.commit_sha, workflow_run_id: report.workflow_run_id, strict_numeric_failures: strictSummary.numeric_failures.length, output }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(); } catch (error) {
    process.stderr.write(`CP-WEBR-02 ratification rejected: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
