// CP-WEBR-02B-1 End-to-End Integration Gates Verification Suite
// Tests synthetic demo parity, single-engine enforcement, worker lifecycle, CSP, and asset limits

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert';
import { WebR } from '../cp-webr-00b/.cache/webr/dist/webr.mjs';
import { createServer } from '../cp-webr-02a/browser-harness/server.mjs';
import { WebRStatisticalAdapter } from '../../src/lib/webr/webr_adapter.mjs';
import { verifyEnvelope } from '../../src/lib/webr/canonical_serializer.mjs';
import { validateOptions, constructWebREnvironment } from '../../src/lib/webr/webr_binding.mjs';
import { SymbolMapper } from '../../src/lib/webr/symbol_mapper.mjs';
import { renderCanonicalResult } from '../../apps/web/src/presentation.js';
import { WorkerLifecycleManager } from '../../src/lib/webr/worker_manager.mjs';

const PORT = 8896;
const PINNED_TEMPLATE_SHA256 = '7989403c7d093031b93a9c971a6d4f055101bab83c0ec4417fc52e4dceee24a4';
const EXPECTED_INPUT_SHA256 = '062227c62d5864b4ae9acfe2c4a0aa5066557b2bd9cdf467f199cb743fcadd42';
const EXPECTED_GENERATOR_SHA256 = '9546a1ae9ba059d6db7b0898668a83fcde8710a8f642a967c92d17e5c9b5dcdb';
const EXPECTED_REFERENCE_SHA256 = 'dbd1311c4f348cb60cb2da94d513767537938af6b25bba08574b25c0bf02abcb';
const GATES_EVIDENCE_FILE = process.env.CP_WEBR_EVIDENCE_FILE || '/tmp/cp-webr-02b-integration-gates.json';

const gates = [];
const comparisons = [];
function record(name, pass, detail = '') {
  const status = pass === true ? 'PASS' : pass === false ? 'FAIL' : pass;
  gates.push({ name, status, detail });
  console.log(`${status.padEnd(9)} ${name}${detail ? ' :: ' + detail : ''}`);
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function exactArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function compareNullableNumber(name, actual, expected, tolerance, rows) {
  if (expected === null) {
    const pass = actual === null;
    rows.push({ name, semantics: 'null', actual, expected: null, absoluteDifference: null, tolerance: null, status: pass ? 'PASS' : 'FAIL' });
    return pass;
  }
  if (actual === null || actual === undefined || typeof actual !== 'number' || !Number.isFinite(actual)) {
    rows.push({ name, semantics: 'numeric', actual: actual ?? null, expected, absoluteDifference: null, tolerance, status: 'FAIL' });
    return false;
  }
  const absoluteDifference = Math.abs(actual - expected);
  const pass = absoluteDifference <= tolerance;
  rows.push({ name, semantics: 'numeric', actual, expected, absoluteDifference, tolerance, status: pass ? 'PASS' : 'FAIL' });
  return pass;
}

function referenceKeyForBalanceRow(row, result) {
  const name = row?.covariateName;
  for (const factor of Object.values(result.factorConfiguration || {})) {
    const alias = factor?.internalAlias;
    if (!alias || typeof name !== 'string') continue;
    if (name === alias) return factor.originalHeader;
    if (name.startsWith(`${alias}_`)) {
      const level = name.slice(alias.length + 1);
      if (Array.isArray(factor.levels) && factor.levels.includes(level)) return `${factor.originalHeader}_${level}`;
    }
  }
  return name;
}

function compareResultToReference(result, reference) {
  const failures = [];
  const rows = [];
  const expect = (condition, label) => { if (!condition) failures.push(label); };
  const sa = result.sampleAccounting || {};
  const rsa = reference.sample_accounting || {};
  for (const key of [
    'treatedTotal', 'controlTotal', 'matchedTreatedCount', 'matchedControlCount',
    'unmatchedTreatedCount', 'unmatchedControlCount', 'discardedTreatedCount', 'discardedControlCount'
  ]) expect(sa[key] === rsa[key], `sample_accounting.${key}`);

  const expectedKeys = Object.keys(reference.balance || {}).sort();
  const balanceRows = result.balanceTable || [];
  const actualKeys = balanceRows.map(row => referenceKeyForBalanceRow(row, result)).sort();
  const uniqueActualKeys = new Set(actualKeys);
  expect(uniqueActualKeys.size === actualKeys.length, 'duplicate balance records');
  expect(exactArray(actualKeys, expectedKeys), 'balance covariate key set/cardinality');

  const treatedIds = result.matchMatrix?.treatedIds;
  const controlIds = result.matchMatrix?.matchedControlIds;
  const expectedTreatedIds = reference.matched_pairs?.treatedIds;
  const expectedControlIds = reference.matched_pairs?.controlIds;
  expect(exactArray(treatedIds, expectedTreatedIds), 'ordered treated matched-pair identity');
  expect(exactArray(controlIds, expectedControlIds), 'ordered control matched-pair identity');
  expect(Array.isArray(treatedIds) && new Set(treatedIds).size === treatedIds.length, 'duplicate treated pair IDs');
  expect(Array.isArray(controlIds) && new Set(controlIds).size === controlIds.length, 'duplicate control pair IDs');
  expect(Array.isArray(treatedIds) && treatedIds.length === rsa.matchedPairs, 'matched pair cardinality');

  const sexFactor = Object.values(result.factorConfiguration || {}).find(f => f?.originalHeader === 'sex');
  expect(Boolean(sexFactor), 'sex factor configuration present');
  expect(sexFactor?.inferredType === 'categorical', 'sex factor type');
  expect(exactArray(sexFactor?.levels, ['F', 'M']), 'sex factor level order');
  expect(sexFactor?.referenceLevel === 'F', 'sex reference contrast identity');
  expect(expectedKeys.includes('sex_M'), 'frozen binary contrast key sex_M');

  const actualByKey = new Map(balanceRows.map(row => [referenceKeyForBalanceRow(row, result), row]));
  let numericPass = compareNullableNumber('rubinB', result.numericalDiagnostics?.rubinB, reference.diagnostics?.rubinB, reference.tolerances?.rubin_diagnostics, rows);
  numericPass = compareNullableNumber('rubinR', result.numericalDiagnostics?.rubinR, reference.diagnostics?.rubinR, reference.tolerances?.rubin_diagnostics, rows) && numericPass;
  for (const key of expectedKeys) {
    const actual = actualByKey.get(key);
    const ref = reference.balance[key];
    if (!actual || !ref) {
      numericPass = false;
      rows.push({ name: `${key}.record`, semantics: 'record', actual: Boolean(actual), expected: Boolean(ref), absoluteDifference: null, tolerance: null, status: 'FAIL' });
      continue;
    }
    for (const [field, refField, tolerance] of [
      ['unadjustedSmd', 'unadjusted_smd', reference.tolerances?.numerical_smd],
      ['matchedSmd', 'matched_smd', reference.tolerances?.numerical_smd],
      ['rawDifferenceUnadjusted', 'raw_diff_unadjusted', reference.tolerances?.numerical_raw_diff],
      ['rawDifferenceMatched', 'raw_diff_matched', reference.tolerances?.numerical_raw_diff],
      ['unadjustedVarianceRatio', 'unadjusted_variance_ratio', reference.tolerances?.numerical_smd],
      ['matchedVarianceRatio', 'matched_variance_ratio', reference.tolerances?.numerical_smd]
    ]) {
      numericPass = compareNullableNumber(`${key}.${field}`, actual[field], ref[refField], tolerance, rows) && numericPass;
    }
  }

  // The frozen 02B reference has no matching_weights field; parity cannot be measured from it.
  const matchingWeightParity = reference.matching_weights
    ? { status: 'UNMEASURED', reason: 'Reference weights are present but no explicit weight parity comparator is implemented.' }
    : { status: 'UNMEASURED', reason: 'Frozen reference does not contain matching_weights.' };

  expect(numericPass, 'numeric/null balance and diagnostic parity');
  return { pass: failures.length === 0, failures, rows, matchingWeightParity, expectedKeys, actualKeys };
}

function referenceIntegrity({ referenceText, reference, generatorSource, csvText }) {
  return {
    referenceSha256: sha256(referenceText),
    referenceHashPass: sha256(referenceText) === EXPECTED_REFERENCE_SHA256,
    generatorSha256: sha256(generatorSource),
    generatorHashPass: reference.generator_source_sha256 === sha256(generatorSource) && sha256(generatorSource) === EXPECTED_GENERATOR_SHA256,
    inputSha256: sha256(csvText),
    inputHashPass: reference.input_csv_sha256 === sha256(csvText) && sha256(csvText) === EXPECTED_INPUT_SHA256,
    provenancePass: reference.provenance === 'OFFICIAL_R_MATCHIT_COBALT_INDEPENDENT_EVALUATION' &&
      reference.method_description.includes('without ClinicalPSM adapter or template layers') &&
      reference.execution_command === 'node experiments/cp-webr-02b/generate_synthetic_demo_reference.mjs'
  };
}

function runNegativeControls(result, reference, referenceText, generatorSource, csvText) {
  const controls = [];
  const check = (name, rejected) => controls.push({ name, status: rejected ? 'PASS' : 'FAIL' });
  const dropped = structuredClone(result);
  dropped.balanceTable = dropped.balanceTable.filter(row => referenceKeyForBalanceRow(row, dropped) !== 'age');
  check('missing covariate rejected', !compareResultToReference(dropped, reference).pass);
  const unexpected = structuredClone(result);
  unexpected.balanceTable.push({ covariateName: 'unexpected_covariate', unadjustedSmd: 0, matchedSmd: 0 });
  check('unexpected covariate rejected', !compareResultToReference(unexpected, reference).pass);
  const duplicate = structuredClone(result);
  duplicate.balanceTable.push(structuredClone(duplicate.balanceTable[0]));
  check('duplicate balance record rejected', !compareResultToReference(duplicate, reference).pass);
  const mutatedSmd = structuredClone(result);
  mutatedSmd.balanceTable.find(row => referenceKeyForBalanceRow(row, mutatedSmd) === 'age').matchedSmd += 0.01;
  check('plausible SMD mutation detected', !compareResultToReference(mutatedSmd, reference).pass);
  const mutatedReference = structuredClone(reference);
  mutatedReference.diagnostics.rubinR += 0.05;
  check('reference value mutation detected', !compareResultToReference(result, mutatedReference).pass);
  const nullCorruption = structuredClone(result);
  nullCorruption.numericalDiagnostics.rubinB = null;
  check('numeric-to-null corruption detected', !compareResultToReference(nullCorruption, reference).pass);
  const alteredReference = structuredClone(reference);
  alteredReference.provenance = 'ALTERED_PROVENANCE';
  const alteredReferenceText = JSON.stringify(alteredReference, null, 2) + '\n';
  const alteredIntegrity = referenceIntegrity({ referenceText: alteredReferenceText, reference: alteredReference, generatorSource, csvText });
  check('reference provenance tamper detected', !alteredIntegrity.provenancePass);
  check('reference hash tamper detected', !alteredIntegrity.referenceHashPass);
  const wrongSource = `${generatorSource}\n// tamper`;
  const alteredGeneratorIntegrity = referenceIntegrity({ referenceText, reference, generatorSource: wrongSource, csvText });
  check('generator provenance hash tamper detected', !alteredGeneratorIntegrity.generatorHashPass);
  return controls;
}

async function runGates() {
  console.log('=================================================================');
  console.log('CP-WEBR-02B-1 Integration Gates Verification');
  console.log('=================================================================\n');

  // --- GATE 1: Deterministic synthetic cohort integrity ---
  const csvPath = path.resolve('experiments/cp-webr-02b/SYNTHETIC-DEMO-INPUT.csv');
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const csvHash = crypto.createHash('sha256').update(csvText).digest('hex');
  const generatorSource = fs.readFileSync(path.resolve('experiments/cp-webr-02b/generate_synthetic_demo_reference.mjs'), 'utf-8');
  const lines = csvText.trim().split('\n');
  record('Gate 1: Synthetic Cohort Input Integrity', csvHash === EXPECTED_INPUT_SHA256 && lines.length === 201, `SHA-256=${csvHash.slice(0, 16)}..., rows=${lines.length - 1}`);

  // Parse CSV rows into DatasetInput
  const headers = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    rows.push({
      id: parts[0],
      age: Number(parts[1]),
      bmi: Number(parts[2]),
      sex: parts[3],
      treated: Number(parts[4])
    });
  }

  const datasetInput = {
    datasetId: 'synthetic_demo_cohort_200',
    headers: ['id', 'age', 'bmi', 'sex', 'treated'],
    treatmentVariable: 'treated',
    covariates: ['age', 'bmi', 'sex'],
    covariateDefinitions: {
      age: { originalHeader: 'age', inferredType: 'continuous' },
      bmi: { originalHeader: 'bmi', inferredType: 'continuous' },
      sex: {
        originalHeader: 'sex',
        inferredType: 'categorical',
        levels: ['F', 'M'],
        referenceLevel: 'F'
      }
    },
    rows,
    options: {
      method: 'nearest',
      distanceMetric: 'linear.logit',
      ratio: 1,
      replace: false,
      matchingOrder: 'largest',
      caliper: null,
      discard: 'none'
    }
  };

  // --- GATE 2: Exact DatasetInput schema validation ---
  let optionsValid = false;
  try {
    validateOptions(datasetInput.options);
    optionsValid = true;
  } catch (e) {
    optionsValid = false;
  }

  let unknownOptionRejected = false;
  try {
    validateOptions({ unapprovedOption: 'evil' });
  } catch (e) {
    unknownOptionRejected = e.message.includes('UNKNOWN_OPTION_REJECTED');
  }

  record('Gate 2: DatasetInput Schema & Fail-Closed Validation', optionsValid && unknownOptionRejected, 'Valid options pass; unapproved option throws UNKNOWN_OPTION_REJECTED');

  // --- GATE 3: Authoritative R template SHA-256 verification ---
  const templatePath = path.resolve('experiments/cp-webr-02a/adapter/r_template.R');
  const templateSource = fs.readFileSync(templatePath, 'utf-8');
  const templateSha = crypto.createHash('sha256').update(templateSource).digest('hex');
  record('Gate 3: Authoritative R Template Digest Match', templateSha === PINNED_TEMPLATE_SHA256, `SHA-256=${templateSha}`);

  // Start package server for local repo
  const server = createServer();
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

  // Initialize WebR and adapter
  const webR = new WebR();
  await webR.init();
  const REQUIRED_PACKAGES = [
    'Rcpp', 'R6', 'cli', 'rlang', 'vctrs', 'glue', 'withr', 'lifecycle',
    'gtable', 'scales', 'farver', 'labeling', 'isoband', 'ggplot2',
    'gridExtra', 'viridisLite', 'S7', 'arg', 'RColorBrewer', 'MatchIt', 'cobalt'
  ];
  await webR.installPackages(REQUIRED_PACKAGES, { repos: [`http://127.0.0.1:${PORT}/repo`] });
  await webR.evalR('library(MatchIt); library(cobalt);');

  const adapter = new WebRStatisticalAdapter(webR);
  await adapter.initTemplate(templateSource, templateSha);

  // Execute analysis with adapter
  const envelope = await adapter.runAnalysis(datasetInput);
  const verifyEnv = await verifyEnvelope(envelope);
  const result = envelope.payload;

  // --- GATE 4: Versioned Canonical Envelope Validation ---
  record('Gate 4: Canonical Envelope Verification', verifyEnv.valid && envelope.envelopeVersion === '1.0.0', `Envelope payload valid, schema verified: ${verifyEnv.valid}`);

  // Load frozen reference
  const refPath = path.resolve('experiments/cp-webr-02b/SYNTHETIC-DEMO-REFERENCE.json');
  const referenceText = fs.readFileSync(refPath, 'utf-8');
  const reference = JSON.parse(referenceText);
  const integrity = referenceIntegrity({ referenceText, reference, generatorSource, csvText });
  record('Gate 5: Frozen Reference and Provenance Integrity', integrity.referenceHashPass && integrity.generatorHashPass && integrity.inputHashPass && integrity.provenancePass,
    `reference=${integrity.referenceSha256}; generator=${integrity.generatorSha256}; input=${integrity.inputSha256}`);

  // --- GATES 6-10: Exact records, ordered pairs, numeric parity and null semantics ---
  const comparison = compareResultToReference(result, reference);
  comparisons.push(...comparison.rows);
  const sa = result.sampleAccounting || {};
  const rsa = reference.sample_accounting || {};
  record('Gate 6: Exact Sample Accounting and Record Cardinality',
    !comparison.failures.some(x => x.startsWith('sample_accounting.') || x.includes('cardinality') || x.includes('balance covariate key') || x.includes('duplicate balance')),
    `Treated=${sa.treatedTotal}/${rsa.treatedTotal}; control=${sa.controlTotal}/${rsa.controlTotal}; pairs=${sa.matchedTreatedCount}/${rsa.matchedPairs}; balance keys=${comparison.actualKeys.join(',')}`);
  record('Gate 7: Exact Ordered Matched-Pair Identity', !comparison.failures.some(x => x.includes('matched-pair') || x.includes('pair IDs') || x.includes('pair cardinality')),
    `${result.matchMatrix?.treatedIds?.length || 0} treated/control pairs compared in reference order`);
  const rubinRows = comparison.rows.filter(row => row.name === 'rubinB' || row.name === 'rubinR');
  record('Gate 8: Rubin Diagnostics Numeric Parity', rubinRows.every(row => row.status === 'PASS'),
    `B=${result.numericalDiagnostics?.rubinB}; R=${result.numericalDiagnostics?.rubinR}; frozen Rubin tolerance=${reference.tolerances.rubin_diagnostics}`);
  const smdAndRawRows = comparison.rows.filter(row => /\.(unadjustedSmd|matchedSmd|rawDifferenceUnadjusted|rawDifferenceMatched)$/.test(row.name));
  record('Gate 9: Before/After SMD and Binary Raw-Difference Parity', smdAndRawRows.every(row => row.status === 'PASS'),
    `SMD tolerance=${reference.tolerances.numerical_smd}; raw-difference tolerance=${reference.tolerances.numerical_raw_diff}; rows=${smdAndRawRows.length}`);
  const nullRows = comparison.rows.filter(row => row.semantics === 'null');
  record('Gate 10: Numeric and Null Semantics Separation', nullRows.length > 0 && nullRows.every(row => row.status === 'PASS'),
    `explicit null comparisons=${nullRows.length}; numeric-to-null corruption is a negative control`);
  record('Gate 19: Factor Contrast Identity and Full Covariate Key Set',
    !comparison.failures.some(x => x.includes('factor') || x.includes('sex') || x.includes('covariate') || x.includes('balance')),
    `expected keys=${comparison.expectedKeys.join(',')}; actual keys=${comparison.actualKeys.join(',')}; sex reference=F; contrast=sex_M`);
  const negativeControls = runNegativeControls(result, reference, referenceText, generatorSource, csvText);
  record('Gate 20: Comparator Negative Controls', negativeControls.every(control => control.status === 'PASS'),
    negativeControls.map(control => `${control.name}:${control.status}`).join('; '));
  record('Gate 21: Matching-Weight Parity Evidence', comparison.matchingWeightParity.status,
    comparison.matchingWeightParity.reason);

  // --- GATE 11: Single Scientific Engine in apps/web ---
  const legacyWorkerExists = fs.existsSync(path.resolve('apps/web/public/assets/psm-worker.js'));
  const webrWorkerExists = fs.existsSync(path.resolve('apps/web/public/assets/webr-worker.js'));
  record('Gate 11: Single Engine Enforcement in apps/web', !legacyWorkerExists && webrWorkerExists, `psm-worker.js exists=${legacyWorkerExists}, webr-worker.js exists=${webrWorkerExists}`);

  // --- GATE 12: Presentation Rendering ---
  const i18n = JSON.parse(fs.readFileSync(path.resolve('apps/web/src/content.json'), 'utf-8'));
  const renderedHtml = renderCanonicalResult(result, i18n.en.demo);
  const rendersRubin = renderedHtml.includes('Rubin&#39;s B') || renderedHtml.includes("Rubin's B");
  const rendersDash = renderedHtml.includes('<td>–</td>');
  const rendersStatus = renderedHtml.includes('badge-imbalanced') && renderedHtml.includes('badge-balanced');
  const rendersNonCertification = renderedHtml.includes('data-certification="not-certified"') && renderedHtml.includes('OUTPUT_READY means an output was generated');
  record('Gate 12: Presentation and Non-Certification Explanation', rendersRubin && rendersDash && rendersStatus && rendersNonCertification,
    'Rubin B/R, null VR, heuristic badges and residual imbalance warning are rendered.');

  // --- GATE 13: Worker Lifecycle & State Machine ---
  let mockWorkerPostMessageCount = 0;
  let terminated = false;
  class MockWorker {
    constructor() {
      this.onmessage = null;
      this.onerror = null;
    }
    postMessage(data) {
      mockWorkerPostMessageCount++;
      if (data.type === 'INIT') {
        setTimeout(() => {
          if (this.onmessage) {
            this.onmessage({
              data: {
                type: 'INIT_SUCCESS',
                id: data.id,
                payload: { templateSha256: PINNED_TEMPLATE_SHA256 }
              }
            });
          }
        }, 10);
      } else if (data.type === 'RUN_ANALYSIS') {
        setTimeout(() => {
          if (this.onmessage) {
            this.onmessage({
              data: {
                type: 'EXECUTE_SUCCESS',
                id: data.id,
                jobId: data.jobId,
                payload: envelope
              }
            });
          }
        }, 10);
      } else if (data.type === 'INTERRUPT') {
        setTimeout(() => {
          if (this.onmessage) {
            this.onmessage({
              data: {
                type: 'EXECUTE_ERROR',
                id: data.id,
                jobId: data.targetJobId,
                error: {
                  code: 'OPERATION_CANCELLED',
                  message: 'Analysis interrupted'
                }
              }
            });
          }
        }, 10);
      }
    }
    terminate() {
      terminated = true;
    }
  }

  const manager = new WorkerLifecycleManager(() => new MockWorker());
  let stateHistory = [];
  manager.onStateChange(st => stateHistory.push(st));

  // Initialize
  await manager.initialize({ baseUrl: '/webr/', repoUrl: '/repo', templateUrl: '/adapter/r_template.R' });
  assert.strictEqual(manager.getState(), 'READY');

  // Test submitAnalysis
  const analysisPromise = manager.submitAnalysis({ ...datasetInput });
  assert.strictEqual(manager.getState(), 'RUNNING');
  const res = await analysisPromise;
  assert.strictEqual(manager.getState(), 'READY');
  assert.strictEqual(res.payload.sampleAccounting.treatedTotal, 109);

  // Test concurrency rejection
  let concurrencyRejected = false;
  const longPromise = manager.submitAnalysis({ ...datasetInput });
  try {
    await manager.submitAnalysis({ ...datasetInput });
  } catch (err) {
    concurrencyRejected = err.code === 'CONCURRENCY_ERROR';
  }
  await longPromise;

  record('Gate 13: Worker Lifecycle & Concurrency Protocol', concurrencyRejected && stateHistory.includes('RUNNING'), 'Transitions: ' + stateHistory.join(' -> '));

  // --- GATE 14: Stale Job Message Rejection ---
  const managerStale = new WorkerLifecycleManager(() => new MockWorker());
  await managerStale.initialize({ baseUrl: '/webr/', repoUrl: '/repo', templateUrl: '/adapter/r_template.R' });
  let staleIgnored = true;
  const mockW = managerStale.worker;
  // Simulate stale worker message with obsolete jobId
  try {
    mockW.onmessage({
      data: {
        type: 'EXECUTE_SUCCESS',
        jobId: 'obsolete_stale_job_id',
        payload: {}
      }
    });
  } catch (err) {
    staleIgnored = false;
  }
  record('Gate 14: Stale Job Message Rejection', staleIgnored, 'Worker ignores messages not matching active currentJob');

  // --- GATE 15: Security & CSP Verification ---
  const headersPath = path.resolve('apps/web/public/_headers');
  const headersContent = fs.readFileSync(headersPath, 'utf-8');
  const hasCoop = headersContent.includes('Cross-Origin-Opener-Policy: same-origin');
  const hasCoep = headersContent.includes('Cross-Origin-Embedder-Policy: require-corp');
  let activePath = '';
  const unsafeEvalRules = [];
  for (const line of headersContent.split(/\r?\n/)) {
    if (line.trim() && !/^\s/.test(line)) activePath = line.trim();
    const policy = line.match(/^\s*Content-Security-Policy:\s*(.*)$/i)?.[1];
    if (policy && /(?<!wasm-)unsafe-eval/.test(policy)) unsafeEvalRules.push({ path: activePath, policy });
  }
  const unsafeEvalCount = (headersContent.match(/(?<!wasm-)unsafe-eval/g) || []).length;
  const onlyNarrowWebrException = unsafeEvalRules.length === 1 && unsafeEvalRules[0].path === '/assets/webr/webr-worker.js' &&
    unsafeEvalCount === 1 &&
    /(?:^|;)\s*script-src\s+[^;]*'unsafe-eval'[^;]*(?:;|$)/.test(unsafeEvalRules[0].policy);
  const noOtherUnsafeCspTokens = !/(?<!wasm-)unsafe-(?!eval)/.test(headersContent);
  record('Gate 15: COOP/COEP and bounded WebR CSP deviation', hasCoop && hasCoep && onlyNarrowWebrException && noOtherUnsafeCspTokens,
    'COOP same-origin; COEP require-corp; one unsafe-eval in /assets/webr/webr-worker.js after strict runtime failure; other unsafe CSP tokens absent');

  // Node cannot qualify browser runtime behavior. Browser tests produce these gates separately.
  record('Gate 16: Runtime Network Egress Qualification', 'UNMEASURED', 'Requires Chromium request interception; see browser runtime evidence.');
  record('Gate 17: Runtime Browser Storage Qualification', 'UNMEASURED', 'Requires Chromium storage inspection; see browser runtime evidence.');

  // --- GATE 18: Static Asset Deployment Quotas ---
  let fileCount = 0;
  let maxFileSize = 0;
  let maxFileName = '';
  function walkDir(dir) {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        walkDir(p);
      } else {
        fileCount++;
        if (stat.size > maxFileSize) {
          maxFileSize = stat.size;
          maxFileName = p;
        }
      }
    }
  }
  walkDir(path.resolve('apps/web/public'));
  const quotaPass = fileCount <= 20000 && maxFileSize <= 25 * 1024 * 1024;
  record('Gate 18: Cloudflare Static Assets Quota Audit', quotaPass, `Files: ${fileCount} (limit 20000), Largest: ${(maxFileSize / (1024 * 1024)).toFixed(2)} MiB [${path.basename(maxFileName)}] (limit 25 MiB)`);

  // Close server
  await new Promise(resolve => server.close(resolve));

  const failedGates = gates.filter(g => g.status === 'FAIL');
  const passedGates = gates.filter(g => g.status === 'PASS');
  const unmeasuredGates = gates.filter(g => g.status === 'UNMEASURED');
  const actualTreatedIds = result.matchMatrix?.treatedIds || [];
  const actualControlIds = result.matchMatrix?.matchedControlIds || [];
  const referenceTreatedIds = reference.matched_pairs?.treatedIds || [];
  const referenceControlIds = reference.matched_pairs?.controlIds || [];
  const orderedPairHash = (treatedIds, controlIds) => sha256(JSON.stringify({ treatedIds, controlIds }));
  const sexFactor = Object.values(result.factorConfiguration || {}).find(factor => factor?.originalHeader === 'sex') || null;
  console.log(`\n=================================================================`);
  console.log(`SUMMARY: ${passedGates.length} PASS, ${failedGates.length} FAIL, ${unmeasuredGates.length} UNMEASURED`);
  console.log(`=================================================================`);

  fs.mkdirSync(path.dirname(GATES_EVIDENCE_FILE), { recursive: true });
  fs.writeFileSync(GATES_EVIDENCE_FILE, JSON.stringify({
    suite: 'CP-WEBR-02B-1 integration comparator',
    generatedAt: new Date().toISOString(),
    commitSha: process.env.GITHUB_SHA || 'LOCAL_UNCOMMITTED',
    gates,
    referenceIntegrity: integrity,
    comparisons,
    scientificIdentity: {
      sampleAccounting: { actual: result.sampleAccounting, expected: reference.sample_accounting },
      balanceCovariateKeys: { actual: comparison.actualKeys, expected: comparison.expectedKeys },
      sexFactor: sexFactor ? { inferredType: sexFactor.inferredType, levels: sexFactor.levels, referenceLevel: sexFactor.referenceLevel } : null,
      matchedPairs: {
        actualTreatedIds,
        expectedTreatedIds: referenceTreatedIds,
        actualControlIds,
        expectedControlIds: referenceControlIds,
        actualOrderedPairSha256: orderedPairHash(actualTreatedIds, actualControlIds),
        expectedOrderedPairSha256: orderedPairHash(referenceTreatedIds, referenceControlIds),
        exactOrderedIdentityPass: exactArray(actualTreatedIds, referenceTreatedIds) && exactArray(actualControlIds, referenceControlIds)
      }
    },
    negativeControls,
    matchingWeightParity: comparison.matchingWeightParity,
    verdict: failedGates.length === 0 ? 'PASS' : 'FAIL'
  }, null, 2) + '\n');

  if (failedGates.length > 0) {
    console.error(`FAILED GATES: ${failedGates.map(g => g.name).join(', ')}`);
    process.exit(1);
  }
  process.exit(0);
}

runGates().catch(err => {
  console.error('Fatal error during gate execution:', err);
  process.exit(1);
});
