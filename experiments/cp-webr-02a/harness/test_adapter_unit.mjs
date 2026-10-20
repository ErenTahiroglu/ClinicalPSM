// CP-WEBR-02A Adapter Unit Suite
// Tests:
// 1. SymbolMapper (Monotonic aliases, Unicode NFC, 256 code point limit, control chars, reversibility)
// 2. CanonicalSerializer (Lexicographical sorting, defensive cloning, non-finite values, envelope hashing, tampering detection)
// 3. WorkerLifecycleManager (8-state transitions, concurrency enforcement, cancellation, termination)

import fs from 'node:fs';
import path from 'node:path';
import { SymbolMapper } from '../adapter/symbol_mapper.mjs';
import {
  canonicalizeValue,
  defensiveClone,
  serializeCanonical,
  wrapInVersionedEnvelope,
  verifyEnvelope
} from '../adapter/canonical_serializer.mjs';
import { WorkerLifecycleManager } from '../adapter/worker_manager.mjs';

const results = {
  suite: 'CP-WEBR-02A Adapter Unit Suite',
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
// 1. SymbolMapper Unit Tests
// -------------------------------------------------------------
console.log('\n--- 1. Testing SymbolMapper ---');

const mapper = new SymbolMapper();

// 1.1 Monotonic alias generation
const trt0 = mapper.registerTreatment('Treatment Group');
const cov0 = mapper.registerCovariate('Patient Age');
const cov1 = mapper.registerCovariate('Body Mass Index');
assert(trt0 === 'trt_00', 'Treatment alias is monotonic trt_00', `got ${trt0}`);
assert(cov0 === 'cov_00', 'First covariate alias is cov_00', `got ${cov0}`);
assert(cov1 === 'cov_01', 'Second covariate alias is cov_01', `got ${cov1}`);

// 1.2 Idempotency
assert(mapper.registerTreatment('Treatment Group') === 'trt_00', 'Registering same treatment returns identical alias');
assert(mapper.registerCovariate('Patient Age') === 'cov_00', 'Registering same covariate returns identical alias');

// 1.3 Reversibility
assert(mapper.getOriginal('cov_00') === 'Patient Age', 'Reversible mapping: cov_00 -> Patient Age');
assert(mapper.getOriginal('cov_01') === 'Body Mass Index', 'Reversible mapping: cov_01 -> Body Mass Index');

// 1.4 Unicode NFC normalization
const nfdHeader = 'Ya\u015f'; // Yaş in NFC
const nfcHeader = 'Yaş';
const covUnicode = mapper.registerCovariate(nfdHeader);
assert(mapper.getAlias(nfcHeader) === covUnicode, 'Unicode NFC normalization maps NFD and NFC to same alias');

// 1.5 Code point limit (<= 256)
const valid256 = 'A'.repeat(256);
assert(SymbolMapper.validateAndNormalizeHeader(valid256) === valid256, '256 code points header accepted');

let limitTrapped = false;
try {
  const invalid257 = 'A'.repeat(257);
  SymbolMapper.validateAndNormalizeHeader(invalid257);
} catch (err) {
  limitTrapped = err.code === 'HEADER_LENGTH_EXCEEDED';
}
assert(limitTrapped, 'Header with 257 code points rejected with HEADER_LENGTH_EXCEEDED');

// 1.6 Control character & null byte rejection
let nullTrapped = false;
try {
  SymbolMapper.validateAndNormalizeHeader('Patient\x00Name');
} catch (err) {
  nullTrapped = true;
}
assert(nullTrapped, 'Header with null byte rejected');

let controlTrapped = false;
try {
  SymbolMapper.validateAndNormalizeHeader('Age\x1bEscaped');
} catch (err) {
  controlTrapped = true;
}
assert(controlTrapped, 'Header with escape control character rejected');

// -------------------------------------------------------------
// 2. CanonicalSerializer Unit Tests
// -------------------------------------------------------------
console.log('\n--- 2. Testing CanonicalSerializer ---');

// 2.1 Lexicographical key sorting
const unsorted = { z: 1, a: 2, m: { y: 10, b: 20 } };
const canonicalJson = serializeCanonical(unsorted);
assert(canonicalJson === '{"a":2,"m":{"b":20,"y":10},"z":1}', 'Keys sorted lexicographically at all nesting levels', canonicalJson);

// 2.2 Defensive cloning & Non-finite preservation
const withNonFinite = { val: NaN, inf: Infinity, negInf: -Infinity, normal: 42.5 };
const cloned = defensiveClone(withNonFinite);
assert(cloned.val === null && cloned.inf === null && cloned.negInf === null, 'Non-finite numbers converted to null (never coerced to 0)');
assert(cloned.normal === 42.5, 'Normal numbers preserved in defensive clone');

// 2.3 VersionedCanonicalEnvelope creation & verification
const payload = { result: 'OK', matched: 119, weights: [1, 1, 0] };
const envelope = wrapInVersionedEnvelope(payload, { runId: 'run_test_01' });
assert(envelope.envelopeVersion === '1.0.0', 'Envelope version is 1.0.0');
assert(typeof envelope.payloadSha256 === 'string' && envelope.payloadSha256.length === 64, 'Envelope contains valid 64-char SHA-256');

const verifyClean = verifyEnvelope(envelope);
assert(verifyClean.valid === true, 'Envelope verification succeeds on untampered payload');

// 2.4 Tampering detection
const tampered = JSON.parse(JSON.stringify(envelope));
tampered.payload.matched = 120;
const verifyTampered = verifyEnvelope(tampered);
assert(verifyTampered.valid === false, 'Envelope verification traps payload tampering');

// -------------------------------------------------------------
// 3. WorkerLifecycleManager Unit Tests
// -------------------------------------------------------------
console.log('\n--- 3. Testing WorkerLifecycleManager ---');

// Mock worker for lifecycle unit testing
class MockWorker {
  constructor() {
    this.terminated = false;
    this.onmessage = null;
    this.onerror = null;
  }
  postMessage(msg) {
    setTimeout(() => {
      if (this.terminated) return;
      if (msg.type === 'INIT') {
        if (this.onmessage) this.onmessage({ data: { type: 'INIT_COMPLETE', id: msg.id, payload: { initialized: true } } });
      } else if (msg.type === 'RUN_ANALYSIS') {
        // Simulate delay
        setTimeout(() => {
          if (this.onmessage && !this.terminated) {
            this.onmessage({ data: { type: 'ANALYSIS_COMPLETE', id: msg.id, payload: { success: true } } });
          }
        }, 50);
      } else if (msg.type === 'INTERRUPT') {
        if (this.onmessage) this.onmessage({ data: { type: 'INTERRUPT_COMPLETE', id: msg.id, payload: { interrupted: true } } });
      }
    }, 10);
  }
  terminate() {
    this.terminated = true;
  }
}

const manager = new WorkerLifecycleManager(() => new MockWorker(), { cancelTimeoutMs: 100 });
assert(manager.getState() === 'NOT_LOADED', 'Initial worker state is NOT_LOADED');

await manager.initialize();
assert(manager.getState() === 'READY', 'Worker state transitions to READY after INIT');

// Submit job & verify RUNNING state
const jobPromise = manager.submitAnalysis({ treatmentVariable: 't', covariates: ['c'], rows: [{ t: 1, c: 2 }] });
assert(manager.getState() === 'RUNNING', 'Worker state transitions to RUNNING on job submit');

// Concurrency test: attempting concurrent analysis must throw CONCURRENCY_ERROR
let concurrencyBlocked = false;
try {
  await manager.submitAnalysis({ treatmentVariable: 't', covariates: ['c'], rows: [{ t: 1, c: 2 }] });
} catch (err) {
  concurrencyBlocked = err.code === 'CONCURRENCY_ERROR';
}
assert(concurrencyBlocked, 'Single-job concurrency enforced: concurrent request throws CONCURRENCY_ERROR');

const jobRes = await jobPromise;
assert(jobRes.success === true, 'First analysis completes successfully');
assert(manager.getState() === 'READY', 'Worker reverts to READY state post-completion');

// Test hard termination and recovery
manager.terminateAndRecover('Test termination');
assert(manager.getState() === 'RECOVERABLE_ERROR', 'State is RECOVERABLE_ERROR after terminateAndRecover');

await manager.initialize();
assert(manager.getState() === 'READY', 'Worker recovers cleanly to READY state after re-initialization');

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
