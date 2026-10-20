// CP-WEBR-02A Adapter Unit & Adversarial Validation Suite
// Conforms to CP-WEBR-01 Production Architecture, Canonical Result Contract & R1.1 Requirements

import fs from 'node:fs';
import path from 'node:path';
import { SymbolMapper } from '../adapter/symbol_mapper.mjs';
import {
  validateCanonicalResult,
  computeCanonicalResultHash
} from '../adapter/canonical_serializer.mjs';
import { WorkerLifecycleManager } from '../adapter/worker_manager.mjs';
import { constructWebREnvironment, validateOptions } from '../adapter/webr_binding.mjs';
import { WebRStatisticalAdapter } from '../adapter/webr_adapter.mjs';

const results = {
  suite: 'CP-WEBR-02A R1.1 Adapter Unit & Adversarial Suite',
  executed_at: new Date().toISOString(),
  tests_passed: 0,
  tests_failed: 0,
  cases: []
};

function assert(condition, testName, details = '') {
  if (condition) {
    results.tests_passed++;
    results.cases.push({ name: testName, status: 'PASS', details });
    console.log(`PASS: ${testName}`);
  } else {
    results.tests_failed++;
    results.cases.push({ name: testName, status: 'FAIL', details });
    console.error(`FAIL: ${testName} - ${details}`);
  }
}

// -------------------------------------------------------------
// 1. SymbolMapper Unit & Adversarial Tests
// -------------------------------------------------------------
console.log('\n--- 1. Testing SymbolMapper & Header Validation ---');

const mapper = new SymbolMapper();

// 1.1 Monotonic alias generation
const trt0 = mapper.registerTreatment('Treatment Group');
const cov0 = mapper.registerCovariate('Patient Age');
const cov1 = mapper.registerCovariate('Body Mass Index');
assert(trt0 === 'trt_00', 'Treatment alias is monotonic trt_00', `got ${trt0}`);
assert(cov0 === 'cov_00', 'First covariate alias is cov_00', `got ${cov0}`);
assert(cov1 === 'cov_01', 'Second covariate alias is cov_01', `got ${cov1}`);

// 1.2 Exact raw header preservation in getOriginal
assert(mapper.getOriginal('trt_00') === 'Treatment Group', 'Exact raw header preserved: trt_00 -> "Treatment Group"');
assert(mapper.getOriginal('cov_00') === 'Patient Age', 'Exact raw header preserved: cov_00 -> "Patient Age"');

// 1.3 Repeated covariate rejection
let repeatedCovTrap = false;
try {
  mapper.registerCovariate('Patient Age');
} catch (err) {
  repeatedCovTrap = err.code === 'REPEATED_COVARIATE_REJECTED';
}
assert(repeatedCovTrap, 'Repeated covariate registration rejected with REPEATED_COVARIATE_REJECTED');

// 1.4 Covariate equal to treatment variable rejection
let covTrtTrap = false;
try {
  mapper.registerCovariate('Treatment Group');
} catch (err) {
  covTrtTrap = err.code === 'TREATMENT_AS_COVARIATE_REJECTED';
}
assert(covTrtTrap, 'Covariate equal to treatment variable rejected with TREATMENT_AS_COVARIATE_REJECTED');

// 1.5 Header normalization collision (NFC vs NFD)
const mapperNfc = new SymbolMapper();
mapperNfc.registerCovariate('Yaş'); // NFC: Y-a-\u015f
let nfdCollisionTrap = false;
try {
  mapperNfc.registerCovariate('Ya\u0073\u0327'); // NFD: Y-a-s-\u0327 (combining cedilla)
} catch (err) {
  nfdCollisionTrap = err.code === 'HEADER_NORMALIZATION_COLLISION';
}
assert(nfdCollisionTrap, 'NFC/NFD header normalization collision rejected with HEADER_NORMALIZATION_COLLISION');

// 1.6 Whitespace-only differing header collision
const mapperWs = new SymbolMapper();
mapperWs.registerCovariate('Age');
let wsCollisionTrap = false;
try {
  mapperWs.registerCovariate('  Age  ');
} catch (err) {
  wsCollisionTrap = err.code === 'HEADER_NORMALIZATION_COLLISION';
}
assert(wsCollisionTrap, 'Headers differing only by surrounding whitespace rejected with HEADER_NORMALIZATION_COLLISION');

// 1.7 Unicode, quotation marks and R-code-looking text safely aliased
const injectionHeader = '"; system("touch /tmp/pwned"); #';
const mapperInj = new SymbolMapper();
const injAlias = mapperInj.registerCovariate(injectionHeader);
assert(injAlias === 'cov_00', 'R-code injection string safely mapped to monotonic alias cov_00');
assert(mapperInj.getOriginal('cov_00') === injectionHeader, 'Original injection header safely preserved in mapper table');

// -------------------------------------------------------------
// 2. Scientific Matching Options Validation
// -------------------------------------------------------------
console.log('\n--- 2. Testing Option Validation & Caliper Parameters ---');

// 2.1 Unknown scientific option rejection
let unknownOptTrap = false;
try {
  validateOptions({ standardizedCaliper: true }); // Incorrect alias rejected
} catch (err) {
  unknownOptTrap = err.code === 'UNKNOWN_OPTION_REJECTED';
}
assert(unknownOptTrap, 'Unknown option "standardizedCaliper" rejected with UNKNOWN_OPTION_REJECTED');

// 2.2 Canonical stdCaliper accepted
let validOptOk = false;
try {
  validateOptions({
    method: 'nearest',
    distanceMetric: 'linear.logit',
    caliper: 0.2,
    stdCaliper: true,
    ratio: 1,
    replace: false,
    matchingOrder: 'largest',
    discard: 'none'
  });
  validOptOk = true;
} catch {}
assert(validOptOk, 'Canonical options with stdCaliper and linear.logit validated successfully');

// 2.3 Invalid method rejected
let invalidMethodTrap = false;
try {
  validateOptions({ method: 'optimal' });
} catch (err) {
  invalidMethodTrap = err.code === 'INVALID_OPTION';
}
assert(invalidMethodTrap, 'Invalid method "optimal" rejected with INVALID_OPTION');

// 2.4 Negative caliper rejected
let negCaliperTrap = false;
try {
  validateOptions({ caliper: -0.1 });
} catch (err) {
  negCaliperTrap = err.code === 'INVALID_OPTION';
}
assert(negCaliperTrap, 'Negative caliper rejected with INVALID_OPTION');

// -------------------------------------------------------------
// 3. Ingestion Validation & Data Semantics (Fail-Closed)
// -------------------------------------------------------------
console.log('\n--- 3. Testing Ingestion Validation & Missingness Contracts ---');

class MockWebR {
  async evalR() { return {}; }
  REnvironment = class { async bind() {} };
  RCharacter = class { constructor(v) { this.v = v; } };
  RInteger = class { constructor(v) { this.v = v; } };
  RDouble = class { constructor(v) { this.v = v; } };
  RLogical = class { constructor(v) { this.v = v; } };
}

const mockWebR = new MockWebR();

// 3.1 Missing explicit unit ID rejection (No auto fallback)
let missingIdTrap = false;
try {
  const m = new SymbolMapper();
  await constructWebREnvironment(mockWebR, {
    treatmentVariable: 'treat',
    covariates: ['age'],
    covariateDefinitions: { age: { inferredType: 'continuous' } },
    rows: [{ treat: 1, age: 40 }] // Missing id
  }, m);
} catch (err) {
  missingIdTrap = err.code === 'MISSING_ROW_ID';
}
assert(missingIdTrap, 'Missing explicit row ID rejected with MISSING_ROW_ID');

// 3.2 Duplicate unit ID rejection
let dupIdTrap = false;
try {
  const m = new SymbolMapper();
  await constructWebREnvironment(mockWebR, {
    treatmentVariable: 'treat',
    covariates: ['age'],
    covariateDefinitions: { age: { inferredType: 'continuous' } },
    rows: [
      { id: 'sub_01', treat: 1, age: 40 },
      { id: 'sub_01', treat: 0, age: 45 }
    ]
  }, m);
} catch (err) {
  dupIdTrap = err.code === 'DUPLICATE_UNIT_ID_REJECTED';
}
assert(dupIdTrap, 'Duplicate unit ID rejected with DUPLICATE_UNIT_ID_REJECTED');

// 3.3 Blank categorical factor level rejected
let blankLevelTrap = false;
try {
  const m = new SymbolMapper();
  await constructWebREnvironment(mockWebR, {
    treatmentVariable: 'treat',
    covariates: ['cat'],
    covariateDefinitions: {
      cat: {
        inferredType: 'categorical',
        levels: ['GroupA', '   '],
        referenceLevel: 'GroupA'
      }
    },
    rows: [{ id: 'sub_01', treat: 1, cat: 'GroupA' }]
  }, m);
} catch (err) {
  blankLevelTrap = err.code === 'BLANK_FACTOR_LEVEL_REJECTED';
}
assert(blankLevelTrap, 'Blank factor level rejected with BLANK_FACTOR_LEVEL_REJECTED');

// 3.4 Unknown reference category rejected
let unknownRefTrap = false;
try {
  const m = new SymbolMapper();
  await constructWebREnvironment(mockWebR, {
    treatmentVariable: 'treat',
    covariates: ['cat'],
    covariateDefinitions: {
      cat: {
        inferredType: 'categorical',
        levels: ['Low', 'High'],
        referenceLevel: 'Medium' // Not in levels
      }
    },
    rows: [{ id: 'sub_01', treat: 1, cat: 'Low' }]
  }, m);
} catch (err) {
  unknownRefTrap = err.code === 'UNKNOWN_REFERENCE_CATEGORY_REJECTED';
}
assert(unknownRefTrap, 'Unknown reference category rejected with UNKNOWN_REFERENCE_CATEGORY_REJECTED');

// 3.5 Observation outside declared factor levels rejected
let unlistedObsTrap = false;
try {
  const m = new SymbolMapper();
  await constructWebREnvironment(mockWebR, {
    treatmentVariable: 'treat',
    covariates: ['cat'],
    covariateDefinitions: {
      cat: {
        inferredType: 'categorical',
        levels: ['Low', 'High'],
        referenceLevel: 'Low'
      }
    },
    rows: [
      { id: 'sub_01', treat: 1, cat: 'Low' },
      { id: 'sub_02', treat: 0, cat: 'SuperHigh' }
    ]
  }, m);
} catch (err) {
  unlistedObsTrap = err.code === 'UNLISTED_FACTOR_OBSERVATION_REJECTED';
}
assert(unlistedObsTrap, 'Observation outside declared levels rejected with UNLISTED_FACTOR_OBSERVATION_REJECTED');

// 3.6 Missing categorical value rejected (empty string or "NA")
let missingCatTrap = false;
try {
  const m = new SymbolMapper();
  await constructWebREnvironment(mockWebR, {
    treatmentVariable: 'treat',
    covariates: ['cat'],
    covariateDefinitions: {
      cat: {
        inferredType: 'categorical',
        levels: ['Low', 'High'],
        referenceLevel: 'Low'
      }
    },
    rows: [
      { id: 'sub_01', treat: 1, cat: 'Low' },
      { id: 'sub_02', treat: 0, cat: '' } // Missing
    ]
  }, m);
} catch (err) {
  missingCatTrap = err.code === 'MISSING_COVARIATE';
}
assert(missingCatTrap, 'Blank categorical observation rejected under fail-closed missingness policy');

// 3.7 Non-finite numeric input rejected
let nonFiniteTrap = false;
try {
  const m = new SymbolMapper();
  await constructWebREnvironment(mockWebR, {
    treatmentVariable: 'treat',
    covariates: ['x'],
    covariateDefinitions: { x: { inferredType: 'continuous' } },
    rows: [
      { id: 'sub_01', treat: 1, x: 10 },
      { id: 'sub_02', treat: 0, x: Infinity }
    ]
  }, m);
} catch (err) {
  nonFiniteTrap = err.code === 'NON_FINITE_NUMERIC_REJECTED';
}
assert(nonFiniteTrap, 'Non-finite numeric value (Infinity) rejected with NON_FINITE_NUMERIC_REJECTED');

// 3.8 Malformed numeric input rejected
let malformedNumTrap = false;
try {
  const m = new SymbolMapper();
  await constructWebREnvironment(mockWebR, {
    treatmentVariable: 'treat',
    covariates: ['x'],
    covariateDefinitions: { x: { inferredType: 'continuous' } },
    rows: [
      { id: 'sub_01', treat: 1, x: 10 },
      { id: 'sub_02', treat: 0, x: 'thirty_five' }
    ]
  }, m);
} catch (err) {
  malformedNumTrap = err.code === 'MALFORMED_NUMERIC_REJECTED';
}
assert(malformedNumTrap, 'Malformed numeric string rejected with MALFORMED_NUMERIC_REJECTED');

// -------------------------------------------------------------
// 4. Canonical Result Runtime Schema Validation
// -------------------------------------------------------------
console.log('\n--- 4. Testing Canonical Result Schema & Invariants ---');

function createSampleCanonicalResult() {
  return {
    metadata: {
      runId: 'run_test_valid_01',
      parentRunId: null,
      timestamp: new Date().toISOString(),
      seed: null,
      executionDurationMs: 120,
      platform: { userAgent: 'test', cores: 2 }
    },
    inputFingerprint: {
      datasetSha256: 'a'.repeat(64),
      canonicalResultSha256: 'b'.repeat(64),
      totalRows: 4,
      completeCases: 4,
      excludedRows: 0,
      exclusionReasonSummary: {}
    },
    toolchain: {
      webrVersion: '0.6.0',
      rVersion: '4.6.0',
      emscriptenVersion: '5.0.7',
      matchItVersion: '4.8.1',
      cobaltVersion: '5.0.0',
      packageVersions: { matchIt: '4.8.1', cobalt: '5.0.0', webr: '0.6.0', r: '4.6.0' },
      dependencyVerificationStatus: 'PACKAGE_VERSION_PINNED_WASM_PRECOMPILED'
    },
    matchingConfiguration: {
      treatmentVariable: 'treat',
      covariates: ['age'],
      distanceMetric: 'linear.logit',
      method: 'nearest',
      ratio: 1,
      replace: false,
      matchingOrder: 'largest',
      caliper: 0.2,
      stdCaliper: true,
      discard: 'none',
      effectiveCaliperWidthRaw: 0.15,
      caliperScaleDescription: 'standardized'
    },
    factorConfiguration: {},
    propensityScores: {
      unitIds: ['1', '2', '3', '4'],
      treatment: [1, 1, 0, 0],
      propensityScores: [0.6, 0.7, 0.4, 0.3],
      linearLogits: [0.4, 0.8, -0.4, -0.8]
    },
    matchMatrix: {
      treatedIds: ['1', '2'],
      matchedControlIds: ['3', '4'],
      pairDistances: [0.1, 0.12]
    },
    matchedUnits: {
      matchedTreatedIds: ['1', '2'],
      matchedControlIds: ['3', '4'],
      totalMatchedPairs: 2,
      pairDistances: [0.1, 0.12]
    },
    matchingWeights: {
      unitIds: ['1', '2', '3', '4'],
      weights: [1, 1, 1, 1],
      subclass: [1, 2, 1, 2]
    },
    sampleAccounting: {
      importedTotal: 4,
      completeCases: 4,
      treatedTotal: 2,
      controlTotal: 2,
      matchedTreatedCount: 2,
      matchedControlCount: 2,
      unmatchedTreatedCount: 0,
      unmatchedControlCount: 0,
      discardedTreatedCount: 0,
      discardedControlCount: 0,
      treatedRetentionRate: 1.0
    },
    balanceTable: [],
    numericalDiagnostics: {
      glmConvergence: true,
      glmIterations: 4,
      nullDeviance: 5.5,
      residualDeviance: 3.2,
      maxAbsoluteCoefficient: 1.2,
      maxCoefficientStandardError: 0.4,
      coefficientTable: [{ term: '(Intercept)', estimate: 0.1, standardError: 0.2, zValue: 0.5, pValue: 0.6, aliased: false }],
      rubinB: 0.1,
      rubinR: 1.0
    },
    numericalInstabilitySafeguard: {
      triggered: false,
      maxCoefficientStandardError: 0.4,
      maxAbsoluteCoefficient: 1.2,
      policyClassification: 'PRESPECIFIED_NON_DIAGNOSTIC_RISK_SAFEGUARD',
      certificationStatus: 'UNVALIDATED_SAFEGUARD_NOT_SEPARATION_DETECTOR'
    },
    warnings: [],
    methodProvenance: {
      rCallMatchIt: 'MatchIt::matchit(...)',
      rCallCobalt: 'cobalt::bal.tab(...)',
      citationBibtexMatchIt: 'bib',
      citationBibtexCobalt: 'bib'
    },
    publicationStatus: {
      verdict: 'OUTPUT_READY',
      reasons: [],
      outputGenerationAllowed: true
    }
  };
}

// 4.1 Valid schema passes
const sampleRes = createSampleCanonicalResult();
const valPass = validateCanonicalResult(sampleRes);
assert(valPass.valid === true, 'Valid CanonicalPsmResult passes runtime schema validation');

// 4.2 Broken vector length invariant caught
const brokenVector = createSampleCanonicalResult();
brokenVector.propensityScores.unitIds.pop(); // length 3 vs totalRows 4
let vectorLengthTrap = false;
try {
  validateCanonicalResult(brokenVector);
} catch (err) {
  vectorLengthTrap = err.message.includes('INVARIANT_VIOLATION');
}
assert(vectorLengthTrap, 'Vector length mismatch caught with INVARIANT_VIOLATION');

// 4.3 Broken sample accounting invariant caught
const brokenAccounting = createSampleCanonicalResult();
brokenAccounting.sampleAccounting.treatedTotal = 999;
let accountingTrap = false;
try {
  validateCanonicalResult(brokenAccounting);
} catch (err) {
  accountingTrap = err.message.includes('INVARIANT_VIOLATION');
}
assert(accountingTrap, 'Sample accounting mismatch caught with INVARIANT_VIOLATION');

// 4.4 Caliper distance bound satisfaction invariant
const caliperViolation = createSampleCanonicalResult();
caliperViolation.matchMatrix.pairDistances[0] = 0.99; // effective caliper is 0.15
let caliperBoundTrap = false;
try {
  validateCanonicalResult(caliperViolation);
} catch (err) {
  caliperBoundTrap = err.message.includes('exceeds effective caliper width');
}
assert(caliperBoundTrap, 'Pair distance exceeding effective caliper width caught with INVARIANT_VIOLATION');

// 4.5 Non-self-referential hash contract
const resForHash = createSampleCanonicalResult();
const hash1 = await computeCanonicalResultHash(resForHash);
resForHash.inputFingerprint.canonicalResultSha256 = 'DIFFERENT_HASH';
const hash2 = await computeCanonicalResultHash(resForHash);
assert(hash1 === hash2 && hash1.length === 64, 'Non-self-referential hash calculation is invariant to existing canonicalResultSha256 value');

// -------------------------------------------------------------
// 5. Worker Lifecycle & Interruption States
// -------------------------------------------------------------
console.log('\n--- 5. Testing Worker Lifecycle & Interruption States ---');

class MockWorkerHarness {
  constructor() {
    this.terminated = false;
    this.onmessage = null;
    this.ignoreInterrupt = false;
  }
  postMessage(msg) {
    setTimeout(() => {
      if (this.terminated) return;
      if (msg.type === 'INIT') {
        if (this.onmessage) this.onmessage({ data: { type: 'INIT_COMPLETE', id: msg.id, payload: { initialized: true } } });
      } else if (msg.type === 'RUN_ANALYSIS') {
        setTimeout(() => {
          if (this.onmessage && !this.terminated) {
            this.onmessage({ data: { type: 'ANALYSIS_COMPLETE', id: msg.id, payload: { success: true } } });
          }
        }, this.ignoreInterrupt ? 500 : 60);
      } else if (msg.type === 'INTERRUPT') {
        if (this.ignoreInterrupt) {
          // Worker simulates hanging and ignoring interrupt
          return;
        }
        if (this.onmessage && !this.terminated) {
          // Cessation signal: error returned from analysis execution
          this.onmessage({ data: { type: 'ERROR', id: msg.targetJobId, targetJobId: msg.targetJobId, code: 'OPERATION_CANCELLED', error: 'WebR evaluation unwound on user interrupt' } });
        }
      }
    }, 10);
  }
  terminate() {
    this.terminated = true;
  }
}

async function withTimeout(promise, ms = 1000, description = 'Operation') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT: ${description} hung and did not settle within ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

// 5.1 Concurrency violation rejection
const managerLife = new WorkerLifecycleManager(() => new MockWorkerHarness(), { cancelTimeoutMs: 150 });
await managerLife.initialize();

const pJob1 = managerLife.submitAnalysis({ rows: [{ id: '1' }] });
let concurrencyTrapped = false;
try {
  await managerLife.submitAnalysis({ rows: [{ id: '2' }] });
} catch (err) {
  concurrencyTrapped = err.code === 'CONCURRENCY_ERROR';
}
assert(concurrencyTrapped, 'Concurrent job submission rejected with CONCURRENCY_ERROR');
await pJob1;

// 5.2 Confirmed graceful interruption
const pJobCancel = managerLife.submitAnalysis({ rows: [{ id: '1' }] });
let cancelThrown = false;
pJobCancel.catch((err) => {
  cancelThrown = err.code === 'OPERATION_CANCELLED';
});

const cancelStatus = await managerLife.cancelCurrentJob();
try {
  await pJobCancel;
} catch (err) {
  cancelThrown = err.code === 'OPERATION_CANCELLED';
}
assert(cancelStatus.status === 'GRACEFUL_INTERRUPT_CONFIRMED', 'cancelCurrentJob returns GRACEFUL_INTERRUPT_CONFIRMED');
assert(cancelThrown, 'Active job promise rejected with OPERATION_CANCELLED upon graceful interrupt');
assert(managerLife.getState() === 'READY', 'Lifecycle manager transitions back to READY state post-cancellation');

// 5.3 Hard termination fallback when worker ignores interrupt
const hangWorker = new MockWorkerHarness();
hangWorker.ignoreInterrupt = true;
const managerHang = new WorkerLifecycleManager(() => hangWorker, { cancelTimeoutMs: 50 });
await managerHang.initialize();

const pHangJob = managerHang.submitAnalysis({ rows: [{ id: '1' }] });
let hangJobCaught = false;
pHangJob.catch(() => {
  hangJobCaught = true;
});

const hangCancelStatus = await managerHang.cancelCurrentJob();
try {
  await pHangJob;
} catch {
  hangJobCaught = true;
}
assert(hangCancelStatus.status === 'HARD_TERMINATED', 'Worker ignoring interrupt triggers HARD_TERMINATED fallback after timeout');
assert(hangJobCaught, 'Pending job rejected during hard termination');
assert(managerHang.getState() === 'RECOVERABLE_ERROR', 'State transitions to RECOVERABLE_ERROR following hard termination');

// 5.4 Negative Control: Unrelated R error during cancellation window classified as WORKER_ERROR
class FailingWorkerHarness extends MockWorkerHarness {
  postMessage(msg) {
    setTimeout(() => {
      if (this.terminated) return;
      if (msg.type === 'INIT') {
        if (this.onmessage) this.onmessage({ data: { type: 'INIT_COMPLETE', id: msg.id, payload: { initialized: true } } });
      } else if (msg.type === 'RUN_ANALYSIS') {
        setTimeout(() => {
          if (this.onmessage && !this.terminated) {
            // Emits an unrelated R exception (NOT an interrupt)
            this.onmessage({ data: { type: 'ERROR', id: msg.id, code: 'R_EVAL_ERROR', error: 'Error in library(nonexistent): there is no package' } });
          }
        }, 50);
      } else if (msg.type === 'INTERRUPT') {
        // Acknowledge interrupt receipt
        if (this.onmessage) this.onmessage({ data: { type: 'INTERRUPT_ACK', id: msg.id } });
      }
    }, 10);
  }
}

const managerFail = new WorkerLifecycleManager(() => new FailingWorkerHarness(), { cancelTimeoutMs: 200 });
await managerFail.initialize();

const pFailingJob = managerFail.submitAnalysis({ rows: [{ id: '1' }] });
let failJobCaught = false;
pFailingJob.catch(() => { failJobCaught = true; });

// Request cancellation while failing job is running
const failCancelStatus = await managerFail.cancelCurrentJob();
try { await pFailingJob; } catch { failJobCaught = true; }

assert(failCancelStatus.status === 'WORKER_ERROR', 'Unrelated R error during interrupt window is classified as WORKER_ERROR, NOT graceful interrupt');
assert(failJobCaught, 'Failing job promise rejected with original error');

// 5.5 Stale message ID safely ignored without corrupting state
const managerStale = new WorkerLifecycleManager(() => new MockWorkerHarness());
await managerStale.initialize();
// Inject stale message with unknown id
managerStale.worker.onmessage({ data: { type: 'ANALYSIS_COMPLETE', id: 'stale_unknown_id_999', payload: {} } });
assert(managerStale.getState() === 'READY', 'Stale or unknown worker message safely ignored');

// -------------------------------------------------------------
// 5B. Mandatory Worker Fatal Error Settlement Audit Suite
// -------------------------------------------------------------
console.log('\n--- 5B. Testing Worker Fatal Error Settlement & Recovery ---');

const fatalAudit = {
  suite: 'CP-WEBR-02A R1.2a Worker Fatal Error Settlement Audit',
  executed_at: new Date().toISOString(),
  total_tests: 10,
  tests: []
};

// Fatal Test 1: Worker onerror with pending analysis
{
  const m = new WorkerLifecycleManager(() => new MockWorkerHarness());
  await m.initialize();
  const p = m.submitAnalysis({ rows: [{ id: '1' }] });
  let caught = false;
  let errorMsg = null;
  p.catch(err => { caught = true; errorMsg = err.message; });

  m.worker.onerror({ message: 'Crash: Worker out of memory' });

  try { await withTimeout(p, 500, 'Fatal 1 onerror job rejection'); } catch {}
  const handlersCleared = m.messageHandlers.size === 0;
  const stateIsRecoverable = m.getState() === 'RECOVERABLE_ERROR';
  await m.initialize();
  const freshRes = await m.submitAnalysis({ rows: [{ id: '1' }] });
  const freshOk = freshRes.success === true && m.getState() === 'READY';
  const pass = caught && handlersCleared && stateIsRecoverable && freshOk;
  assert(pass, 'Fatal 1: Worker onerror rejects pending job, clears handlers, and recovers cleanly', errorMsg);
  fatalAudit.tests.push({ id: 'FATAL_01_ONERROR', pass, error: errorMsg });
}

// Fatal Test 2: Worker onmessageerror with pending analysis
{
  const m = new WorkerLifecycleManager(() => new MockWorkerHarness());
  await m.initialize();
  const p = m.submitAnalysis({ rows: [{ id: '1' }] });
  let caught = false;
  let errorMsg = null;
  p.catch(err => { caught = true; errorMsg = err.message; });

  m.worker.onmessageerror({});

  try { await withTimeout(p, 500, 'Fatal 2 onmessageerror job rejection'); } catch {}
  const handlersCleared = m.messageHandlers.size === 0;
  const stateIsRecoverable = m.getState() === 'RECOVERABLE_ERROR';
  await m.initialize();
  const freshRes = await m.submitAnalysis({ rows: [{ id: '1' }] });
  const freshOk = freshRes.success === true && m.getState() === 'READY';
  const pass = caught && handlersCleared && stateIsRecoverable && freshOk;
  assert(pass, 'Fatal 2: Worker onmessageerror rejects pending job, clears handlers, and recovers cleanly', errorMsg);
  fatalAudit.tests.push({ id: 'FATAL_02_ONMESSAGEERROR', pass, error: errorMsg });
}

// Fatal Test 3: Unsolicited fatal Worker error while request active
{
  const m = new WorkerLifecycleManager(() => new MockWorkerHarness());
  await m.initialize();
  const p = m.submitAnalysis({ rows: [{ id: '1' }] });
  let caught = false;
  let errorMsg = null;
  p.catch(err => { caught = true; errorMsg = err.message; });

  m.worker.onmessage({ data: { type: 'ERROR', error: 'Unsolicited fatal WebAssembly trap' } });

  try { await withTimeout(p, 500, 'Fatal 3 unsolicited error job rejection'); } catch {}
  const handlersCleared = m.messageHandlers.size === 0;
  const stateIsRecoverable = m.getState() === 'RECOVERABLE_ERROR';
  await m.initialize();
  const freshRes = await m.submitAnalysis({ rows: [{ id: '1' }] });
  const freshOk = freshRes.success === true && m.getState() === 'READY';
  const pass = caught && handlersCleared && stateIsRecoverable && freshOk;
  assert(pass, 'Fatal 3: Unsolicited fatal error rejects pending job and recovers cleanly', errorMsg);
  fatalAudit.tests.push({ id: 'FATAL_03_UNSOLICITED_ERROR', pass, error: errorMsg });
}

// Fatal Test 4: Worker fails during initialization
{
  let initThrow = false;
  class FailingInitWorker extends MockWorkerHarness {
    postMessage(msg) {
      if (msg.type === 'INIT') {
        setTimeout(() => {
          if (this.onmessage) this.onmessage({ data: { type: 'ERROR', id: msg.id, error: 'Init failed: cannot load Wasm' } });
        }, 10);
      }
    }
  }
  let factoryReturnsFailing = true;
  const m = new WorkerLifecycleManager(() => factoryReturnsFailing ? new FailingInitWorker() : new MockWorkerHarness());
  try {
    await withTimeout(m.initialize(), 500, 'Fatal 4 init failure');
  } catch {
    initThrow = true;
  }
  const stateIsRecoverable = m.getState() === 'RECOVERABLE_ERROR';
  const workerIsNull = m.worker === null;
  factoryReturnsFailing = false;
  await m.initialize();
  const freshRes = await m.submitAnalysis({ rows: [{ id: '1' }] });
  const freshOk = freshRes.success === true && m.getState() === 'READY';
  const pass = initThrow && stateIsRecoverable && workerIsNull && freshOk;
  assert(pass, 'Fatal 4: Initialization failure enters RECOVERABLE_ERROR without dangling worker and recovers', `initThrow=${initThrow}`);
  fatalAudit.tests.push({ id: 'FATAL_04_INIT_FAILURE', pass });
}

// Fatal Test 5: Multiple pending message handlers exist during fatal failure
{
  const m = new WorkerLifecycleManager(() => new MockWorkerHarness());
  await m.initialize();
  const p1 = m.sendMessage('PING_1');
  const p2 = m.sendMessage('PING_2');
  let p1Caught = false;
  let p2Caught = false;
  p1.catch(() => { p1Caught = true; });
  p2.catch(() => { p2Caught = true; });

  m.worker.onerror({ message: 'Fatal crash aborting all operations' });

  try { await withTimeout(p1, 500, 'Fatal 5 p1 rejection'); } catch {}
  try { await withTimeout(p2, 500, 'Fatal 5 p2 rejection'); } catch {}
  const handlersCleared = m.messageHandlers.size === 0;
  await m.initialize();
  const freshRes = await m.submitAnalysis({ rows: [{ id: '1' }] });
  const freshOk = freshRes.success === true && m.getState() === 'READY';
  const pass = p1Caught && p2Caught && handlersCleared && freshOk;
  assert(pass, 'Fatal 5: Multiple pending message handlers are all rejected and cleared on fatal error');
  fatalAudit.tests.push({ id: 'FATAL_05_MULTIPLE_HANDLERS', pass });
}

// Fatal Test 6: Stale Worker delivers late message after recovery
{
  const m = new WorkerLifecycleManager(() => new MockWorkerHarness());
  await m.initialize();
  const oldWorker = m.worker;
  m.terminateAndRecover('Manual reset');
  await m.initialize();
  assert(m.getState() === 'READY', 'Fatal 6 setup: Manager in READY state post-recovery');

  // Stale worker emits message
  oldWorker.onmessage?.({ data: { type: 'ANALYSIS_COMPLETE', id: 'stale_id_001', payload: { data: 'corrupt' } } });
  oldWorker.onerror?.({ message: 'Stale error' });
  const freshRes = await m.submitAnalysis({ rows: [{ id: '1' }] });
  const pass = freshRes.success === true && m.getState() === 'READY';
  assert(pass, 'Fatal 6: Stale worker messages and errors after recovery are safely ignored without state corruption');
  fatalAudit.tests.push({ id: 'FATAL_06_STALE_WORKER_ISOLATION', pass });
}

// Fatal Test 7: Duplicate success/error events for same job
{
  const m = new WorkerLifecycleManager(() => new MockWorkerHarness());
  await m.initialize();
  let settleCount = 0;
  const p = m.submitAnalysis({ rows: [{ id: '1' }] });
  p.then(() => { settleCount++; });
  p.catch(() => { settleCount++; });

  const activeJobId = m.currentJob.id;
  // Deliver first success
  m.worker.onmessage({ data: { type: 'ANALYSIS_COMPLETE', id: activeJobId, payload: { success: true } } });
  // Attempt duplicate success
  m.worker.onmessage({ data: { type: 'ANALYSIS_COMPLETE', id: activeJobId, payload: { success: true } } });
  // Attempt duplicate error
  m.worker.onmessage({ data: { type: 'ERROR', id: activeJobId, error: 'Late error' } });

  await withTimeout(p, 500, 'Fatal 7 duplicate events');
  const pass = settleCount === 1 && m.getState() === 'READY';
  assert(pass, 'Fatal 7: Exactly-once settlement enforced under duplicate events; consumer promise settles once');
  fatalAudit.tests.push({ id: 'FATAL_07_EXACTLY_ONCE_SETTLEMENT', pass });
}

// Fatal Test 8: Worker error occurs during cancellation
{
  const m = new WorkerLifecycleManager(() => new MockWorkerHarness(), { cancelTimeoutMs: 500 });
  await m.initialize();
  const p = m.submitAnalysis({ rows: [{ id: '1' }] });
  let jobCaught = false;
  p.catch(() => { jobCaught = true; });

  const cancelPromise = m.cancelCurrentJob();
  // Trigger worker fatal error while cancellation is in flight
  m.worker.onerror({ message: 'Worker crashed during cancel' });

  const cancelRes = await withTimeout(cancelPromise, 500, 'Fatal 8 cancel resolution');
  try { await withTimeout(p, 500, 'Fatal 8 job rejection'); } catch {}
  const handlersCleared = m.messageHandlers.size === 0;
  const cancelSettled = cancelRes.status === 'WORKER_ERROR' || cancelRes.status === 'HARD_TERMINATED';
  await m.initialize();
  const freshRes = await m.submitAnalysis({ rows: [{ id: '1' }] });
  const freshOk = freshRes.success === true && m.getState() === 'READY';
  const pass = jobCaught && cancelSettled && handlersCleared && freshOk;
  assert(pass, 'Fatal 8: Worker error during cancellation settles both job and cancel promise without dangling');
  fatalAudit.tests.push({ id: 'FATAL_08_ERROR_DURING_CANCEL', pass });
}

// Fatal Test 9: Worker terminates before posting expected response
{
  const m = new WorkerLifecycleManager(() => new MockWorkerHarness());
  await m.initialize();
  const p = m.submitAnalysis({ rows: [{ id: '1' }] });
  let jobCaught = false;
  let errCode = null;
  p.catch(err => { jobCaught = true; errCode = err.code; });

  m.terminateAndRecover('Sudden worker host shutdown');

  try { await withTimeout(p, 500, 'Fatal 9 termination rejection'); } catch {}
  const handlersCleared = m.messageHandlers.size === 0;
  const stateIsRecoverable = m.getState() === 'RECOVERABLE_ERROR';
  await m.initialize();
  const freshRes = await m.submitAnalysis({ rows: [{ id: '1' }] });
  const freshOk = freshRes.success === true && m.getState() === 'READY';
  const pass = jobCaught && errCode === 'HARD_TERMINATED' && handlersCleared && stateIsRecoverable && freshOk;
  assert(pass, 'Fatal 9: Sudden worker termination rejects job with HARD_TERMINATED and recovers cleanly');
  fatalAudit.tests.push({ id: 'FATAL_09_SUDDEN_TERMINATION', pass });
}

// Adversarial Cancellation Test: Deliberate unrelated R error containing word "interrupted"
{
  class AdversarialTextWorker extends MockWorkerHarness {
    postMessage(msg) {
      setTimeout(() => {
        if (this.terminated) return;
        if (msg.type === 'INIT') {
          if (this.onmessage) this.onmessage({ data: { type: 'INIT_COMPLETE', id: msg.id, payload: { initialized: true } } });
        } else if (msg.type === 'RUN_ANALYSIS') {
          setTimeout(() => {
            if (this.onmessage && !this.terminated) {
              // Deliberately uses message text containing "interrupted", but code is NOT OPERATION_CANCELLED
              this.onmessage({
                data: {
                  type: 'ERROR',
                  id: msg.id,
                  code: 'R_EVAL_ERROR',
                  error: 'Error in evalR: process execution interrupted due to syntax constraint'
                }
              });
            }
          }, 40);
        } else if (msg.type === 'INTERRUPT') {
          if (this.onmessage) this.onmessage({ data: { type: 'INTERRUPT_ACK', id: msg.id } });
        }
      }, 10);
    }
  }

  const m = new WorkerLifecycleManager(() => new AdversarialTextWorker(), { cancelTimeoutMs: 300 });
  await m.initialize();
  const p = m.submitAnalysis({ rows: [{ id: '1' }] });
  let jobCaught = false;
  p.catch(() => { jobCaught = true; });

  const cancelRes = await m.cancelCurrentJob();
  try { await withTimeout(p, 500, 'Adversarial cancellation job rejection'); } catch {}

  const classifiedAsWorkerError = cancelRes.status === 'WORKER_ERROR';
  const notGraceful = cancelRes.status !== 'GRACEFUL_INTERRUPT_CONFIRMED';
  const statePostCancel = m.getState() === 'RECOVERABLE_ERROR';
  const pass = classifiedAsWorkerError && notGraceful && statePostCancel && jobCaught;
  assert(pass, 'Adversarial: Error containing "interrupted" text is NOT classified as graceful interrupt, worker safely terminated');
  fatalAudit.tests.push({ id: 'ADVERSARIAL_INTERRUPT_TEXT', pass, status: cancelRes.status });
}

// Write Fatal Error Settlement Audit artifact to r1.2a
const fatalAuditPath = path.resolve('experiments/cp-webr-02a/r1.2a/WORKER-FATAL-ERROR-SETTLEMENT-AUDIT.json');
fs.writeFileSync(fatalAuditPath, JSON.stringify(fatalAudit, null, 2), 'utf-8');
console.log(`Wrote fatal error settlement audit to ${fatalAuditPath}`);

// -------------------------------------------------------------
// 6. Template Integrity Verification
// -------------------------------------------------------------
console.log('\n--- 6. Testing Template Integrity Verification ---');

class MockWebRForAdapter {
  async evalR() {}
}

const mockWebRAdapter = new MockWebRForAdapter();
const adapter = new WebRStatisticalAdapter(mockWebRAdapter);

const cleanTemplate = 'run_psm_analysis <- function() { 42 }';
const { templateSha256 } = await adapter.initTemplate(cleanTemplate);
assert(typeof templateSha256 === 'string' && templateSha256.length === 64, 'Template initialized with valid SHA-256');

let tamperedTrap = false;
try {
  await adapter.initTemplate('run_psm_analysis <- function() { 99 }', templateSha256);
} catch (err) {
  tamperedTrap = err.code === 'TEMPLATE_INTEGRITY_MISMATCH';
}
assert(tamperedTrap, 'Tampered template rejected with TEMPLATE_INTEGRITY_MISMATCH');

// -------------------------------------------------------------
// Write Results
// -------------------------------------------------------------
const outPath = path.resolve('experiments/cp-webr-02a/ADAPTER-UNIT-TESTS.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
console.log(`\nWrote ${results.tests_passed + results.tests_failed} unit test results to ${outPath}`);
console.log(`Passed: ${results.tests_passed}/${results.tests_passed + results.tests_failed}`);

if (results.tests_failed > 0) {
  process.exit(1);
}
process.exit(0);
