// Focused CP-WEBR-02A lifecycle regressions replayed against the application manager.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { WorkerLifecycleManager } from '../../src/lib/webr/worker_manager.mjs';

const results = [];
const evidenceFile = process.env.CP_WEBR_WORKER_REGRESSION_EVIDENCE_FILE || '/tmp/cp-webr-02b-worker-regressions.json';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = async (promise, label, timeoutMs = 1500) => Promise.race([
  promise,
  delay(timeoutMs).then(() => { throw new Error(label + ' timed out after ' + timeoutMs + ' ms'); })
]);

function check(name, body) {
  try {
    body();
    results.push({ name, status: 'PASS' });
    console.log('PASS ' + name);
  } catch (error) {
    results.push({ name, status: 'FAIL', detail: String(error?.stack || error) });
    console.error('FAIL ' + name + ':', error);
  }
}

class ControlledWorker {
  constructor(mode) {
    this.mode = mode;
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
    this.terminated = false;
  }
  postMessage(message) {
    if (message.type === 'INIT') {
      if (this.mode !== 'INIT_HANG') queueMicrotask(() => this.onmessage?.({ data: { type: 'INIT_COMPLETE', id: message.id, payload: {} } }));
    } else if (message.type === 'RUN_ANALYSIS') {
      this.jobId = message.id;
    } else if (message.type === 'INTERRUPT') {
      const jobId = message.targetJobId;
      if (this.mode === 'GRACEFUL') {
        queueMicrotask(() => this.onmessage?.({ data: { type: 'INTERRUPT_ACK', id: message.id, targetJobId: jobId } }));
        setTimeout(() => this.onmessage?.({ data: { type: 'ERROR', id: jobId, targetJobId: jobId, code: 'OPERATION_CANCELLED', error: 'native cancellation control' } }), 5);
      } else if (this.mode === 'UNRELATED') {
        setTimeout(() => this.onmessage?.({ data: { type: 'ERROR', id: jobId, targetJobId: jobId, code: 'R_RUNTIME_ERROR', error: 'execution interrupted appears in unrelated message text' } }), 5);
      } else if (this.mode === 'UNSUPPORTED') {
        queueMicrotask(() => this.onmessage?.({ data: { type: 'INTERRUPT_FAILED', id: message.id, targetJobId: jobId, code: 'INTERRUPT_UNSUPPORTED_IN_POSTMESSAGE_MODE', error: 'no shared channel' } }));
      } else if (this.mode === 'LATE') {
        setTimeout(() => this.onmessage?.({ data: { type: 'ANALYSIS_COMPLETE', id: jobId, payload: { success: true } } }), 10);
      }
    }
  }
  terminate() { this.terminated = true; }
}

async function run() {
  const gracefulWorker = new ControlledWorker('GRACEFUL');
  const graceful = new WorkerLifecycleManager(() => gracefulWorker, { cancelTimeoutMs: 300 });
  await graceful.initialize();
  let settlements = 0;
  const gracefulJob = graceful.submitAnalysis({}).then(
    () => { settlements++; return null; },
    error => { settlements++; return error; }
  );
  const gracefulCancel = await graceful.cancelCurrentJob();
  const gracefulError = await deadline(gracefulJob, 'graceful cancellation');
  check('CP-WEBR-02A exact job cancellation and one settlement', () => {
    assert.equal(gracefulError?.code, 'OPERATION_CANCELLED');
    assert.equal(gracefulCancel.status, 'GRACEFUL_INTERRUPT_CONFIRMED');
    assert.equal(settlements, 1);
    assert.equal(graceful.getState(), 'READY');
  });

  const unrelated = new WorkerLifecycleManager(() => new ControlledWorker('UNRELATED'), { cancelTimeoutMs: 300 });
  await unrelated.initialize();
  const unrelatedJob = unrelated.submitAnalysis({}).then(() => null, error => error);
  const unrelatedCancel = await unrelated.cancelCurrentJob();
  const unrelatedError = await deadline(unrelatedJob, 'unrelated runtime error');
  check('CP-WEBR-02A unrelated exception text is not cancellation', () => {
    assert.equal(unrelatedError?.code, 'R_RUNTIME_ERROR');
    assert.equal(unrelatedCancel.status, 'WORKER_ERROR');
    assert.notEqual(unrelatedCancel.status, 'GRACEFUL_INTERRUPT_CONFIRMED');
  });

  const unsupportedWorker = new ControlledWorker('UNSUPPORTED');
  const unsupported = new WorkerLifecycleManager(() => unsupportedWorker, { cancelTimeoutMs: 300 });
  await unsupported.initialize();
  const unsupportedJob = unsupported.submitAnalysis({}).then(() => null, error => error);
  const unsupportedCancel = await unsupported.cancelCurrentJob();
  await deadline(unsupportedJob, 'unsupported interrupt');
  check('CP-WEBR-02A unsupported interruption is explicit hard termination', () => {
    assert.equal(unsupportedCancel.status, 'INTERRUPT_UNSUPPORTED');
    assert.equal(unsupportedCancel.termination, 'HARD_TERMINATED');
    assert.equal(unsupportedWorker.terminated, true);
  });

  const lateWorker = new ControlledWorker('LATE');
  const late = new WorkerLifecycleManager(() => lateWorker, { cancelTimeoutMs: 300 });
  await late.initialize();
  const lateJob = late.submitAnalysis({}).then(() => null, error => error);
  await delay(1);
  await late.cancelCurrentJob();
  const lateError = await deadline(lateJob, 'late result');
  check('CP-WEBR-02A late result rejected after cancellation', () => {
    assert.equal(lateError?.code, 'LATE_RESULT_REJECTED');
    assert.equal(lateWorker.terminated, true);
  });

  const initializingWorker = new ControlledWorker('INIT_HANG');
  const initializing = new WorkerLifecycleManager(() => initializingWorker);
  const initPromise = initializing.initialize().then(() => null, error => error);
  const initCancel = await initializing.cancelCurrentJob();
  const initError = await deadline(initPromise, 'initialization cancellation');
  check('CP-WEBR-02A initialization cancellation terminates worker', () => {
    assert.equal(initCancel.status, 'INITIALIZATION_HARD_TERMINATED');
    assert.equal(initError?.code, 'WORKER_TERMINATED');
    assert.equal(initializingWorker.terminated, true);
  });

  const fatalWorker = new ControlledWorker('IDLE');
  const fatal = new WorkerLifecycleManager(() => fatalWorker);
  await fatal.initialize();
  const fatalJob = fatal.submitAnalysis({}).then(() => null, error => error);
  fatalWorker.onmessageerror?.({ type: 'messageerror' });
  const fatalError = await deadline(fatalJob, 'onmessageerror');
  check('CP-WEBR-02A onmessageerror rejects the active job', () => {
    assert.equal(fatalError?.code, 'WORKER_ONMESSAGEERROR');
    assert.equal(fatal.getState(), 'RECOVERABLE_ERROR');
  });

  const evidence = {
    suite: 'CP-WEBR-02A lifecycle regressions against CP-WEBR-02B application manager',
    commitSha: process.env.GITHUB_SHA || 'LOCAL_UNCOMMITTED',
    generatedAt: new Date().toISOString(),
    results,
    verdict: results.every(result => result.status === 'PASS') ? 'PASS' : 'FAIL'
  };
  fs.mkdirSync(path.dirname(evidenceFile), { recursive: true });
  fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + '\n');
  console.log('');
  console.log(results.filter(result => result.status === 'PASS').length + ' PASS, ' + results.filter(result => result.status === 'FAIL').length + ' FAIL');
  console.log('Evidence: ' + evidenceFile);
  if (evidence.verdict !== 'PASS') process.exitCode = 1;
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
