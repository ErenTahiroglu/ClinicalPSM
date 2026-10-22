import { WorkerLifecycleManager } from '/__test__/worker_manager.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const withDeadline = async (promise, timeoutMs, label) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs); })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
let lastManager = null;
let lastWorkerCount = () => 0;

function createManager({ cancelTimeoutMs = 600, workerUrl = '/__test__/scenario-worker.js' } = {}) {
  let workerCount = 0;
  const manager = new WorkerLifecycleManager(() => {
    workerCount++;
    return new Worker(workerUrl, { type: 'module' });
  }, { cancelTimeoutMs });
  lastManager = manager;
  lastWorkerCount = () => workerCount;
  return { manager, workerCount: () => workerCount };
}

window.runLifecycleScenario = async ({ mode, cancelAfterMs = null, cancelTimeoutMs = 600, timeoutMs = 3000, initTimeoutMs = 45000, allowInitFailure = false, workerUrl } = {}) => {
  const { manager, workerCount } = createManager({ cancelTimeoutMs, workerUrl });
  console.info(`[lifecycle] ${mode} initialize:start`);
  let init;
  try {
    init = await withDeadline(manager.initialize({ baseUrl: '/assets/webr/', repoUrl: '/assets/repo' }), initTimeoutMs, `${mode} WebR initialization`);
    console.info(`[lifecycle] ${mode} initialize:complete channel=${init?.channelType}`);
  } catch (error) {
    manager.terminateAndRecover('browser harness initialization deadline');
    console.error(`[lifecycle] ${mode} initialize:failed ${error?.message || error}`);
    if (allowInitFailure) return { initFailure: { message: error?.message || String(error) }, managerState: manager.getState(), workerCount: workerCount() };
    throw error;
  }
  let settlementCount = 0;
  const job = manager.submitWorkload('RUN_SCENARIO', { mode }).then(
    value => { settlementCount++; return { status: 'RESOLVED', value }; },
    error => { settlementCount++; return { status: 'REJECTED', code: error.code || null, message: error.message }; }
  );

  let cancelResult = null;
  let messageErrorDispatched = false;
  let messageErrorHandlerFallback = false;
  if (mode === 'MESSAGEERROR') {
    await delay(30);
    const brokenWorker = manager.worker;
    messageErrorDispatched = brokenWorker.dispatchEvent(new MessageEvent('messageerror'));
    await delay(10);
    if (settlementCount === 0 && typeof brokenWorker.onmessageerror === 'function') {
      messageErrorHandlerFallback = true;
      brokenWorker.onmessageerror(new MessageEvent('messageerror'));
    }
  }
  if (cancelAfterMs !== null) {
    await delay(cancelAfterMs);
    cancelResult = await manager.cancelCurrentJob();
  }

  const outcome = await Promise.race([
    job,
    delay(timeoutMs).then(() => ({ status: 'HANG', code: null, message: 'Promise settlement timeout' }))
  ]);
  return {
    init,
    outcome,
    cancelResult,
    settlementCount,
    managerState: manager.getState(),
    workerCount: workerCount(),
    messageErrorDispatched,
    messageErrorHandlerFallback
  };
};

window.runInitializationCancellation = async () => {
  const { manager } = createManager({ cancelTimeoutMs: 100, workerUrl: '/__test__/scenario-worker.js?delayinit=1' });
  const initPromise = manager.initialize({ baseUrl: '/assets/webr/', repoUrl: '/assets/repo' }).then(
    () => ({ status: 'RESOLVED' }),
    error => ({ status: 'REJECTED', code: error.code || null })
  );
  await delay(20);
  const cancelResult = await manager.cancelCurrentJob();
  const initOutcome = await Promise.race([initPromise, delay(1000).then(() => ({ status: 'HANG' }))]);
  return { cancelResult, initOutcome, managerState: manager.getState() };
};

window.recoverLastManager = async () => {
  if (!lastManager) throw new Error('No previous manager to recover');
  await lastManager.initialize({ baseUrl: '/assets/webr/', repoUrl: '/assets/repo' });
  return lastManager.getState();
};

window.runRecoverySuccess = async () => {
  if (!lastManager) throw new Error('No previous manager to recover');
  await lastManager.initialize({ baseUrl: '/assets/webr/', repoUrl: '/assets/repo' });
  const result = await Promise.race([
    lastManager.submitWorkload('RUN_SCENARIO', { mode: 'SUCCESS' }),
    delay(1500).then(() => { throw new Error('Recovery analysis hung'); })
  ]);
  return { result, managerState: lastManager.getState(), workerCount: lastWorkerCount() };
};

window.dispatchLastMessageError = () => {
  if (!lastManager?.worker) throw new Error('No worker available');
  return lastManager.worker.dispatchEvent(new MessageEvent('messageerror'));
};
