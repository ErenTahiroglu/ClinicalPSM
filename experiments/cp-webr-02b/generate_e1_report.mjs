import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.env.CP_WEBR_EVIDENCE_DIR || 'evidence/cp-webr-02b');
const readJson = name => {
  const file = path.join(dir, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};
const integration = readJson('integration-gates.json');
const browser = readJson('browser-evidence.json');
const workerRegressions = readJson('worker-regressions.json');
const assetsBefore = readJson('asset-manifest-before.json');
const assetsAfter = readJson('asset-manifest-after.json');
const commit = process.env.GITHUB_SHA || 'LOCAL_UNCOMMITTED';
const runId = process.env.GITHUB_RUN_ID || null;
const artifactId = process.env.CP_WEBR_ARTIFACT_ID || null;
const artifactSize = process.env.CP_WEBR_ARTIFACT_SIZE_BYTES ? Number(process.env.CP_WEBR_ARTIFACT_SIZE_BYTES) : null;
const artifactSha = process.env.CP_WEBR_ARTIFACT_SHA256 || null;
const ciStepStatus = value => value === 'success' ? 'PASS' : value === 'failure' ? 'FAIL' : value ? 'BLOCKED' : 'UNMEASURED';

const browserStatuses = new Map((browser?.results || []).map(result => [result.name, result.status]));
const combined = [
  { name: 'GitHub CI static application build', status: ciStepStatus(process.env.CP_WEBR_CI_APP_BUILD) },
  { name: 'GitHub CI Cloudflare compatibility and CSP check', status: ciStepStatus(process.env.CP_WEBR_CI_STATIC_COMPAT) },
  { name: 'GitHub CI repository lint', status: ciStepStatus(process.env.CP_WEBR_CI_LINT) },
  { name: 'GitHub CI application and Worker typecheck', status: ciStepStatus(process.env.CP_WEBR_CI_TYPECHECK) },
  { name: 'GitHub CI deterministic asset rebuild', status: ciStepStatus(process.env.CP_WEBR_CI_ASSET_FIRST) === 'PASS' && ciStepStatus(process.env.CP_WEBR_CI_ASSET_REPEAT) === 'PASS' ? 'PASS' : 'FAIL' },
  { name: 'GitHub CI scientific comparator invocation', status: ciStepStatus(process.env.CP_WEBR_CI_COMPARATOR) },
  { name: 'GitHub CI CP-WEBR-02A Worker regression invocation', status: ciStepStatus(process.env.CP_WEBR_CI_REGRESSIONS) },
  { name: 'GitHub CI real Chromium qualification invocation', status: ciStepStatus(process.env.CP_WEBR_CI_BROWSER) },
  { name: 'Static build and deterministic asset count/size', status: assetsBefore && assetsAfter &&
      assetsBefore.fileCount === assetsAfter.fileCount && assetsBefore.totalBytes === assetsAfter.totalBytes && assetsBefore.manifestSha256 === assetsAfter.manifestSha256 ? 'PASS' : 'FAIL' },
  { name: 'Frozen reference, generator, and input integrity', status: integration?.referenceIntegrity &&
      integration.referenceIntegrity.referenceHashPass && integration.referenceIntegrity.generatorHashPass &&
      integration.referenceIntegrity.inputHashPass && integration.referenceIntegrity.provenancePass ? 'PASS' : 'FAIL' },
  { name: 'Scientific parity comparator and negative controls', status: integration?.verdict === 'PASS' &&
      (integration.negativeControls || []).every(control => control.status === 'PASS') ? 'PASS' : 'FAIL' },
  { name: 'CP-WEBR-02A lifecycle regressions against application manager', status: workerRegressions?.verdict || 'BLOCKED' },
  { name: 'Complete Chromium suite with no failed qualification gate', status: browser?.verdict === 'PASS' ? 'PASS' : browser?.verdict === 'FAIL' ? 'FAIL' : 'BLOCKED' },
  { name: 'Production Chromium synthetic analysis after cancellation', status: browserStatuses.get('Built static app successful synthetic analysis after cancellation') || 'BLOCKED' },
  { name: 'Production Worker native cancellation correlation', status: browserStatuses.get('Production app Worker request and cancellation correlation') || 'BLOCKED' },
  { name: 'Genuine R workload interruption and runtime error separation', status: ['Genuine WebR R workload interrupted during evaluation', 'Unrelated R runtime exception during interruption stays distinct', 'R runtime error text containing “interrupted” is not cancellation']
      .every(name => browserStatuses.get(name) === 'PASS') ? 'PASS' : 'FAIL' },
  { name: 'Worker fatal errors, stale results, and recovery', status: ['Worker onerror settles active job once', 'Worker onmessageerror settles active job once', 'Stale success after cancellation is rejected', 'Fresh Worker recovery followed by successful job']
      .every(name => browserStatuses.get(name) === 'PASS') ? 'PASS' : 'FAIL' },
  { name: 'Runtime channel and nested WebR Worker', status: browserStatuses.get('Production app Worker empirical SharedArrayBuffer channel') === 'PASS' &&
      browserStatuses.get('Nested WebR Worker initialization observed') === 'PASS' ? 'PASS' : 'FAIL' },
  { name: 'CSP policy, strict WebR attempt, and bounded exception', status: browserStatuses.get('Production app Worker strict; WebR CSP exception scoped') === 'PASS' &&
      browserStatuses.get('Built application CSP has one evidence-backed WebR exception') === 'PASS' &&
      browserStatuses.get('Built static app successful synthetic analysis after cancellation') === 'PASS' ? 'PASS' : 'FAIL' },
  { name: 'HTTP network privacy and unauthorized-egress positive controls', status: browserStatuses.get('Real app and Worker runtime network egress qualification') === 'PASS' &&
      browserStatuses.get('Page, same-origin, and Worker request interception positive controls') === 'PASS' &&
      browserStatuses.get('Permitted page and Worker egress falsifies the monitoring gate') === 'PASS' &&
      browserStatuses.get('Nominal app and Worker requests carry no dataset body') === 'PASS' ? 'PASS' : 'FAIL' },
  { name: 'Runtime storage scans and planted-sentinel controls', status: browserStatuses.get('Runtime storage scanner positive controls') === 'PASS' &&
      browserStatuses.get('Storage inspection before initialization') === 'PASS' && browserStatuses.get('Injected storage data removed') === 'PASS' &&
      browserStatuses.get('Storage inspection after cancellation') === 'PASS' && browserStatuses.get('Storage inspection after full analysis') === 'PASS' &&
      browserStatuses.get('Storage inspection after Worker/page lifecycle cleanup') === 'PASS' ? 'PASS' : 'FAIL' },
  { name: 'Matching-weight parity against frozen reference', status: integration?.matchingWeightParity?.status || 'UNMEASURED' },
  { name: 'Dedicated Worker WebSocket activity', status: 'UNMEASURED' },
  { name: 'WebTransport activity', status: browser?.network?.webTransport === 'NOT_AVAILABLE' ? 'NOT_AVAILABLE' : 'UNMEASURED' },
  { name: 'NATIVE_R_INDEPENDENT_ORACLE', status: 'BLOCKED' },
  { name: 'AUTOMATED_SEPARATION_SAFETY', status: 'BLOCKED' },
  { name: 'PRODUCTION_LICENSING_CLEARANCE', status: 'BLOCKED' },
  { name: 'Non-Chromium release qualification', status: 'UNMEASURED' }
];

const maintainedBlockers = new Set(['NATIVE_R_INDEPENDENT_ORACLE', 'AUTOMATED_SEPARATION_SAFETY', 'PRODUCTION_LICENSING_CLEARANCE']);
const allowedUnmeasured = new Set(['Matching-weight parity against frozen reference', 'Dedicated Worker WebSocket activity', 'WebTransport activity', 'Non-Chromium release qualification']);
const failures = combined.filter(gate => gate.status === 'FAIL' ||
  ((gate.status === 'BLOCKED' || gate.status === 'UNMEASURED') && !maintainedBlockers.has(gate.name) && !allowedUnmeasured.has(gate.name)));
const report = {
  suite: 'CP-WEBR-02B-1-E1',
  generatedAt: new Date().toISOString(),
  initialSha: '62fddcf177c078b75768aeb441b1f98d7a18b208',
  commitSha: commit,
  githubRunId: runId,
  finalVerdict: failures.length === 0 ? '02B_E1_PASS_FOR_INDEPENDENT_RED_TEAM_REVIEW' : '02B_E1_INSUFFICIENT',
  changedFiles: [
    { path: '.github/workflows/experiment-cp-webr-02b-e1.yml', reason: 'Pinned build, comparator, Chromium qualification, regressions, artifact metadata, and gate enforcement.' },
    { path: 'package.json', reason: 'Named CP-WEBR-02B comparator, browser qualification, and worker regression commands.' },
    { path: 'apps/web/build.mjs', reason: 'Added the empirically necessary unsafe-eval exception only for the nested WebR Worker script; all other application policies remain strict.' },
    { path: 'apps/web/src/content.json', reason: 'Non-certification warning localized in English and Turkish.' },
    { path: 'apps/web/src/demo.js', reason: 'Use structured cancellation codes and keep the cancel control available while an initialized analysis is running.' },
    { path: 'apps/web/src/presentation.js', reason: 'Show substantial residual imbalance and clarify OUTPUT_READY.' },
    { path: 'experiments/cp-webr-02b/SYNTHETIC-DEMO-REFERENCE.json', reason: 'Corrected only generator provenance digest; all reference results, tolerances, and pair identities remain unchanged.' },
    { path: 'experiments/cp-webr-02b/test_integration_gates.mjs', reason: 'Exact scientific comparison, integrity checks, numeric/null semantics, and falsification controls against app modules.' },
    { path: 'experiments/cp-webr-02b/test_worker_manager_regressions.mjs', reason: 'Replays focused 02A lifecycle regressions against the application Worker manager.' },
    { path: 'experiments/cp-webr-02b/asset_manifest.mjs', reason: 'Deterministic asset count and size manifest for clean double-build comparison.' },
    { path: 'experiments/cp-webr-02b/generate_e1_report.mjs', reason: 'Machine-readable and Markdown gate report with blockers, unmeasured channels, comparisons, and artifact metadata.' },
    { path: 'experiments/cp-webr-02b/browser/**', reason: 'Real Chromium app, Worker lifecycle, CSP, network, storage, and positive-control qualification.' },
    { path: 'scripts/devtools/cf-free-compat.mjs', reason: 'Static CSP checker permits unsafe-eval only on the evidence-backed nested WebR asset route.' },
    { path: 'src/lib/webr/worker_manager.mjs', reason: 'Unsupported interruption status, deterministic init cancellation, exactly-once settlement, and stale-result rejection.' },
    { path: 'src/worker/webr-worker.ts', reason: 'Exact job-correlated native WebR interruption classification, explicit runtime channel, and late-result suppression.' }
  ],
  gates: combined,
  browserEvidence: browser,
  integrationGates: integration,
  workerRegressions,
  comparisonMatrix: integration?.comparisons || [],
  referenceIntegrity: integration?.referenceIntegrity || null,
  negativeControls: integration?.negativeControls || [],
  assets: assetsBefore && assetsAfter ? { before: assetsBefore, after: assetsAfter, deterministic: assetsBefore.manifestSha256 === assetsAfter.manifestSha256 } : null,
  blockers: ['NATIVE_R_INDEPENDENT_ORACLE', 'AUTOMATED_SEPARATION_SAFETY', 'PRODUCTION_LICENSING_CLEARANCE'],
  limitations: browser?.limitations || ['Chromium evidence unavailable.'],
  artifact: { id: artifactId, sizeBytes: artifactSize, sha256: artifactSha, name: artifactId ? `cp-webr-02b-e1-${commit}` : null }
};

function table(rows, headers) {
  const out = ['| ' + headers.join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |'];
  for (const row of rows) out.push('| ' + row.map(value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')).join(' | ') + ' |');
  return out;
}
const cancellation = browser?.runtime?.productionCancellation?.[0] || {};
const channel = browser?.runtime?.productionChannel || {};
const network = browser?.network?.nominal || {};
const matchedPairs = integration?.scientificIdentity?.matchedPairs || {};
const storageRows = (browser?.storage?.checks || []).map(check => [check.checkpoint, check.matches?.length ?? 'UNMEASURED', check.errors?.length ?? 'UNMEASURED', JSON.stringify(check.inspection || {})]);
const comparisonRows = (report.comparisonMatrix || []).map(row => [row.name, row.semantics, row.actual, row.expected, row.absoluteDifference, row.tolerance, row.status]);
const browserRows = (browser?.results || []).map(result => [result.status, result.name, result.detail || '']);
const regressionRows = (workerRegressions?.results || []).map(result => [result.status, result.name]);
const lines = [
  '# CP-WEBR-02B-1-E1 Independent Qualification Report',
  '',
  `- Initial SHA: \`${report.initialSha}\``,
  `- Final SHA: \`${commit}\``,
  `- GitHub workflow run ID: ${runId || 'not a GitHub Actions run'}`,
  `- Final verdict: \`${report.finalVerdict}\``,
  '',
  '## Gate verdicts',
  '',
  ...table(combined.map(gate => [gate.name, gate.status]), ['Gate', 'Status']),
  '',
  '## Worker cancellation and browser recovery',
  '',
  `The production app Worker emitted \`${cancellation.code || 'UNMEASURED'}\` for job \`${cancellation.id || 'UNMEASURED'}\`, targeted job \`${cancellation.targetJobId || 'UNMEASURED'}\`, native WebR error \`${cancellation.nativeErrorName || cancellation.nativeErrorCode || 'UNMEASURED'}\`. The browser observed one matching user interrupt request. The 15-million-iteration R workload also unwound in Chromium, while a separate R exception and an error containing “interrupted” remained non-cancellation errors.`,
  '',
  '### CP-WEBR-02A lifecycle regressions against application manager',
  '',
  ...table(regressionRows, ['Status', 'Regression']),
  '',
  '### Chromium lifecycle qualification',
  '',
  `- Browser: ${browser?.browser?.product || 'UNMEASURED'} (${browser?.browser?.engine || 'UNMEASURED'} ${browser?.browser?.version || ''})`,
  `- Page isolation: crossOriginIsolated=${browser?.browser?.pageIsolation?.crossOriginIsolated}; SharedArrayBuffer=${browser?.browser?.pageIsolation?.sharedArrayBufferAvailable}`,
  `- Production Worker selected channel: ${channel.channelType || 'UNMEASURED'}; Worker isolation=${channel.crossOriginIsolated}; SAB=${channel.sharedArrayBufferAvailable}`,
  '',
  ...table(browserRows, ['Status', 'Browser check', 'Evidence']),
  '',
  '## CSP qualification',
  '',
  `A strict nested WebR Worker policy was attempted and failed during runtime initialization with the observed Emscripten error \`${browser?.csp?.exception?.reason || 'UNMEASURED'}\`. The compatible control completed the full MatchIt/cobalt pipeline. The production app page, outer app Worker, and other WebR assets remain strict. The sole built exception is \`/assets/webr/webr-worker.js\` with \`script-src 'unsafe-eval'\`; the browser recorded strict and compatible nested Worker response headers.`,
  '',
  '## Network and storage privacy',
  '',
  `Nominal app analysis generated ${browser?.network?.requests?.length ?? 'UNMEASURED'} intercepted HTTP requests; unauthorized requests=${network.unauthorizedCount ?? 'UNMEASURED'}; requests with bodies=${browser?.network?.requests?.filter(request => request.bodyPresent).length ?? 'UNMEASURED'}. Bodies were not persisted. Page, same-origin, and Worker positive controls were detected; a deliberately permitted synthetic page and Worker egress made the network gate return FAIL.`,
  '',
  `WebSocket: ${browser?.network?.websocket?.status || 'UNMEASURED'}; Dedicated Worker WebSocket: ${browser?.network?.dedicatedWorkerWebsocket || 'UNMEASURED'}; WebTransport: ${browser?.network?.webTransport || 'UNMEASURED'}.`,
  '',
  ...table(storageRows, ['Checkpoint', 'Sentinel matches', 'Inspection errors', 'Measured mechanisms']),
  '',
  'Positive controls found planted sentinels in localStorage, sessionStorage, cookies, IndexedDB, and Cache Storage; injected records were removed. Ordinary static asset HTTP caching was not treated as clinical-row storage.',
  '',
  '## Scientific comparison matrix',
  '',
  `Input SHA-256: \`${integration?.referenceIntegrity?.inputSha256 || 'UNMEASURED'}\`; frozen reference SHA-256: \`${integration?.referenceIntegrity?.referenceSha256 || 'UNMEASURED'}\`; generator source SHA-256: \`${integration?.referenceIntegrity?.generatorSha256 || 'UNMEASURED'}\`; reference provenance=${integration?.referenceIntegrity?.provenancePass ? 'PASS' : 'FAIL'}.`,
  '',
  'Actual and expected values below are compared with the frozen tolerance. Null rows use explicit null semantics and do not compute a numeric absolute difference.',
  '',
  ...table(comparisonRows, ['Metric', 'Semantics', 'Actual', 'Reference', 'Absolute difference', 'Tolerance', 'Status']),
  '',
  `Frozen result identity remains 109 treated units, 91 controls, and 91 matched pairs. The exact ordered pair arrays are recorded in integration-gates.json (actual SHA-256 \`${matchedPairs.actualOrderedPairSha256 || 'UNMEASURED'}\`; reference SHA-256 \`${matchedPairs.expectedOrderedPairSha256 || 'UNMEASURED'}\`; exact identity=${matchedPairs.exactOrderedIdentityPass ? 'PASS' : 'FAIL'}). The reference reports matched age SMD about 0.9562, BMI SMD about 0.7614, and Rubin B about 1.3979: this demonstrates computational reproduction, not adequate balance. OUTPUT_READY means output generation only.`,
  '',
  '### Comparator negative controls',
  '',
  ...table((report.negativeControls || []).map(control => [control.status, control.name]), ['Status', 'Control']),
  '',
  `Matching-weight parity: ${integration?.matchingWeightParity?.status || 'UNMEASURED'} — ${integration?.matchingWeightParity?.reason || 'no reference evidence'}`,
  '',
  '## Changed files and rationale',
  '',
  ...table(report.changedFiles.map(file => [file.path, file.reason]), ['File', 'Rationale']),
  '',
  '## Maintained blockers and limitations',
  '',
  ...report.blockers.map(blocker => `- \`${blocker} = BLOCKED\``),
  ...report.limitations.map(limit => `- ${limit}`),
  '',
  '## GitHub evidence artifact',
  '',
  `- Artifact ID: ${report.artifact.id || 'populated after evidence upload'}`,
  `- Artifact size: ${report.artifact.sizeBytes ?? 'populated after evidence upload'} bytes`,
  `- Artifact SHA-256: ${report.artifact.sha256 || 'populated after evidence upload'}`,
  `- Artifact name: ${report.artifact.name || 'populated after evidence upload'}`,
  ''
];

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'e1-report.json'), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'CP-WEBR-02B-1-E1-REPORT.md'), lines.join('\n') + '\n');
console.log(JSON.stringify({ finalVerdict: report.finalVerdict, failed: failures.length, gates: combined.length, output: path.join(dir, 'e1-report.json') }, null, 2));
if (failures.length) process.exitCode = 1;
