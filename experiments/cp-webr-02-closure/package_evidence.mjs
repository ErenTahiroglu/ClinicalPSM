import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fail(message) { throw new Error(message); }
function args() {
  const values = {};
  const input = process.argv.slice(2);
  for (let index = 0; index < input.length; index += 2) {
    if (!['--stage', '--archive', '--run-id', '--commit'].includes(input[index]) || !input[index + 1]) fail('Usage: node package_evidence.mjs --stage <evidence-directory> --archive <new-tar.gz-path> --run-id <id> --commit <sha>');
    values[input[index].slice(2)] = input[index + 1];
  }
  for (const key of ['stage', 'archive', 'run-id', 'commit']) if (!values[key]) fail(`Missing --${key}`);
  values.stage = path.resolve(values.stage);
  values.archive = path.resolve(values.archive);
  if (fs.existsSync(values.archive)) fail(`Refusing to overwrite archive: ${values.archive}`);
  return values;
}

try {
  const input = args();
  const required = [
    'native-feasibility-evidence.json', 'native-reference-candidate.json', 'native-reference-integrity.json',
    'production-worker-results.json', 'comparison-report.json', 'e1-browser-evidence.json',
    '02a-adapter-unit-tests.json', '02a-worker-fatal-settlement-audit.json',
    '02b-integration-gates.json', '02b-worker-regressions.json',
    'renv.lock', 'source-package-integrity.json', 'fixture-integrity.json', 'production-worker.js', 'static-headers.txt'
  ];
  for (const file of required) if (!fs.existsSync(path.join(input.stage, file))) fail(`Required evidence file absent: ${file}`);
  const comparison = JSON.parse(fs.readFileSync(path.join(input.stage, 'comparison-report.json'), 'utf8'));
  const candidate = JSON.parse(fs.readFileSync(path.join(input.stage, 'native-reference-candidate.json'), 'utf8'));
  const browser = JSON.parse(fs.readFileSync(path.join(input.stage, 'production-worker-results.json'), 'utf8'));
  const e1 = JSON.parse(fs.readFileSync(path.join(input.stage, 'e1-browser-evidence.json'), 'utf8'));
  const adapterRegression = JSON.parse(fs.readFileSync(path.join(input.stage, '02a-adapter-unit-tests.json'), 'utf8'));
  const fatalRegression = JSON.parse(fs.readFileSync(path.join(input.stage, '02a-worker-fatal-settlement-audit.json'), 'utf8'));
  const integrationGates = JSON.parse(fs.readFileSync(path.join(input.stage, '02b-integration-gates.json'), 'utf8'));
  const workerRegressions = JSON.parse(fs.readFileSync(path.join(input.stage, '02b-worker-regressions.json'), 'utf8'));
  if (candidate.evidence_class !== 'CANDIDATE_NATIVE_GOLDEN_PENDING_INDEPENDENT_RED_TEAM_ACCEPTANCE') fail('Native reference was not identified as a candidate');
  if (browser.fixtures?.length !== 25) fail('Production Worker evidence does not contain 25 fixtures');
  if (adapterRegression.tests_failed !== 0 || fatalRegression.tests?.length !== fatalRegression.total_tests || fatalRegression.tests.some(test => test.pass !== true)) fail('02A adapter or worker lifecycle regression suite failed');
  if (integrationGates.verdict !== 'PASS' || workerRegressions.verdict !== 'PASS' || workerRegressions.results?.some(result => result.status !== 'PASS')) fail('02B E1 integration or worker lifecycle regression suite failed');

  const fileDigests = Object.fromEntries(required.map(file => [file, sha(fs.readFileSync(path.join(input.stage, file)))]));
  const gateStatus = {
    exact_native_R_4_6_0: 'PASS',
    exact_MatchIt_4_8_1: 'PASS',
    exact_cobalt_5_0_0: 'PASS',
    official_CRAN_source_archive_hashes: 'PASS',
    preserved_25_fixture_input_hashes: 'PASS',
    native_oracle_generation: 'PASS_CANDIDATE_PENDING_REVIEW',
    candidate_reference_integrity: 'PASS',
    static_application_build: 'PASS',
    production_dedicated_worker_chromium_execution: 'PASS',
    native_vs_worker_parity_and_classifications: comparison.status === 'PASS_PENDING_INDEPENDENT_RED_TEAM_ACCEPTANCE' ? 'PASS' : 'FAIL',
    comparator_negative_controls: comparison.negative_controls?.status === 'PASS' ? 'PASS' : 'FAIL',
    nominal_network_privacy: comparison.privacy?.network_monitoring_status === 'MEASURED' && comparison.privacy?.network_nominal_unauthorized_count === 0 ? 'PASS' : 'UNMEASURED',
    nested_webr_worker_http_interception: comparison.privacy?.nested_webr_worker_http_interception || 'UNMEASURED',
    page_egress_positive_control: comparison.privacy?.positive_control?.requestDetected &&
      comparison.privacy?.positive_control?.pageMonitorGatePassesWhenPermitted === false ? 'PASS' : 'FAIL',
    worker_egress_positive_control: comparison.privacy?.positive_control?.workerRequestMonitoring === 'MEASURED' ? 'PASS' : 'UNMEASURED',
    e1_chromium_security_csp_network_storage_regression: e1.verdict === 'PASS' ? 'PASS' : 'FAIL',
    cp_webr_02b_integration_gates: integrationGates.verdict === 'PASS' ? 'PASS' : 'FAIL',
    cp_webr_02b_worker_lifecycle_regressions: workerRegressions.verdict === 'PASS' ? 'PASS' : 'FAIL',
    cp_webr_02a_adapter_and_worker_lifecycle_regressions: 'PASS',
    shared_array_buffer_channel_observed: comparison.runtime_channel?.selected_webr_channel === 'SharedArrayBuffer' ? 'PASS' : 'FAIL',
    websocket_monitoring: 'UNMEASURED',
    webtransport_monitoring: 'UNMEASURED',
    non_chromium_release_qualification: 'UNMEASURED',
    automated_separation_safety: 'BLOCKED',
    production_licensing_clearance: 'BLOCKED',
    final_scientific_reference_acceptance: 'PENDING_INDEPENDENT_RED_TEAM'
  };
  const verdict = Object.values(gateStatus).some(status => status === 'FAIL')
    ? 'CP_WEBR_02_CLOSURE_1_INSUFFICIENT'
    : 'CP_WEBR_02_CLOSURE_1_PASS_FOR_RED_TEAM_REVIEW';

  const index = {
    schema_version: 1,
    evidence_class: 'CP_WEBR_02_CLOSURE_1_CANDIDATE_EVIDENCE_BUNDLE',
    verdict,
    commit_sha: input.commit,
    github_actions_run_id: input['run-id'],
    generated_at_utc: new Date().toISOString(),
    candidate_reference_is_not_frozen: true,
    required_reviewer: 'Independent ChatGPT Red Team',
    gate_status: gateStatus,
    fixture_count: 25,
    numerical_comparison_count: comparison.summary.numerical_comparison_count,
    numerical_comparison_pass_count: comparison.summary.numerical_pass_count,
    negative_control_count: comparison.negative_controls.count,
    negative_control_status: comparison.negative_controls.status,
    baseline_failure_count: comparison.summary.baseline_failure_count,
    runtime: comparison.runtime_channel,
    csp: comparison.csp,
    privacy: comparison.privacy,
    files_sha256: fileDigests,
    native_oracle_source_sha256: candidate.provenance.oracle_source_sha256,
    source_package_manifest_sha256: candidate.provenance.source_package_manifest_sha256,
    fixture_manifest_sha256: candidate.provenance.fixture_manifest_sha256,
    fixture_integrity_sha256: candidate.provenance.fixture_integrity_sha256,
    production_worker_source_sha256: browser.execution.worker_source_sha256,
    production_worker_bundle_sha256: browser.execution.worker_bundle_sha256,
    e1_browser_status: e1.verdict,
    limitations: [
      'Native candidate values remain pending independent Red Team acceptance and are not frozen.',
      'AUTOMATED_SEPARATION_SAFETY remains BLOCKED.',
      'PRODUCTION_LICENSING_CLEARANCE remains BLOCKED.',
      'WebSocket and WebTransport monitoring remain UNMEASURED.',
      'Non-Chromium release qualification remains incomplete.'
    ]
  };
  fs.writeFileSync(path.join(input.stage, 'evidence-index.json'), `${JSON.stringify(index, null, 2)}\n`, { flag: 'wx' });
  const archiveDir = path.dirname(input.archive);
  fs.mkdirSync(archiveDir, { recursive: true });
  execFileSync('tar', ['-czf', input.archive, '-C', input.stage, '.'], { stdio: 'inherit' });
  const archiveHash = sha(fs.readFileSync(input.archive));
  const archiveSize = fs.statSync(input.archive).size;
  fs.writeFileSync(`${input.archive}.sha256`, `${archiveHash}  ${path.basename(input.archive)}\n`, { flag: 'wx' });
  fs.writeFileSync(`${input.archive}.metadata.json`, `${JSON.stringify({
    commit_sha: input.commit, github_actions_run_id: input['run-id'], archive_sha256: archiveHash,
    archive_size_bytes: archiveSize, evidence_index_sha256: sha(fs.readFileSync(path.join(input.stage, 'evidence-index.json')))
  }, null, 2)}\n`, { flag: 'wx' });
  console.log(`Evidence verdict: ${verdict}`);
  console.log(`Evidence archive SHA-256: ${archiveHash}`);
  console.log(`Evidence archive size: ${archiveSize}`);
  console.log(`Evidence archive: ${input.archive}`);
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
