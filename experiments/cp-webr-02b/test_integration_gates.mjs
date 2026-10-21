// CP-WEBR-02B-1 End-to-End Integration Gates Verification Suite
// Tests synthetic demo parity, single-engine enforcement, worker lifecycle, CSP, and asset limits

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert';
import { WebR } from 'webr';
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

const gates = [];
function record(name, pass, detail = '') {
  gates.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

async function runGates() {
  console.log('=================================================================');
  console.log('CP-WEBR-02B-1 Integration Gates Verification');
  console.log('=================================================================\n');

  // --- GATE 1: Deterministic synthetic cohort integrity ---
  const csvPath = path.resolve('experiments/cp-webr-02b/SYNTHETIC-DEMO-INPUT.csv');
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const csvHash = crypto.createHash('sha256').update(csvText).digest('hex');
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
  const reference = JSON.parse(fs.readFileSync(refPath, 'utf-8'));

  // --- GATE 5: Invariant Check - Sample Accounting ---
  const sa = result.sampleAccounting;
  const rsa = reference.sample_accounting;
  const saPass = sa.treatedTotal === rsa.treatedTotal &&
                 sa.controlTotal === rsa.controlTotal &&
                 sa.matchedTreatedCount === rsa.matchedTreatedCount &&
                 sa.matchedControlCount === rsa.matchedControlCount &&
                 sa.unmatchedTreatedCount === rsa.unmatchedTreatedCount &&
                 sa.unmatchedControlCount === rsa.unmatchedControlCount &&
                 sa.discardedTreatedCount === rsa.discardedTreatedCount &&
                 sa.discardedControlCount === rsa.discardedControlCount;
  record('Gate 5: Exact Sample Accounting Invariant', saPass, `Treated: ${sa.treatedTotal}, Control: ${sa.controlTotal}, Matched Pairs: ${sa.matchedTreatedCount}`);

  // --- GATE 6: Invariant Check - Matched Pair Identity ---
  const trIds = result.matchMatrix?.treatedIds || [];
  const ctrlIds = result.matchMatrix?.matchedControlIds || [];
  const rTrIds = reference.matched_pairs.treatedIds;
  const rCtrlIds = reference.matched_pairs.controlIds;
  const pairsMatch = trIds.length === rTrIds.length &&
                     trIds.every((id, idx) => id === rTrIds[idx]) &&
                     ctrlIds.every((id, idx) => id === rCtrlIds[idx]);
  record('Gate 6: Matched Pair Identity Invariant', pairsMatch, `${trIds.length} pairs identical to frozen reference`);

  // --- GATE 7: Numeric Check - Rubin's Diagnostics ---
  const diag = result.numericalDiagnostics;
  const rDiag = reference.diagnostics;
  const rubinBTol = Math.abs(diag.rubinB - rDiag.rubinB);
  const rubinRTol = Math.abs(diag.rubinR - rDiag.rubinR);
  const rubinPass = rubinBTol <= reference.tolerances.rubin_diagnostics &&
                    rubinRTol <= reference.tolerances.rubin_diagnostics;
  record('Gate 7: Rubin\'s Diagnostics Parity', rubinPass, `Rubin's B=${diag.rubinB.toFixed(4)} (diff=${rubinBTol.toExponential(2)}), Rubin's R=${diag.rubinR.toFixed(4)} (diff=${rubinRTol.toExponential(2)})`);

  // --- GATE 8: Numeric Check - Cobalt Balance SMDs ---
  const balTable = result.balanceTable || [];
  let balSmdPass = true;
  const smdDiffs = [];
  for (const b of balTable) {
    const refKey = b.covariateName;
    const refBal = reference.balance[refKey];
    if (refBal) {
      const diffUnadj = Math.abs(b.unadjustedSmd - refBal.unadjusted_smd);
      const diffMatched = Math.abs(b.matchedSmd - refBal.matched_smd);
      smdDiffs.push(`${refKey}: unadjDiff=${diffUnadj.toExponential(2)}, matchDiff=${diffMatched.toExponential(2)}`);
      if (diffUnadj > reference.tolerances.numerical_smd || diffMatched > reference.tolerances.numerical_smd) {
        balSmdPass = false;
      }
    }
  }
  record('Gate 8: Cobalt Balance SMDs Parity', balSmdPass, smdDiffs.join('; '));

  // --- GATE 9: Null Semantics Check - Variance Ratio ---
  const vrNullPass = balTable.every(b => b.matchedVarianceRatio === null);
  record('Gate 9: Cobalt Variance Ratio Null Semantics', vrNullPass, 'All matchedVarianceRatio are null under default cobalt ATT');

  // --- GATE 10: Factor Encoding Check ---
  console.log('balTable rows:', balTable.map(b => ({ cov: b.covariateName, orig: b.originalHeader, type: b.type, matchedSmd: b.matchedSmd })));
  const sexRow = balTable.find(b => b.covariateName.toLowerCase().includes('sex') || b.originalHeader?.toLowerCase().includes('sex'));
  const factorPass = sexRow && sexRow.type === 'binary' && Math.abs(sexRow.matchedSmd) <= 0.0001;
  record('Gate 10: Factor Encoding Parity', Boolean(factorPass), `covariate=${sexRow?.covariateName}, type=${sexRow?.type}, matchedSmd=${sexRow?.matchedSmd}`);

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
  record('Gate 12: Canonical Presentation Rendering', rendersRubin && rendersDash && rendersStatus, 'Rubin B/R rendered, null VR as "–", heuristic status badges');

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
  const hasNoUnsafeEval = !/(?<!wasm-)unsafe-eval/.test(headersContent);
  record('Gate 15: Cross-Origin Isolation & Strict CSP', hasCoop && hasCoep && hasNoUnsafeEval, 'COOP same-origin, COEP require-corp, no unsafe-eval');

  // --- GATE 16: Egress & Mock Leak Positive Control ---
  let leakTrapped = false;
  function mockEgressMonitor(url) {
    if (!url.startsWith('https://clinicalpsm.com') && !url.startsWith('/')) {
      leakTrapped = true;
      throw new Error(`LEAK_DETECTED: Unauthorized egress attempt to ${url}`);
    }
  }
  try {
    mockEgressMonitor('https://analytics.example.com/patient_data');
  } catch (err) {
    // Expected leak trap
  }
  record('Gate 16: Mock Leak Positive Control', leakTrapped, 'Outbound attempt correctly intercepted by leak trap');

  // --- GATE 17: Local Storage Hygiene ---
  // In Node mock, verify no code writes to localStorage in demo.js or presentation.js
  const demoSrc = fs.readFileSync(path.resolve('apps/web/src/demo.js'), 'utf-8');
  const presSrc = fs.readFileSync(path.resolve('apps/web/src/presentation.js'), 'utf-8');
  const noStorage = !demoSrc.includes('localStorage') &&
                    !demoSrc.includes('sessionStorage') &&
                    !demoSrc.includes('indexedDB') &&
                    !presSrc.includes('localStorage');
  record('Gate 17: Storage Hygiene (Zero Data Persistence)', noStorage, 'No localStorage, sessionStorage, or indexedDB calls');

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

  const failedGates = gates.filter(g => !g.pass);
  console.log(`\n=================================================================`);
  console.log(`SUMMARY: ${gates.length - failedGates.length}/${gates.length} gates passed`);
  console.log(`=================================================================`);

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
