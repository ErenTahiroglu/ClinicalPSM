// CP-WEBR-02A Dedicated Worker Lifecycle Manager & State Machine
// Conforms to CP-WEBR-01 Production Architecture Section 3 & R1.2 Requirements

export class WorkerLifecycleManager {
  constructor(workerFactory, options = {}) {
    this.workerFactory = workerFactory;
    this.options = {
      cancelTimeoutMs: options.cancelTimeoutMs || 2000,
      ...options
    };
    this.worker = null;
    this.state = 'NOT_LOADED';
    this.currentJob = null;
    this.messageHandlers = new Map();
    this.stateChangeListeners = new Set();
  }

  getState() {
    return this.state;
  }

  onStateChange(listener) {
    this.stateChangeListeners.add(listener);
    return () => this.stateChangeListeners.delete(listener);
  }

  setState(newState, detail = {}) {
    const oldState = this.state;
    this.state = newState;
    for (const listener of this.stateChangeListeners) {
      try {
        listener(newState, oldState, detail);
      } catch (err) {
        console.error('Error in state listener:', err);
      }
    }
  }

  /**
   * Initializes or re-initializes the dedicated worker
   */
  async initialize(initPayload = {}) {
    if (this.state === 'READY') {
      return;
    }
    if (this.state === 'RUNNING' || this.state === 'INITIALIZING' || this.state === 'CANCELLING') {
      throw new Error(`Cannot initialize while worker is in state: ${this.state}`);
    }

    this.setState('INITIALIZING');

    try {
      if (this.worker) {
        try { this.worker.terminate(); } catch {}
        this.worker = null;
      }
      this.messageHandlers.clear();

      this.worker = this.workerFactory();
      this.setupWorkerListeners();

      // Send INIT command to worker
      const initResult = await this.sendMessage('INIT', {
        webrVersion: '0.6.0',
        packages: ['MatchIt', 'cobalt'],
        ...initPayload
      });

      this.setState('READY', { initResult });
      return initResult;
    } catch (err) {
      this.setState('BLOCKED', { error: err.message });
      throw err;
    }
  }

  setupWorkerListeners() {
    this.worker.onmessage = (event) => {
      const data = event.data || {};
      const { id, payload, error, type, targetJobId } = data;

      if (id && this.messageHandlers.has(id)) {
        const handler = this.messageHandlers.get(id);
        this.messageHandlers.delete(id);
        if (error) {
          const err = new Error(error);
          if (data.code) err.code = data.code;
          handler.reject(err);
        } else {
          handler.resolve(payload);
        }
        return;
      }

      // Handle unsolicited error reports from worker
      if (type === 'ERROR') {
        const err = new Error(error || 'Worker error event');
        if (data.code) err.code = data.code;
        this.handleWorkerLevelError(err);
        return;
      }

      // Discard unexpected or stale messages
      if (id) {
        console.warn(`[WorkerLifecycle] Discarding stale or unhandled worker message id=${id}, type=${type}`);
      }
    };

    this.worker.onerror = (err) => {
      console.error('Worker error caught in lifecycle manager:', err);
      const errorObj = new Error(`Worker execution error: ${err.message || 'Unknown error'}`);
      this.handleWorkerLevelError(errorObj);
    };
  }

  handleWorkerLevelError(err) {
    if (this.currentJob && !this.currentJob.settled) {
      this.currentJob.settled = true;
      this.currentJob.state = 'WORKER_ERROR';
      this.currentJob.error = err.message;
      this.currentJob.reject(err);
      this.currentJob = null;
    }
    this.setState('RECOVERABLE_ERROR', { error: err.message });
  }

  /**
   * Submits a statistical analysis job (Single-job concurrency enforcement)
   */
  async submitAnalysis(datasetInput) {
    return this.executeJob('RUN_ANALYSIS', datasetInput);
  }

  /**
   * Submits a custom test workload (e.g. RUN_LONG_WORKLOAD, RUN_FAILING_WORKLOAD)
   */
  async submitWorkload(type, payload = {}) {
    return this.executeJob(type, payload);
  }

  /**
   * Internal job execution harness with explicit state transitions & late result rejection
   */
  async executeJob(type, payload) {
    if (this.state !== 'READY') {
      if (this.state === 'RUNNING' || this.state === 'CANCELLING') {
        const err = new Error(`Concurrency violation: Worker is currently in state ${this.state} (job ${this.currentJob?.id}). Concurrent tasks prohibited.`);
        err.code = 'CONCURRENCY_ERROR';
        throw err;
      }
      throw new Error(`Worker not ready for analysis: current state is ${this.state}`);
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.setState('RUNNING', { jobId });

    return new Promise((resolve, reject) => {
      const jobRecord = {
        id: jobId,
        state: 'RUNNING', // 'RUNNING' | 'INTERRUPT_REQUESTED' | 'GRACEFUL_INTERRUPT_CONFIRMED' | 'HARD_TERMINATED' | 'WORKER_ERROR' | 'COMPLETED'
        startTime: Date.now(),
        settled: false,
        error: null,
        resolve: (val) => {
          if (jobRecord.settled) return;
          jobRecord.settled = true;
          resolve(val);
        },
        reject: (err) => {
          if (jobRecord.settled) return;
          jobRecord.settled = true;
          reject(err);
        }
      };
      this.currentJob = jobRecord;

      this.sendMessage(type, payload, jobId)
        .then((result) => {
          if (jobRecord.state === 'INTERRUPT_REQUESTED' || jobRecord.state === 'GRACEFUL_INTERRUPT_CONFIRMED' || jobRecord.state === 'HARD_TERMINATED') {
            // Late success received after cancellation was requested!
            // Computation failed to cease upon interrupt request.
            jobRecord.state = 'HARD_TERMINATED';
            jobRecord.error = 'Late result rejected: computation ignored cancellation request';
            this.terminateAndRecover('Late result received after cancellation');
            const lateErr = new Error('LATE_RESULT_REJECTED: Computation did not cease upon interrupt');
            lateErr.code = 'LATE_RESULT_REJECTED';
            jobRecord.reject(lateErr);
            return;
          }
          jobRecord.state = 'COMPLETED';
          this.currentJob = null;
          this.setState('COMPLETED', { jobId, result });
          this.setState('READY');
          jobRecord.resolve(result);
        })
        .catch((err) => {
          if (jobRecord.state === 'INTERRUPT_REQUESTED') {
            // Explicitly validate that error is a genuine interruption, NOT an unrelated R runtime error
            const isInterruptError =
              err.code === 'OPERATION_CANCELLED' ||
              err.name === 'UnwindProtectException' ||
              /interrupted|operation cancelled|webR\.interrupt|non-local transfer of control/i.test(err.message);

            if (isInterruptError) {
              // Confirmed graceful cessation from webR.interrupt()
              jobRecord.state = 'GRACEFUL_INTERRUPT_CONFIRMED';
              const cancelErr = new Error(`OPERATION_CANCELLED: Job ${jobId} was interrupted by user request`);
              cancelErr.code = 'OPERATION_CANCELLED';
              this.currentJob = null;
              this.setState('READY');
              jobRecord.reject(cancelErr);
            } else {
              // Unrelated execution error during cancellation window! Must NOT be classified as graceful interrupt!
              jobRecord.state = 'WORKER_ERROR';
              jobRecord.error = err.message;
              this.currentJob = null;
              this.setState('RECOVERABLE_ERROR', { jobId, error: err.message });
              jobRecord.reject(err);
            }
          } else if (jobRecord.state === 'HARD_TERMINATED') {
            // Already handled in termination path
          } else {
            jobRecord.state = 'WORKER_ERROR';
            jobRecord.error = err.message;
            this.currentJob = null;
            this.setState('RECOVERABLE_ERROR', { jobId, error: err.message });
            jobRecord.reject(err);
          }
        });
    });
  }

  /**
   * Graceful interruption with observed cessation and hard-termination fallback
   */
  async cancelCurrentJob() {
    if (this.state !== 'RUNNING' || !this.currentJob) {
      return { status: 'NO_ACTIVE_JOB', interruptRequested: false, cancellationCompleted: false };
    }

    const activeJob = this.currentJob;
    activeJob.state = 'INTERRUPT_REQUESTED';
    const interruptRequestedAt = performance.now();
    this.setState('CANCELLING', { jobId: activeJob.id });

    // Post INTERRUPT message correlated to targetJobId
    try {
      this.worker.postMessage({
        type: 'INTERRUPT',
        id: `interrupt_${activeJob.id}`,
        targetJobId: activeJob.id
      });
    } catch (err) {
      console.warn('Failed to post INTERRUPT message, proceeding to hard termination:', err);
    }

    return new Promise((resolve) => {
      let resolved = false;

      const finishCancellation = (status, error = null) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        removeListener();
        const durationMs = performance.now() - interruptRequestedAt;

        resolve({
          status,
          jobId: activeJob.id,
          interruptRequested: true,
          cancellationCompleted: true,
          durationMs,
          error: error ? (error.message || String(error)) : null
        });
      };

      const timer = setTimeout(() => {
        if (this.state === 'CANCELLING') {
          activeJob.state = 'HARD_TERMINATED';
          activeJob.error = 'Timeout exceeded waiting for graceful cessation';
          this.terminateAndRecover('Hard termination fallback after cancellation timeout');
          finishCancellation('HARD_TERMINATED', new Error('Timeout exceeded'));
        }
      }, this.options.cancelTimeoutMs);

      // Listen for clean job resolution/rejection or worker error
      const removeListener = this.onStateChange((newState) => {
        if (resolved) return;
        if (activeJob.state === 'HARD_TERMINATED') {
          finishCancellation('HARD_TERMINATED', new Error('Hard termination invoked'));
        } else if (newState === 'READY' && activeJob.state === 'GRACEFUL_INTERRUPT_CONFIRMED') {
          finishCancellation('GRACEFUL_INTERRUPT_CONFIRMED');
        } else if (newState === 'RECOVERABLE_ERROR' || activeJob.state === 'WORKER_ERROR') {
          finishCancellation('WORKER_ERROR', new Error(activeJob.error || 'Worker execution error during cancellation'));
        }
      });
    });
  }

  /**
   * Hard worker termination and recovery
   */
  terminateAndRecover(reason = 'Manual termination') {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (err) {
        console.warn('Error during worker.terminate():', err);
      }
      this.worker = null;
    }

    if (this.currentJob && !this.currentJob.settled) {
      const err = new Error(`Job terminated: ${reason}`);
      err.code = 'HARD_TERMINATED';
      this.currentJob.reject(err);
      this.currentJob = null;
    }

    // Clear all pending message handlers and reject their promises
    for (const handler of this.messageHandlers.values()) {
      try {
        const err = new Error(`Worker terminated (${reason}): pending operation aborted.`);
        err.code = 'WORKER_TERMINATED';
        handler.reject(err);
      } catch {}
    }
    this.messageHandlers.clear();

    this.setState('RECOVERABLE_ERROR', { reason });
  }

  /**
   * Low-level message dispatcher
   */
  sendMessage(type, payload = {}, explicitId = null) {
    if (!this.worker) {
      return Promise.reject(new Error('Worker not initialized'));
    }
    const id = explicitId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return new Promise((resolve, reject) => {
      this.messageHandlers.set(id, { resolve, reject });
      this.worker.postMessage({ type, id, payload });
    });
  }
}
