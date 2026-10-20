// CP-WEBR-02A Real Browser Qualification Suite
// Executes genuine browser automation via Playwright + Chromium
// Covers:
// 1. Worker CSP A/B qualification (strict vs permissive for full pipeline)
// 2. Dedicated Worker lifecycle (init, repeated runs, concurrency, cancellation, hard termination, recovery)
// 3. True offline execution via browserContext.setOffline(true)
// 4. Deep storage scanner positive control & 5-fault injection tests
// 5. Checkpoints T1-T5 residue audit
// 6. Tripartite network egress & mock falsification sink

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { chromium } from 'playwright';
import { createServer, PORT } from '../browser-harness/server.mjs';
import { verifyAccountingEquationString } from './test_scientific_parity.mjs';

function getGitCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return process.env.GITHUB_SHA || 'UNKNOWN_COMMIT_SHA';
  }
}

function getBrowserExecutable() {
  const custom = process.env.CHROMIUM_PATH || process.env.BROWSER_PATH;
  if (custom && fs.existsSync(custom)) return custom;

  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const SENTINELS = {
  PT_01: 'SYNTH_PT_7a9f8c12_SEC_TRACE_01',
  PT_02: 'SYNTH_PT_b3e4d567_SEC_TRACE_02',
  FACTOR_03: 'FACTOR_LEVEL_ALPHA_9f8e7d6c',
  FACTOR_04: 'FACTOR_LEVEL_BETA_1a2b3c4d',
  HEADER_05: 'Clinical Biomarker Δ [mg/dL]',
  FALSIFICATION_06: 'FALSIFICATION_SENTINEL_PAYLOAD_339a1c'
};

const EXECUTION_TIMESTAMP = process.env.QUALIFICATION_TIMESTAMP || new Date().toISOString();

const ALL_DATA_SENTINELS = [
  SENTINELS.PT_01,
  SENTINELS.PT_02,
  SENTINELS.FACTOR_03,
  SENTINELS.FACTOR_04,
  SENTINELS.HEADER_05
];

async function main() {
  const tStart = Date.now();
  const commitSha = getGitCommitSha();
  const osInfo = `${os.platform()} ${os.release()} (${os.arch()})`;
  const nodeVersion = process.version;

  console.log('======================================================');
  console.log('STARTING CP-WEBR-02A BROWSER QUALIFICATION SUITE');
  console.log('Commit SHA:', commitSha);
  console.log('OS Platform:', osInfo);
  console.log('Node Version:', nodeVersion);
  console.log('======================================================\n');

  // 1. Start Qualification Server
  const server = createServer();
  await new Promise(r => server.listen(PORT, r));
  console.log(`Local qualification server listening on http://localhost:${PORT}`);

  const browserExecutable = getBrowserExecutable();
  console.log(`Using Chromium executable: ${browserExecutable || 'Playwright bundled Chromium'}`);

  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--enable-features=SharedArrayBuffer'
    ]
  };
  if (browserExecutable) {
    launchOptions.executablePath = browserExecutable;
  }

  const browser = await chromium.launch(launchOptions);
  const browserVersion = browser.version();
  console.log(`Launched Chromium version: ${browserVersion}\n`);

  const context = await browser.newContext();

  // Monitor network routing for tripartite egress verification
  const networkAuditLog = [];
  const attemptDetectionLog = [];
  const preEgressAbortedLog = [];
  const serverRejectionLog = [];
  let currentPhase = 'INITIALIZATION';

  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    const headers = request.headers();
    const postData = request.postData();

    const isPreEgressPrevention =
      url.includes('/api/prohibited-leak-page-prevention') ||
      url.includes('/api/prohibited-leak-worker-prevention') ||
      url.includes('unauthorized-external-telemetry');

    const isServerRejection = url.includes('/api/prohibited-server-rejection');
    const isFalsification = url.includes('/api/mock-falsification-sink');

    const entry = {
      phase: currentPhase,
      url,
      method,
      headers,
      postDataLength: postData ? postData.length : 0,
      containsSentinel: postData ? ALL_DATA_SENTINELS.some(s => postData.includes(s)) : false,
      isPreEgressPrevention,
      isServerRejection,
      isFalsification
    };
    networkAuditLog.push(entry);

    if (isPreEgressPrevention || isServerRejection) {
      attemptDetectionLog.push({
        url,
        method,
        origin: headers.origin || 'unknown',
        hasSentinel: entry.containsSentinel,
        timestamp: EXECUTION_TIMESTAMP
      });
    }

    if (isPreEgressPrevention) {
      preEgressAbortedLog.push(entry);
      await route.abort('blockedbyclient');
      return;
    }

    if (isServerRejection) {
      serverRejectionLog.push(entry);
      await route.continue();
      return;
    }

    await route.continue();
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('[PAGE]', msg.text()));
  page.on('pageerror', err => console.error('[PAGE ERROR]', err));

  // -------------------------------------------------------------
  // Part 1: Page Cross-Origin Isolation & CSP Checks
  // -------------------------------------------------------------
  console.log('--- Phase 1: Cross-Origin Isolation & Page CSP ---');
  currentPhase = 'PAGE_CSP';

  const pageResp = await page.goto(`http://localhost:${PORT}/index.html`);
  const headers = pageResp.headers();
  const coop = headers['cross-origin-opener-policy'];
  const coep = headers['cross-origin-embedder-policy'];
  const corp = headers['cross-origin-resource-policy'];
  const pageIsolated = await page.evaluate(() => window.crossOriginIsolated);

  console.log(`Page crossOriginIsolated: ${pageIsolated}`);
  console.log(`COOP: ${coop}, COEP: ${coep}, CORP: ${corp}`);

  // Test strict page (without unsafe-eval)
  const strictPage = await context.newPage();
  await strictPage.goto(`http://localhost:${PORT}/index.html?csp=strict-page`);
  const evalTestResult = await strictPage.evaluate(async () => {
    return await window.Harness.testPageEvalAsync();
  });
  console.log(`Strict Page prohibited eval() rejected: ${evalTestResult.blocked} (${evalTestResult.error})`);
  await strictPage.close();

  // -------------------------------------------------------------
  // Part 2: Worker CSP A/B Matrix Qualification
  // -------------------------------------------------------------
  console.log('\n--- Phase 2: Worker CSP A/B Matrix (Strict vs Permissive) ---');
  currentPhase = 'WORKER_CSP_AB';

  const cspAbMatrix = await page.evaluate(async () => {
    return await window.Harness.runWorkerCspAbMatrix();
  });

  console.log('Profile C.1 (Strict Worker) evalAllowed:', cspAbMatrix.profileC1_strict.evalAllowed);
  console.log('Profile C.1 pipelineSuccess:', cspAbMatrix.profileC1_strict.pipelineSuccess);
  console.log('Profile C.1 failingOperation:', cspAbMatrix.profileC1_strict.failingOperation);
  console.log('Profile C.2 (Permissive Worker) evalAllowed:', cspAbMatrix.profileC2_permissive.evalAllowed);
  console.log('Profile C.2 pipelineSuccess:', cspAbMatrix.profileC2_permissive.pipelineSuccess);
  console.log('Worker unsafe-eval required:', cspAbMatrix.synthesis.workerUnsafeEvalRequired);

  const cspQualificationReport = {
    executed_at: EXECUTION_TIMESTAMP,
    commit_sha: commitSha,
    matrix: cspAbMatrix,
    verdict: (cspAbMatrix.profileC1_strict.pipelineSuccess === true || cspAbMatrix.profileC2_permissive.pipelineSuccess === true) ? 'PASS' : 'FAIL'
  };

  fs.writeFileSync(
    path.resolve('experiments/cp-webr-02a/CSP-AB-QUALIFICATION.json'),
    JSON.stringify(cspQualificationReport, null, 2)
  );
  console.log('Wrote experiments/cp-webr-02a/CSP-AB-QUALIFICATION.json');

  // -------------------------------------------------------------
  // Part 3: Dedicated Worker Lifecycle Suite
  // -------------------------------------------------------------
  console.log('\n--- Phase 3: Dedicated Worker Lifecycle Suite ---');
  currentPhase = 'WORKER_LIFECYCLE';

  const lifecycleResults = await page.evaluate(async () => {
    return await window.Harness.runWorkerLifecycleSuite();
  });

  console.log('Lifecycle initialization:', lifecycleResults.initialization?.pass, `(${lifecycleResults.initialization?.latencyMs?.toFixed(1)} ms)`);
  console.log('Lifecycle repeatedAnalyses:', lifecycleResults.repeatedAnalyses?.pass);
  console.log('Lifecycle singleJobConcurrency:', lifecycleResults.singleJobConcurrency?.pass);
  console.log('Lifecycle gracefulInterruption:', lifecycleResults.gracefulInterruption?.pass);
  console.log('Lifecycle hardTerminationFallback:', lifecycleResults.hardTerminationFallback?.pass);
  console.log('Lifecycle recoveryAndFreshAnalysis:', lifecycleResults.recoveryAndFreshAnalysis?.pass);
  console.log('Lifecycle hardTerminationAndRecovery:', lifecycleResults.hardTerminationAndRecovery?.pass);
  console.log('Lifecycle overallPass:', lifecycleResults.overallPass);

  const workerLifecycleReport = {
    executed_at: EXECUTION_TIMESTAMP,
    commit_sha: commitSha,
    results: lifecycleResults,
    verdict: lifecycleResults.overallPass ? 'PASS' : 'FAIL'
  };

  fs.writeFileSync(
    path.resolve('experiments/cp-webr-02a/WORKER-LIFECYCLE-AUDIT.json'),
    JSON.stringify(workerLifecycleReport, null, 2)
  );
  console.log('Wrote experiments/cp-webr-02a/WORKER-LIFECYCLE-AUDIT.json');

  // -------------------------------------------------------------
  // Part 4: Nominal Preload & True Offline Execution (context.setOffline)
  // -------------------------------------------------------------
  console.log('\n--- Phase 4: True Offline Execution via browserContext.setOffline(true) ---');
  currentPhase = 'OFFLINE_EXECUTION';

  await page.evaluate(() => window.Harness.createWorker());
  await page.evaluate(async () => {
    return await window.Harness.sendWorkerMessage('INIT');
  });

  const sampleDataset = {
    treatmentVariable: 'trt',
    covariates: [
      { name: 'age', inferredType: 'continuous' },
      { name: 'sbp', inferredType: 'continuous' }
    ],
    rows: [
      { trt: 1, age: 50, sbp: 120, id: SENTINELS.PT_01 },
      { trt: 1, age: 55, sbp: 130, id: SENTINELS.PT_02 },
      { trt: 0, age: 49, sbp: 122, id: 'sub_03' },
      { trt: 0, age: 56, sbp: 128, id: 'sub_04' },
      { trt: 0, age: 70, sbp: 150, id: 'sub_05' }
    ]
  };

  console.log('Calling browserContext.setOffline(true)...');
  await context.setOffline(true);
  const reqsBeforeOffline = networkAuditLog.filter(e => e.phase === 'OFFLINE_EXECUTION').length;

  const offlineAnalysisRes = await page.evaluate(async (ds) => {
    return await window.Harness.sendWorkerMessage('RUN_ANALYSIS', ds);
  }, sampleDataset);

  const reqsAfterOffline = networkAuditLog.filter(e => e.phase === 'OFFLINE_EXECUTION').length;
  const offlineNetworkRequestsAttempted = reqsAfterOffline - reqsBeforeOffline;
  await context.setOffline(false);
  console.log('Restored online connectivity: context.setOffline(false)');

  console.log(`Offline execution success: ${offlineAnalysisRes.success}`);
  console.log(`Offline network requests attempted: ${offlineNetworkRequestsAttempted}`);

  const offlinePass = offlineAnalysisRes.success === true && offlineNetworkRequestsAttempted === 0;

  // -------------------------------------------------------------
  // Part 5: Storage Fault Injection, Scanner Positive Control & Checkpoints T1-T5
  // -------------------------------------------------------------
  console.log('\n--- Phase 5: Storage Privacy Audit (Fault Injection, Positive Control, T1-T5) ---');
  currentPhase = 'STORAGE_PRIVACY';

  const faultInjectionRes = await page.evaluate(async () => {
    return await window.Harness.runIndexedDbFaultInjectionTests();
  });
  console.log(`IndexedDB Fault Injection Verdict: ${faultInjectionRes.fault_injection_verdict}`);
  console.log(`All 5 failure modes failed closed: ${faultInjectionRes.all_failed_closed}`);

  const scannerFalsification = await page.evaluate(async () => {
    return await window.Harness.runStorageScannerFalsification();
  });
  console.log(`Scanner Positive Control Verdict: ${scannerFalsification.scanner_falsification_verdict}`);
  console.log(`Planted: ${scannerFalsification.planted_count}, Detected: ${scannerFalsification.detected_count}`);

  // Checkpoints T1 to T5
  const checkpoints = {};

  // T1: Post-pipeline
  checkpoints.T1_post_pipeline = await page.evaluate(async (s) => {
    return await window.Harness.inspectDeepStorage(s);
  }, ALL_DATA_SENTINELS);

  // T2: Worker terminated
  await page.evaluate(() => {
    if (window.currentWorker) {
      window.currentWorker.terminate();
      window.currentWorker = null;
    }
  });
  checkpoints.T2_post_termination = await page.evaluate(async (s) => {
    return await window.Harness.inspectDeepStorage(s);
  }, ALL_DATA_SENTINELS);

  // T3: Re-spawn worker
  await page.evaluate(() => window.Harness.createWorker());
  checkpoints.T3_post_respawn = await page.evaluate(async (s) => {
    return await window.Harness.inspectDeepStorage(s);
  }, ALL_DATA_SENTINELS);

  // T4: Second pipeline
  await page.evaluate(async () => {
    return await window.Harness.sendWorkerMessage('INIT');
  });
  await page.evaluate(async (ds) => {
    return await window.Harness.sendWorkerMessage('RUN_ANALYSIS', ds);
  }, sampleDataset);
  checkpoints.T4_post_second_run = await page.evaluate(async (s) => {
    return await window.Harness.inspectDeepStorage(s);
  }, ALL_DATA_SENTINELS);

  // T5: Final worker termination
  await page.evaluate(() => {
    if (window.currentWorker) {
      window.currentWorker.terminate();
      window.currentWorker = null;
    }
  });
  checkpoints.T5_final_clean = await page.evaluate(async (s) => {
    return await window.Harness.inspectDeepStorage(s);
  }, ALL_DATA_SENTINELS);

  const t1Clean = (checkpoints.T1_post_pipeline.indexedDB.status === 'INSPECTED_EMPTY' || checkpoints.T1_post_pipeline.indexedDB.status === 'INSPECTED_NO_SENTINEL') && checkpoints.T1_post_pipeline.total_residue_found === 0;
  const t5Clean = (checkpoints.T5_final_clean.indexedDB.status === 'INSPECTED_EMPTY' || checkpoints.T5_final_clean.indexedDB.status === 'INSPECTED_NO_SENTINEL') && checkpoints.T5_final_clean.total_residue_found === 0;

  console.log(`T1 clean: ${t1Clean}, T5 clean: ${t5Clean}`);

  const storageAuditReport = {
    executed_at: EXECUTION_TIMESTAMP,
    commit_sha: commitSha,
    fault_injection_tests: faultInjectionRes,
    scanner_falsification: scannerFalsification,
    sentinels_monitored: ALL_DATA_SENTINELS,
    checkpoints,
    fault_injection_verdict: faultInjectionRes.fault_injection_verdict,
    scanner_falsification_verdict: scannerFalsification.scanner_falsification_verdict,
    patient_sentinel_residue_verdict: (t1Clean && t5Clean) ? 'PATIENT_SENTINEL_RESIDUE_NOT_OBSERVED' : 'FAIL',
    overall_storage_verdict: (faultInjectionRes.fault_injection_verdict === 'PASS' && scannerFalsification.scanner_falsification_verdict === 'SCANNER_FALSIFICATION_PASS' && t1Clean && t5Clean) ? 'PASS' : 'FAIL'
  };

  fs.writeFileSync(
    path.resolve('experiments/cp-webr-02a/STORAGE-PRIVACY-AUDIT.json'),
    JSON.stringify(storageAuditReport, null, 2)
  );
  console.log('Wrote experiments/cp-webr-02a/STORAGE-PRIVACY-AUDIT.json');

  // -------------------------------------------------------------
  // Part 6: Tripartite Egress & Mock Sink Falsification
  // -------------------------------------------------------------
  console.log('\n--- Phase 6: Tripartite Egress & Falsification ---');
  currentPhase = 'EGRESS_TESTS';

  const pagePreventionRes = await page.evaluate(async () => {
    return await window.Harness.triggerPageEgressPrevention('PAGE_PREVENTION_SENTINEL');
  });
  console.log(`Page Pre-Egress Prevention Aborted: ${pagePreventionRes.aborted_pre_egress}`);

  const pageServerRejectionRes = await page.evaluate(async () => {
    return await window.Harness.triggerPageServerRejection('PAGE_REJECTION_SENTINEL');
  });
  console.log(`Page Server Rejection Status: ${pageServerRejectionRes.status} (Expected 403)`);

  let extBlocked = false;
  try {
    await page.evaluate(async () => {
      await fetch('https://unauthorized-external-telemetry.example.org/telemetry');
    });
  } catch {
    extBlocked = true;
  }
  console.log(`External Telemetry CSP Blocked: ${extBlocked}`);

  // Dispatched mock sink payload
  await page.evaluate(async (s) => {
    await fetch('/api/mock-falsification-sink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leak: s })
    });
  }, SENTINELS.FALSIFICATION_06);

  const mockSinkStatus = await (await fetch(`http://localhost:${PORT}/api/audit-logs`)).json();
  const sinkMatched = mockSinkStatus.falsificationSinkHits > 0;
  console.log(`Mock Sink hits: ${mockSinkStatus.falsificationSinkHits}`);

  await browser.close();
  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
  server.close();

  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // Part 7: Verification of Scientific Parity & Evidence Provenance
  // -------------------------------------------------------------
  console.log('\n--- Phase 7: Verifying Scientific Parity & Evidence Provenance ---');
  const manifestPath = path.resolve('experiments/cp-webr-02a/fixtures/fixtures_manifest.json');
  const parityPath = path.resolve('experiments/cp-webr-02a/SCIENTIFIC-PARITY-RESULTS.json');
  const unitPath = path.resolve('experiments/cp-webr-02a/ADAPTER-UNIT-TESTS.json');
  const templatePath = path.resolve('experiments/cp-webr-02a/adapter/r_template.R');

  if (!fs.existsSync(manifestPath) || !fs.existsSync(parityPath) || !fs.existsSync(unitPath) || !fs.existsSync(templatePath)) {
    throw new Error('EVIDENCE_MISSING: Required evidence files missing for browser qualification');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const parityData = JSON.parse(fs.readFileSync(parityPath, 'utf8'));
  const unitData = JSON.parse(fs.readFileSync(unitPath, 'utf8'));
  const currentTemplateSha256 = crypto.createHash('sha256').update(fs.readFileSync(templatePath, 'utf8')).digest('hex');

  const cobaltRefPath = path.resolve('experiments/cp-webr-02a/r1.2a/COBALT-NUMERICAL-REFERENCE.json');
  const generatorScriptPath = path.resolve('experiments/cp-webr-02a/harness/generate_cobalt_reference.mjs');

  function deriveScientificGates(pData, uData, mData, currentCommit, currentTmpl, matrixData, mutationAudit, cobaltData, fatalAudit, cobaltRefOverride) {
    if (!pData || !uData || !mData) {
      throw new Error('Null evidence provided to deriveScientificGates');
    }

    const FROZEN_MANIFEST_IDS = [
      'fix_01_well_conditioned', 'fix_02_mixed_types', 'fix_03_ref_level_change',
      'fix_04_input_row_order', 'fix_05_exact_distance_ties', 'fix_06_no_caliper_nearest',
      'fix_07_prob_scale_caliper', 'fix_08_linear_logit_caliper', 'fix_09_standardized_caliper',
      'fix_10_whole_vs_pooled_sd', 'fix_11_pre_match_discard', 'fix_12_caliper_unmatched',
      'fix_13_more_treated_than_control', 'fix_14_more_controls_than_treated',
      'fix_15_quasi_separation', 'fix_16_complete_separation', 'fix_17_rank_deficient',
      'fix_18_zero_variance', 'fix_19_missing_values', 'fix_19b_missing_treatment',
      'fix_20_malformed_category', 'fix_21_extreme_propensities', 'fix_22_small_sample',
      'fix_23_no_eligible_match', 'fix_24_duplicate_ids'
    ];

    const manifestIds = new Set(mData.fixtures.map(f => f.id));
    const testedMap = new Map(pData.fixtures_tested.map(f => [f.fixture_id, f]));

    // 1. Verify complete frozen manifest identity
    const exactManifestMatch = FROZEN_MANIFEST_IDS.length === manifestIds.size &&
      FROZEN_MANIFEST_IDS.every(id => manifestIds.has(id)) &&
      FROZEN_MANIFEST_IDS.every(id => testedMap.has(id)) &&
      testedMap.size === FROZEN_MANIFEST_IDS.length;

    // 2. Unit tests passing
    const unitPass = (uData.tests_passed >= 40 && uData.tests_failed === 0);
    const templateMatch = (pData.r_template_sha256 === currentTmpl);

    // Helper to find tested fixture
    const findFixture = (id) => testedMap.get(id);

    // Every fixture must pass AND have non-empty executed assertions
    const allFixturesPassed = exactManifestMatch && pData.fixtures_tested.every(f =>
      f.pass === true && Array.isArray(f.assertions) && f.assertions.length > 0
    );

    // Check matrix data if provided
    const matrixPass = !matrixData || (
      matrixData.total_fixtures === 25 &&
      Object.keys(matrixData.fixtures || {}).length === 25 &&
      Object.values(matrixData.fixtures).every(f => f.pass === true && Array.isArray(f.assertions) && f.assertions.length > 0)
    );

    // Check mutations (13 genuine mutations)
    const mutationsChecked = Array.isArray(pData.mutation_tests) &&
      pData.mutation_tests.length === 13 &&
      pData.mutation_tests.every(m => m.caught === true);

    const mutationAuditPass = !mutationAudit || (
      mutationAudit.total_mutations === 13 &&
      Array.isArray(mutationAudit.mutations) &&
      mutationAudit.mutations.length === 13 &&
      mutationAudit.mutations.every(m => m.pass === true)
    );

    // GATE 1: SINGLE_SCIENTIFIC_ENGINE
    const singleEngine = (templateMatch && unitPass) ? 'PASS' : 'FAIL';

    // GATE 2: STRUCTURED_BINDING_AND_FACTOR_SEMANTICS
    const fix01 = findFixture('fix_01_well_conditioned');
    const fix02 = findFixture('fix_02_mixed_types');
    const fix03 = findFixture('fix_03_ref_level_change');
    const fix20 = findFixture('fix_20_malformed_category');
    const structuredBindingHasAssertions =
      fix02?.assertions?.some(a => a.includes("reference level 'low'")) &&
      fix02?.assertions?.some(a => a.includes('cov_02med') && a.includes('cov_02high')) &&
      fix03?.assertions?.some(a => a.includes("reference level 'med'")) &&
      fix03?.assertions?.some(a => a.includes('contrast transformation theorem')) &&
      fix20?.assertions?.some(a => a.toLowerCase().includes('category'));
    const structuredBinding = (unitPass && fix02?.pass && fix03?.pass && fix20?.pass && structuredBindingHasAssertions && mutationsChecked) ? 'PASS' : 'FAIL';

    // GATE 3: MISSING_DATA_FAIL_CLOSED
    const fix19 = findFixture('fix_19_missing_values');
    const fix19b = findFixture('fix_19b_missing_treatment');
    const fix24 = findFixture('fix_24_duplicate_ids');
    const missingDataHasAssertions =
      fix19?.assertions?.some(a => a.includes('MISSING_COVARIATE') || a.toLowerCase().includes('missing covariate')) &&
      fix19b?.assertions?.some(a => a.includes('MISSING_TREATMENT') || a.toLowerCase().includes('missing treatment')) &&
      fix24?.assertions?.some(a => a.includes('duplicate unit ID') || a.includes('DUPLICATE_UNIT_ID'));
    const missingData = (unitPass && fix19?.pass && fix19b?.pass && fix20?.pass && fix24?.pass && missingDataHasAssertions) ? 'PASS' : 'FAIL';

    // GATE 4: CANONICAL_OUTPUT_INTEGRITY
    const successfulFixtures = pData.fixtures_tested.filter(f => f.classification === 'SUCCESSFUL_ANALYSES');
    const allSuccessfulHaveAccounting = successfulFixtures.every(f =>
      f.assertions.some(a => a.includes('Sample accounting invariant verified')) &&
      f.details?.pairDistancesValid === true
    );

    // E1 sample-accounting equation check on fix_11
    const fix11Test = findFixture('fix_11_pre_match_discard');
    let fix11EquationValid = false;
    if (fix11Test?.assertions) {
      const eqAssertion = fix11Test.assertions.find(a => a.startsWith('Sample accounting exact:'));
      if (eqAssertion) {
        const eqStr = eqAssertion.replace('Sample accounting exact:', '').trim();
        const saObj = fix11Test.details?.sampleAccounting || fix11Test.sampleAccounting;
        const eqCheck = verifyAccountingEquationString(eqStr, saObj);
        if (eqCheck.pass) {
          fix11EquationValid = true;
        }
      }
    }

    const canonicalIntegrity = (unitPass && allFixturesPassed && allSuccessfulHaveAccounting && fix11EquationValid && pData.verdict === 'PASS') ? 'PASS' : 'FAIL';

    // GATE 5: PAIR_AND_CALIPER_SEMANTICS
    const requiredCaliperFixtures = [
      'fix_07_prob_scale_caliper', 'fix_08_linear_logit_caliper', 'fix_09_standardized_caliper',
      'fix_10_whole_vs_pooled_sd', 'fix_11_pre_match_discard', 'fix_12_caliper_unmatched',
      'fix_23_no_eligible_match'
    ];
    const caliperAssertionsValid = requiredCaliperFixtures.every(id => {
      const f = findFixture(id);
      return f?.pass && f.assertions && f.assertions.length > 0;
    }) && findFixture('fix_09_standardized_caliper')?.assertions?.some(a =>
      a.toLowerCase().includes('standardized caliper')
    );
    const pairCaliper = (unitPass && caliperAssertionsValid && mutationsChecked) ? 'PASS' : 'FAIL';

    // GATE 6: COBALT_BALANCE_PARITY
    // P0 R1.2a-E1: Independent numerical difference recomputation, strict null enforcement, cardinality & provenance validation
    let cobaltBalance = 'FAIL';
    const cobaltAssertionVerified = fix01?.assertions?.some(a =>
      a.includes('Cobalt balance diagnostics verified') || a.includes('Cobalt numerical balance parity verified')
    );
    const activeCobaltRef = cobaltRefOverride || (fs.existsSync(cobaltRefPath) ? JSON.parse(fs.readFileSync(cobaltRefPath, 'utf8')) : null);

    if (cobaltData && activeCobaltRef && Array.isArray(cobaltData.comparisons)) {
      let valid = true;

      // 1. Commit and Stale Artifact Protection
      if (cobaltData.commit_sha !== currentCommit || pData.commit_sha !== currentCommit) {
        valid = false;
      }

      // 2. Reference file hash and provenance verification
      const actualRefFileSha256 = fs.existsSync(cobaltRefPath) ? crypto.createHash('sha256').update(fs.readFileSync(cobaltRefPath)).digest('hex') : null;
      const actualGeneratorSha256 = fs.existsSync(generatorScriptPath) ? crypto.createHash('sha256').update(fs.readFileSync(generatorScriptPath)).digest('hex') : null;

      if (!actualRefFileSha256 || cobaltData.reference_file_sha256 !== actualRefFileSha256) {
        valid = false;
      }
      if (cobaltData.reference_provenance !== 'OFFICIAL_R_COBALT_BAL_TAB_INDEPENDENT_EVALUATION' &&
          cobaltData.reference_provenance !== 'OFFICIAL_R_COBALT_BAL_TAB_EVALUATION') {
        valid = false;
      }
      if (activeCobaltRef.provenance !== 'OFFICIAL_R_COBALT_BAL_TAB_INDEPENDENT_EVALUATION' &&
          activeCobaltRef.provenance !== 'OFFICIAL_R_COBALT_BAL_TAB_EVALUATION') {
        valid = false;
      }
      if (!actualGeneratorSha256 || activeCobaltRef.generator_source_sha256 !== actualGeneratorSha256) {
        valid = false;
      }

      // 3. Exact expected record identities and cardinality
      const expectedRecordKeys = new Map();
      let expectedNumCount = 0;
      let expectedNullCount = 0;

      for (const [fixId, fixObj] of Object.entries(activeCobaltRef.fixtures || {})) {
        for (const [covName, stats] of Object.entries(fixObj.covariates || {})) {
          for (const [statName, refVal] of Object.entries(stats)) {
            if (statName === 'type') continue;
            const key = `${fixId}::${covName}::${statName}`;
            expectedRecordKeys.set(key, refVal);
            if (refVal === null) expectedNullCount++;
            else expectedNumCount++;
          }
        }
      }

      const totalExpected = expectedNumCount + expectedNullCount;
      if (cobaltData.comparisons.length !== totalExpected || totalExpected !== 48 || expectedNumCount !== 24 || expectedNullCount !== 24) {
        valid = false;
      }

      const seenKeys = new Set();
      let actualNumCount = 0;
      let actualNullCount = 0;

      for (const c of cobaltData.comparisons) {
        if (!c || typeof c !== 'object') {
          valid = false;
          break;
        }
        const key = `${c.fixture_id}::${c.covariate_name}::${c.statistic_name}`;
        if (seenKeys.has(key)) {
          // Reject duplicate comparison record
          valid = false;
          break;
        }
        seenKeys.add(key);

        if (!expectedRecordKeys.has(key)) {
          // Reject extra or unexpected covariate/statistic record
          valid = false;
          break;
        }

        const expRefVal = expectedRecordKeys.get(key);

        if (c.reference_provenance !== 'OFFICIAL_R_COBALT_BAL_TAB_INDEPENDENT_EVALUATION' &&
            c.reference_provenance !== 'OFFICIAL_R_COBALT_BAL_TAB_EVALUATION') {
          valid = false;
          break;
        }

        if (expRefVal === null) {
          // Null semantics check
          actualNullCount++;
          if (c.reference_value !== null || c.actual_canonical_value !== null ||
              c.absolute_numerical_difference !== 0 || c.applicable_tolerance !== 0 ||
              c.pass !== true || c.is_numerical !== false || c.comparison_type !== 'NULL_SEMANTICS') {
            valid = false;
            break;
          }
        } else {
          // Numerical value comparison
          actualNumCount++;
          if (typeof c.reference_value !== 'number' || isNaN(c.reference_value) ||
              typeof c.actual_canonical_value !== 'number' || isNaN(c.actual_canonical_value) ||
              c.is_numerical !== true || c.comparison_type !== 'NUMERICAL_VALUE') {
            valid = false;
            break;
          }

          // Reference value must match reference document exactly
          if (c.reference_value !== expRefVal) {
            valid = false;
            break;
          }

          // Recompute absolute difference independently
          const recomputedDiff = Math.abs(c.reference_value - c.actual_canonical_value);

          // Reject inconsistencies between recomputed differences and stored differences
          if (typeof c.absolute_numerical_difference !== 'number' ||
              Math.abs(recomputedDiff - c.absolute_numerical_difference) > 1e-12) {
            valid = false;
            break;
          }

          // Recompute each comparison's PASS/FAIL
          const recomputedPass = recomputedDiff <= c.applicable_tolerance;
          if (c.pass !== recomputedPass || !recomputedPass) {
            valid = false;
            break;
          }
        }
      }

      if (seenKeys.size !== totalExpected || actualNumCount !== 24 || actualNullCount !== 24) {
        valid = false;
      }

      if (valid && cobaltData.all_comparisons_pass === true && allFixturesPassed && mutationsChecked && cobaltAssertionVerified) {
        cobaltBalance = 'PASS';
      }
    }

    // GATE 7: FULL_FIXTURE_QUALIFICATION
    // Requires exact manifest match, every fixture passing with specific non-empty assertions, and matching accounting
    const fullFixture = (exactManifestMatch && allFixturesPassed && matrixPass && pData.verdict === 'PASS') ? 'PASS' : 'FAIL';

    // GATE 8: EXACT_PAIR_AND_WEIGHT_PARITY
    // Derived from complete keyed reference comparisons for fix_01 + mutation detections
    const pairAssertionVerified = fix01?.assertions?.some(a => a.includes('exact bidirectional matched pair correspondence'));
    const weightAssertionVerified = fix01?.assertions?.some(a => a.includes('keyed matching weights vector verified'));
    const glmAssertionVerified = fix01?.assertions?.some(a => a.includes('Model coefficients match reference'));
    const pairMutCaught = pData.mutation_tests?.find(m => m.mutation_id === 'MUT_01_PAIR_CONTROL_ID')?.caught === true;
    const weightMutCaught = pData.mutation_tests?.find(m => m.mutation_id === 'MUT_02_UNIT_WEIGHT')?.caught === true;
    const glmMutCaught = pData.mutation_tests?.find(m => m.mutation_id === 'MUT_03_GLM_COEFFICIENT')?.caught === true;
    const exactPairWeight = (
      pairAssertionVerified &&
      weightAssertionVerified &&
      glmAssertionVerified &&
      pairMutCaught &&
      weightMutCaught &&
      glmMutCaught &&
      fix01?.pass === true &&
      mutationAuditPass
    ) ? 'PASS' : 'FAIL';

    // GATE 9: CI_EVIDENCE_PROVENANCE
    const ciEvidence = (templateMatch && exactManifestMatch && pData.commit_sha === currentCommit) ? 'PASS' : 'FAIL';

    // GATE 10: WORKER_LIFECYCLE_CORRECTNESS
    // P0 R1.2a: Must depend on fatal-error settlement and recovery assertions
    let workerLifecycleGate = 'FAIL';
    if (fatalAudit && Array.isArray(fatalAudit.tests) && fatalAudit.total_tests === 10) {
      const allFatalPassed = fatalAudit.tests.every(t => t.pass === true);
      if (allFatalPassed && unitPass) {
        workerLifecycleGate = 'PASS';
      }
    }

    return {
      SINGLE_SCIENTIFIC_ENGINE: singleEngine,
      STRUCTURED_BINDING_AND_FACTOR_SEMANTICS: structuredBinding,
      MISSING_DATA_FAIL_CLOSED: missingData,
      CANONICAL_OUTPUT_INTEGRITY: canonicalIntegrity,
      PAIR_AND_CALIPER_SEMANTICS: pairCaliper,
      COBALT_BALANCE_PARITY: cobaltBalance,
      FULL_FIXTURE_QUALIFICATION: fullFixture,
      EXACT_PAIR_AND_WEIGHT_PARITY: exactPairWeight,
      CI_EVIDENCE_PROVENANCE: ciEvidence,
      WORKER_LIFECYCLE_CORRECTNESS: workerLifecycleGate
    };
  }

  // Load auxiliary R1.2 and R1.2a audit artifacts
  const matrixPath = path.resolve('experiments/cp-webr-02a/r1.2a/FIXTURE-ASSERTION-MATRIX.json');
  const mutationAuditPath = path.resolve('experiments/cp-webr-02a/r1.2a/NUMERICAL-MUTATION-FALSIFICATION-AUDIT.json');
  const cobaltMatrixPath = path.resolve('experiments/cp-webr-02a/r1.2a/COBALT-NUMERICAL-COMPARISON-MATRIX.json');
  const fatalAuditPath = path.resolve('experiments/cp-webr-02a/r1.2a/WORKER-FATAL-ERROR-SETTLEMENT-AUDIT.json');

  const matrixData = fs.existsSync(matrixPath) ? JSON.parse(fs.readFileSync(matrixPath, 'utf8')) : null;
  const mutationAuditData = fs.existsSync(mutationAuditPath) ? JSON.parse(fs.readFileSync(mutationAuditPath, 'utf8')) : null;
  const cobaltMatrixData = fs.existsSync(cobaltMatrixPath) ? JSON.parse(fs.readFileSync(cobaltMatrixPath, 'utf8')) : null;
  const fatalAuditData = fs.existsSync(fatalAuditPath) ? JSON.parse(fs.readFileSync(fatalAuditPath, 'utf8')) : null;

  // Run comprehensive semantic falsification tests
  console.log('Running gate falsification positive controls...');

  // General controls (fixture pass, template digest, fatal error settlement)
  const mutatedParityFail = JSON.parse(JSON.stringify(parityData));
  mutatedParityFail.fixtures_tested[0].pass = false;
  mutatedParityFail.verdict = 'FAIL';
  const falsifiedGates1 = deriveScientificGates(mutatedParityFail, unitData, manifest, commitSha, currentTemplateSha256, matrixData, mutationAuditData, cobaltMatrixData, fatalAuditData);
  if (falsifiedGates1.FULL_FIXTURE_QUALIFICATION !== 'FAIL' || falsifiedGates1.EXACT_PAIR_AND_WEIGHT_PARITY !== 'FAIL') {
    throw new Error('FALSIFICATION_CHECK_FAILED: Gate evaluator accepted corrupted fixture pass state!');
  }

  const mutatedTemplateFail = JSON.parse(JSON.stringify(parityData));
  mutatedTemplateFail.r_template_sha256 = '0000000000000000000000000000000000000000000000000000000000000000';
  const falsifiedGates2 = deriveScientificGates(mutatedTemplateFail, unitData, manifest, commitSha, currentTemplateSha256, matrixData, mutationAuditData, cobaltMatrixData, fatalAuditData);
  if (falsifiedGates2.SINGLE_SCIENTIFIC_ENGINE !== 'FAIL' || falsifiedGates2.CI_EVIDENCE_PROVENANCE !== 'FAIL') {
    throw new Error('FALSIFICATION_CHECK_FAILED: Gate evaluator accepted tampered template digest!');
  }

  const mutatedFatalFail = JSON.parse(JSON.stringify(fatalAuditData));
  mutatedFatalFail.tests[0].pass = false;
  const falsifiedGatesFatal = deriveScientificGates(parityData, unitData, manifest, commitSha, currentTemplateSha256, matrixData, mutationAuditData, cobaltMatrixData, mutatedFatalFail);
  if (falsifiedGatesFatal.WORKER_LIFECYCLE_CORRECTNESS !== 'FAIL') {
    throw new Error('FALSIFICATION_CHECK_FAILED: Gate evaluator accepted unpassed worker fatal error settlement test!');
  }

  // --- CP-WEBR-02A R1.2a-E1 Explicit 8 Falsification Controls ---
  console.log('Running CP-WEBR-02A R1.2a-E1 8 Numerical & Accounting CI Gate Falsifications...');

  // 1. Change actual_canonical_value by +0.05 without touching stored difference/pass fields
  const fals1Cobalt = JSON.parse(JSON.stringify(cobaltMatrixData));
  fals1Cobalt.comparisons[0].actual_canonical_value += 0.05;
  const gatesFals1 = deriveScientificGates(parityData, unitData, manifest, commitSha, currentTemplateSha256, matrixData, mutationAuditData, fals1Cobalt, fatalAuditData);
  if (gatesFals1.COBALT_BALANCE_PARITY !== 'FAIL') {
    throw new Error('FALSIFICATION_CHECK_FAILED [E1-1]: Mutated actual_canonical_value (+0.05) with untouched diff/pass fields did NOT fail COBALT_BALANCE_PARITY gate!');
  }
  console.log('PASS: Falsification 1 (mutated actual_canonical_value +0.05 caught by recomputed difference)');

  // 2. Change reference_value without touching stored difference/pass fields
  const fals2Cobalt = JSON.parse(JSON.stringify(cobaltMatrixData));
  fals2Cobalt.comparisons[0].reference_value += 0.05;
  const gatesFals2 = deriveScientificGates(parityData, unitData, manifest, commitSha, currentTemplateSha256, matrixData, mutationAuditData, fals2Cobalt, fatalAuditData);
  if (gatesFals2.COBALT_BALANCE_PARITY !== 'FAIL') {
    throw new Error('FALSIFICATION_CHECK_FAILED [E1-2]: Mutated reference_value with untouched diff/pass fields did NOT fail COBALT_BALANCE_PARITY gate!');
  }
  console.log('PASS: Falsification 2 (mutated reference_value caught by reference consistency & recomputed difference)');

  // 3. Substitute null for a required numeric statistic
  const fals3Cobalt = JSON.parse(JSON.stringify(cobaltMatrixData));
  fals3Cobalt.comparisons[0].actual_canonical_value = null;
  const gatesFals3 = deriveScientificGates(parityData, unitData, manifest, commitSha, currentTemplateSha256, matrixData, mutationAuditData, fals3Cobalt, fatalAuditData);
  if (gatesFals3.COBALT_BALANCE_PARITY !== 'FAIL') {
    throw new Error('FALSIFICATION_CHECK_FAILED [E1-3]: Null substituted for required numeric statistic did NOT fail COBALT_BALANCE_PARITY gate!');
  }
  console.log('PASS: Falsification 3 (null substituted for required numeric statistic caught)');

  // 4. Modify an expected covariate name
  const fals4Cobalt = JSON.parse(JSON.stringify(cobaltMatrixData));
  fals4Cobalt.comparisons[0].covariate_name = 'age_tampered_name';
  const gatesFals4 = deriveScientificGates(parityData, unitData, manifest, commitSha, currentTemplateSha256, matrixData, mutationAuditData, fals4Cobalt, fatalAuditData);
  if (gatesFals4.COBALT_BALANCE_PARITY !== 'FAIL') {
    throw new Error('FALSIFICATION_CHECK_FAILED [E1-4]: Modified expected covariate name did NOT fail COBALT_BALANCE_PARITY gate!');
  }
  console.log('PASS: Falsification 4 (modified expected covariate name caught by key identity check)');

  // 5. Duplicate a comparison entry
  const fals5Cobalt = JSON.parse(JSON.stringify(cobaltMatrixData));
  fals5Cobalt.comparisons.push(JSON.parse(JSON.stringify(fals5Cobalt.comparisons[0])));
  fals5Cobalt.total_comparisons = fals5Cobalt.comparisons.length;
  const gatesFals5 = deriveScientificGates(parityData, unitData, manifest, commitSha, currentTemplateSha256, matrixData, mutationAuditData, fals5Cobalt, fatalAuditData);
  if (gatesFals5.COBALT_BALANCE_PARITY !== 'FAIL') {
    throw new Error('FALSIFICATION_CHECK_FAILED [E1-5]: Duplicated comparison entry did NOT fail COBALT_BALANCE_PARITY gate!');
  }
  console.log('PASS: Falsification 5 (duplicated comparison entry caught by cardinality & key uniqueness)');

  // 6. Remove an expected comparison
  const fals6Cobalt = JSON.parse(JSON.stringify(cobaltMatrixData));
  fals6Cobalt.comparisons.splice(0, 1);
  fals6Cobalt.total_comparisons = fals6Cobalt.comparisons.length;
  const gatesFals6 = deriveScientificGates(parityData, unitData, manifest, commitSha, currentTemplateSha256, matrixData, mutationAuditData, fals6Cobalt, fatalAuditData);
  if (gatesFals6.COBALT_BALANCE_PARITY !== 'FAIL') {
    throw new Error('FALSIFICATION_CHECK_FAILED [E1-6]: Removed expected comparison did NOT fail COBALT_BALANCE_PARITY gate!');
  }
  console.log('PASS: Falsification 6 (removed expected comparison caught by key completeness check)');

  // 7. Tamper with reference provenance or its source hash
  const fals7Cobalt = JSON.parse(JSON.stringify(cobaltMatrixData));
  fals7Cobalt.reference_provenance = 'UNVERIFIED_THIRD_PARTY_SOURCE';
  const gatesFals7 = deriveScientificGates(parityData, unitData, manifest, commitSha, currentTemplateSha256, matrixData, mutationAuditData, fals7Cobalt, fatalAuditData);
  if (gatesFals7.COBALT_BALANCE_PARITY !== 'FAIL') {
    throw new Error('FALSIFICATION_CHECK_FAILED [E1-7]: Tampered reference provenance did NOT fail COBALT_BALANCE_PARITY gate!');
  }
  console.log('PASS: Falsification 7 (tampered reference provenance caught)');

  // 8. Corrupt the reported sample-accounting equation while preserving the correct underlying counts
  const fals8Parity = JSON.parse(JSON.stringify(parityData));
  const fix11TestFals = fals8Parity.fixtures_tested.find(f => f.fixture_id === 'fix_11_pre_match_discard');
  const eqIdx = fix11TestFals.assertions.findIndex(a => a.startsWith('Sample accounting exact:'));
  fix11TestFals.assertions[eqIdx] = 'Sample accounting exact: completeCases (200) == matched (32) + unmatched (64) + discarded (4)';
  const gatesFals8 = deriveScientificGates(fals8Parity, unitData, manifest, commitSha, currentTemplateSha256, matrixData, mutationAuditData, cobaltMatrixData, fatalAuditData);
  if (gatesFals8.CANONICAL_OUTPUT_INTEGRITY !== 'FAIL') {
    throw new Error('FALSIFICATION_CHECK_FAILED [E1-8]: Corrupted sample-accounting equation did NOT fail CANONICAL_OUTPUT_INTEGRITY gate!');
  }
  console.log('PASS: Falsification 8 (corrupted sample accounting equation caught by CANONICAL_OUTPUT_INTEGRITY gate)\n');

  // Derive genuine live gates
  const scientificGates = deriveScientificGates(parityData, unitData, manifest, commitSha, currentTemplateSha256, matrixData, mutationAuditData, cobaltMatrixData, fatalAuditData);

  const allScientificGatesPass = Object.values(scientificGates).every(v => v === 'PASS');
  const allBrowserSecurityGatesPass =
    cspQualificationReport.verdict === 'PASS' &&
    workerLifecycleReport.verdict === 'PASS' &&
    offlinePass &&
    storageAuditReport.overall_storage_verdict === 'PASS' &&
    pagePreventionRes.aborted_pre_egress === true &&
    pageServerRejectionRes.status === 403 &&
    sinkMatched;

  const allTestsPassed = allScientificGatesPass && allBrowserSecurityGatesPass;

  const browserCiReport = {
    executed_at: EXECUTION_TIMESTAMP,
    commit_sha: commitSha,
    operating_system: osInfo,
    node_version: nodeVersion,
    browser_type: 'Chromium',
    browser_version: browserVersion,
    duration_ms: Date.now() - tStart,
    exit_code: allTestsPassed ? 0 : 1,
    runtime_packages: {
      webr: '0.6.0',
      r_version: '4.6.0',
      matchit: '4.8.1',
      cobalt: '5.0.0'
    },
    verdicts: {
      SINGLE_SCIENTIFIC_ENGINE: scientificGates.SINGLE_SCIENTIFIC_ENGINE,
      BROWSER_PORTABLE_ADAPTER: (unitData.tests_passed >= 40 && unitData.tests_failed === 0 && cspQualificationReport.matrix.profileC1_strict.pipelineSuccess) ? 'PASS' : 'FAIL',
      STRUCTURED_BINDING_AND_FACTOR_SEMANTICS: scientificGates.STRUCTURED_BINDING_AND_FACTOR_SEMANTICS,
      MISSING_DATA_FAIL_CLOSED: scientificGates.MISSING_DATA_FAIL_CLOSED,
      CANONICAL_OUTPUT_INTEGRITY: scientificGates.CANONICAL_OUTPUT_INTEGRITY,
      PAIR_AND_CALIPER_SEMANTICS: scientificGates.PAIR_AND_CALIPER_SEMANTICS,
      COBALT_BALANCE_PARITY: scientificGates.COBALT_BALANCE_PARITY,
      FULL_FIXTURE_QUALIFICATION: scientificGates.FULL_FIXTURE_QUALIFICATION,
      WORKER_LIFECYCLE_CORRECTNESS: (workerLifecycleReport.verdict === 'PASS' && scientificGates.WORKER_LIFECYCLE_CORRECTNESS === 'PASS') ? 'PASS' : 'FAIL',
      STRICT_CSP_EXECUTION: cspQualificationReport.matrix.profileC1_strict.pipelineSuccess ? 'PASS' : 'FAIL',
      CHROMIUM_SHARED_ADAPTER_E2E: allTestsPassed ? 'PASS' : 'FAIL',
      CI_EVIDENCE_PROVENANCE: scientificGates.CI_EVIDENCE_PROVENANCE,
      NATIVE_R_INDEPENDENT_ORACLE: 'BLOCKED',
      AUTOMATED_SEPARATION_SAFETY: 'BLOCKED',
      PRODUCTION_LICENSING_CLEARANCE: 'BLOCKED',
      EXACT_PAIR_AND_WEIGHT_PARITY: scientificGates.EXACT_PAIR_AND_WEIGHT_PARITY,
      WORKER_CSP_QUALIFICATION: cspQualificationReport.verdict,
      WORKER_LIFECYCLE_SUITE: workerLifecycleReport.verdict,
      TRUE_OFFLINE_EXECUTION: offlinePass ? 'PASS' : 'FAIL',
      STORAGE_PRIVACY_AUDIT: storageAuditReport.overall_storage_verdict,
      PRE_EGRESS_PREVENTION: pagePreventionRes.aborted_pre_egress ? 'PASS' : 'FAIL',
      SERVER_REJECTION_403: pageServerRejectionRes.status === 403 ? 'PASS' : 'FAIL',
      MOCK_SINK_FALSIFICATION: sinkMatched ? 'PASS' : 'FAIL',
      OVERALL_ADAPTER_VERDICT: allTestsPassed ? 'ADAPTER_PASS_FOR_INTEGRATION_REVIEW' : 'ADAPTER_FAIL'
    }
  };

  fs.writeFileSync(
    path.resolve('experiments/cp-webr-02a/BROWSER-CI-QUALIFICATION-REPORT.json'),
    JSON.stringify(browserCiReport, null, 2)
  );
  console.log('Wrote experiments/cp-webr-02a/BROWSER-CI-QUALIFICATION-REPORT.json');

  console.log(`\nOVERALL ADAPTER VERDICT: ${browserCiReport.verdicts.OVERALL_ADAPTER_VERDICT}`);
  if (!allTestsPassed) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error in browser qualification suite:', err);
  process.exit(1);
});
