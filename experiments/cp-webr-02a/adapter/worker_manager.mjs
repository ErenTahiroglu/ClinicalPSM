// CP-WEBR-02A Dedicated Worker Lifecycle Manager & State Machine
// Conforms to CP-WEBR-01 Production Architecture Section 3

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
  async initialize() {
    if (this.state === 'READY') {
      return;
    }
    if (this.state === 'RUNNING' || this.state === 'INITIALIZING') {
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
        packages: ['MatchIt', 'cobalt']
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
      const { id, payload, error } = event.data || {};
      if (id && this.messageHandlers.has(id)) {
        const handler = this.messageHandlers.get(id);
        this.messageHandlers.delete(id);
        if (error) {
          const err = new Error(error);
          if (event.data?.code) err.code = event.data.code;
          handler.reject(err);
        } else {
          handler.resolve(payload);
        }
      }
    };

    this.worker.onerror = (err) => {
      console.error('Worker error caught in lifecycle manager:', err);
      if (this.currentJob) {
        const errorObj = new Error(`Worker execution error: ${err.message || 'Unknown error'}`);
        this.currentJob.reject(errorObj);
        this.currentJob = null;
      }
      this.setState('RECOVERABLE_ERROR', { error: err.message });
    };
  }

  /**
   * Submits a statistical analysis job (Single-job concurrency enforcement)
   */
  async submitAnalysis(datasetInput) {
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
        resolve: (val) => resolve(val),
        reject: (err) => reject(err),
        startTime: Date.now(),
        cancelled: false,
        interruptRequested: false
      };
      this.currentJob = jobRecord;

      this.sendMessage('RUN_ANALYSIS', datasetInput, jobId)
        .then((result) => {
          if (jobRecord.cancelled) {
            // Discard late result after cancellation
            const cancelErr = new Error(`Operation cancelled: Job ${jobId} was cancelled; late result rejected.`);
            cancelErr.code = 'OPERATION_CANCELLED';
            this.currentJob = null;
            this.setState('READY');
            jobRecord.reject(cancelErr);
            return;
          }
          this.setState('COMPLETED', { jobId, result });
          this.currentJob = null;
          // Return to READY state for next analysis
          this.setState('READY');
          jobRecord.resolve(result);
        })
        .catch((err) => {
          const isCancelled = jobRecord.cancelled;
          this.currentJob = null;
          if (isCancelled) {
            const cancelErr = new Error(`Operation cancelled: Job ${jobId} execution stopped: ${err.message}`);
            cancelErr.code = 'OPERATION_CANCELLED';
            this.setState('READY');
            jobRecord.reject(cancelErr);
          } else {
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
    activeJob.cancelled = true;
    activeJob.interruptRequested = true;
    const interruptRequestedAt = performance.now();
    this.setState('CANCELLING', { jobId: activeJob.id });

    // Post INTERRUPT to worker
    try {
      this.worker.postMessage({ type: 'INTERRUPT', id: `interrupt_${activeJob.id}` });
    } catch (err) {
      console.warn('Failed to post INTERRUPT message, proceeding to hard termination:', err);
    }

    return new Promise((resolve) => {
      let resolved = false;

      const finishCancellation = (status, error = null) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        const cancellationCompletedAt = performance.now();
        const durationMs = cancellationCompletedAt - interruptRequestedAt;

        resolve({
          status,
          jobId: activeJob.id,
          interruptRequested: true,
          cancellationCompleted: true,
          durationMs,
          error: error ? error.message : null
        });
      };

      const timer = setTimeout(() => {
        if (this.state === 'CANCELLING') {
          this.terminateAndRecover('Hard termination fallback after cancellation timeout');
          finishCancellation('HARD_TERMINATED');
        }
      }, this.options.cancelTimeoutMs);

      const origReject = activeJob.reject;
      activeJob.reject = (err) => {
        this.setState('READY');
        origReject(err);
        finishCancellation('GRACEFUL_INTERRUPT', err);
      };

      activeJob.resolve = (_res) => {
        const cancelErr = new Error(`Operation cancelled: Job ${activeJob.id} was cancelled; late result rejected.`);
        cancelErr.code = 'OPERATION_CANCELLED';
        this.setState('READY');
        origReject(cancelErr);
        finishCancellation('GRACEFUL_INTERRUPT', cancelErr);
      };
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

    // Clear all pending message handlers and reject their promises
    for (const handler of this.messageHandlers.values()) {
      try {
        const err = new Error(`Worker terminated (${reason}): pending operation aborted.`);
        err.code = 'WORKER_TERMINATED';
        handler.reject(err);
      } catch {}
    }
    this.messageHandlers.clear();

    if (this.currentJob) {
      const err = new Error(`Job terminated: ${reason}`);
      err.code = 'OPERATION_CANCELLED';
      this.currentJob.reject(err);
      this.currentJob = null;
    }

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
