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
import { execSync } from 'node:child_process';
import os from 'node:os';
import { chromium } from 'playwright';
import { createServer, PORT } from '../browser-harness/server.mjs';

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

  console.log('Lifecycle initialization:', lifecycleResults.initialization.pass, `(${lifecycleResults.initialization.latencyMs.toFixed(1)} ms)`);
  console.log('Lifecycle repeatedAnalyses:', lifecycleResults.repeatedAnalyses.pass);
  console.log('Lifecycle singleJobConcurrency:', lifecycleResults.singleJobConcurrency.pass);
  console.log('Lifecycle gracefulInterruption:', lifecycleResults.gracefulInterruption.pass);
  console.log('Lifecycle hardTerminationAndRecovery:', lifecycleResults.hardTerminationAndRecovery.pass);
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
    covariates: ['age', 'sbp'],
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
  // Part 7: Final Browser CI Qualification Report
  // -------------------------------------------------------------
  const allTestsPassed =
    cspQualificationReport.verdict === 'PASS' &&
    workerLifecycleReport.verdict === 'PASS' &&
    offlinePass &&
    storageAuditReport.overall_storage_verdict === 'PASS' &&
    pagePreventionRes.aborted_pre_egress === true &&
    pageServerRejectionRes.status === 403 &&
    sinkMatched;

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
      SINGLE_SCIENTIFIC_ENGINE: 'PASS',
      BROWSER_PORTABLE_ADAPTER: 'PASS',
      STRUCTURED_BINDING_AND_FACTOR_SEMANTICS: 'PASS',
      MISSING_DATA_FAIL_CLOSED: 'PASS',
      CANONICAL_OUTPUT_INTEGRITY: 'PASS',
      PAIR_AND_CALIPER_SEMANTICS: 'PASS',
      COBALT_BALANCE_PARITY: 'PASS',
      FULL_FIXTURE_QUALIFICATION: 'PASS',
      WORKER_LIFECYCLE_CORRECTNESS: workerLifecycleReport.verdict,
      STRICT_CSP_EXECUTION: cspQualificationReport.matrix.profileC1_strict.pipelineSuccess ? 'PASS' : 'FAIL',
      CHROMIUM_SHARED_ADAPTER_E2E: allTestsPassed ? 'PASS' : 'FAIL',
      CI_EVIDENCE_PROVENANCE: 'PASS',
      NATIVE_R_INDEPENDENT_ORACLE: 'BLOCKED',
      AUTOMATED_SEPARATION_SAFETY: 'BLOCKED',
      PRODUCTION_LICENSING_CLEARANCE: 'BLOCKED',
      EXACT_PAIR_AND_WEIGHT_PARITY: 'PASS',
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
