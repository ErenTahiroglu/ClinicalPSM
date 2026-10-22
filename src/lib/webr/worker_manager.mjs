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
    this.activeCancellationOutcome = null;
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
        try {
          this.worker.onmessage = null;
          this.worker.onerror = null;
          this.worker.onmessageerror = null;
          this.worker.terminate();
        } catch {}
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
      if (this.worker) {
        try {
          this.worker.onmessage = null;
          this.worker.onerror = null;
          this.worker.onmessageerror = null;
          this.worker.terminate();
        } catch {}
        this.worker = null;
      }
      this.messageHandlers.clear();
      this.setState('RECOVERABLE_ERROR', { error: err.message, phase: 'INITIALIZATION' });
      throw err;
    }
  }

  setupWorkerListeners() {
    const workerInstance = this.worker;

    workerInstance.onmessage = (event) => {
      // Discard messages from stale or previously terminated worker instances
      if (this.worker !== workerInstance) {
        return;
      }
      const data = event.data || {};
      const { id, payload, error, type, targetJobId, code } = data;

      if (id && this.messageHandlers.has(id)) {
        const handler = this.messageHandlers.get(id);
        this.messageHandlers.delete(id);
        if (error) {
          const err = new Error(error);
          if (code) err.code = code;
          if (targetJobId) err.targetJobId = targetJobId;
          handler.reject(err);
        } else {
          handler.resolve(payload);
        }
        return;
      }

      // Handle failure of graceful interrupt request
      if (type === 'INTERRUPT_FAILED') {
        if (
          this.currentJob &&
          this.currentJob.state === 'INTERRUPT_REQUESTED' &&
          targetJobId === this.currentJob.id
        ) {
          const failure = error || `Graceful interrupt failed: ${code || 'INTERRUPT_FAILED'}`;
          this.activeCancellationOutcome = {
            status: 'INTERRUPT_UNSUPPORTED',
            termination: 'HARD_TERMINATED',
            code: code || 'INTERRUPT_FAILED',
            error: failure
          };
          this.currentJob.state = 'INTERRUPT_UNSUPPORTED';
          this.currentJob.error = failure;
          this.terminateAndRecover(`Graceful interrupt unavailable: ${code || failure}`);
          return;
        }
      }

      // Discard unexpected or stale messages with an id
      if (id) {
        if (type !== 'INTERRUPT_ACK') {
          console.warn(`[WorkerLifecycle] Discarding stale or unhandled worker message id=${id}, type=${type}`);
        }
        return;
      }

      // Handle unsolicited global error reports from worker
      if (type === 'ERROR') {
        const err = new Error(error || 'Worker unsolicited error event');
        if (code) err.code = code;
        this.handleWorkerLevelError(err, 'UNSOLICITED_WORKER_ERROR');
        return;
      }
    };

    workerInstance.onerror = (event) => {
      if (this.worker !== workerInstance) return;
      const msg = event?.message || (typeof event === 'string' ? event : 'Worker execution error');
      const err = new Error(`Worker onerror: ${msg}`);
      err.code = 'WORKER_ONERROR';
      this.handleWorkerLevelError(err, 'WORKER_ONERROR');
    };

    workerInstance.onmessageerror = (_event) => {
      if (this.worker !== workerInstance) return;
      const err = new Error('Worker onmessageerror: Message deserialization failure');
      err.code = 'WORKER_ONMESSAGEERROR';
      this.handleWorkerLevelError(err, 'WORKER_ONMESSAGEERROR');
    };
  }

  handleWorkerLevelError(err, source = 'WORKER_ERROR') {
    // 1. Terminate the broken worker instance and detach listeners
    if (this.worker) {
      try {
        this.worker.onmessage = null;
        this.worker.onerror = null;
        this.worker.onmessageerror = null;
        this.worker.terminate();
      } catch (e) {
        console.warn('Error during worker.terminate():', e);
      }
      this.worker = null;
    }

    // 2. Settle current active job if not settled
    if (this.currentJob && !this.currentJob.settled) {
      const activeJob = this.currentJob;
      activeJob.state = 'WORKER_ERROR';
      this.currentJob = null;
      activeJob.reject(err);
    }

    // 3. Reject all pending message handlers and clear map
    for (const [id, handler] of this.messageHandlers.entries()) {
      try {
        const handlerErr = new Error(`Worker fatal failure (${source}): operation aborted for id=${id}. ${err.message}`);
        handlerErr.code = 'WORKER_FATAL_ERROR';
        handler.reject(handlerErr);
      } catch {}
    }
    this.messageHandlers.clear();

    // 4. Clean up any pending cancellation listeners/timers
    if (this.activeCancellationCleanup) {
      try { this.activeCancellationCleanup(); } catch {}
      this.activeCancellationCleanup = null;
    }

    // 5. Transition state to RECOVERABLE_ERROR
    this.setState('RECOVERABLE_ERROR', { error: err.message, source });
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
      throw new Error(`Worker not ready for analysis: current state is ${this.state}. Call initialize() first.`);
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
          jobRecord.error = err?.message || String(err);
          reject(err);
        }
      };
      this.currentJob = jobRecord;

      this.sendMessage(type, payload, jobId)
        .then((result) => {
          if (jobRecord.settled) return;
          if (jobRecord.state === 'INTERRUPT_REQUESTED' || jobRecord.state === 'GRACEFUL_INTERRUPT_CONFIRMED' || jobRecord.state === 'HARD_TERMINATED') {
            // Late success received after cancellation was requested!
            // Computation failed to cease upon interrupt request.
            jobRecord.state = 'HARD_TERMINATED';
            jobRecord.error = 'Late result rejected: computation ignored cancellation request';
            const lateErr = new Error('LATE_RESULT_REJECTED: Computation did not cease upon interrupt');
            lateErr.code = 'LATE_RESULT_REJECTED';
            this.currentJob = null;
            jobRecord.reject(lateErr);
            this.terminateAndRecover('Late result received after cancellation');
            return;
          }
          jobRecord.state = 'COMPLETED';
          this.currentJob = null;
          this.setState('COMPLETED', { jobId, result });
          this.setState('READY');
          jobRecord.resolve(result);
        })
        .catch((err) => {
          if (jobRecord.settled) return;
          if (jobRecord.state === 'INTERRUPT_REQUESTED') {
            // Strict cancellation verification: requires OPERATION_CANCELLED code, NO text-based regex inference
            const isConfirmedCancellation =
              err.code === 'OPERATION_CANCELLED' &&
              (err.targetJobId ? err.targetJobId === jobId : true);

            if (isConfirmedCancellation) {
              // Confirmed graceful cessation from webR.interrupt()
              jobRecord.state = 'GRACEFUL_INTERRUPT_CONFIRMED';
              const cancelErr = new Error(`OPERATION_CANCELLED: Job ${jobId} was interrupted by user request`);
              cancelErr.code = 'OPERATION_CANCELLED';
              this.currentJob = null;
              this.setState('READY');
              jobRecord.reject(cancelErr);
            } else {
              // Unrelated execution error or unverified cancellation! Must NOT be classified as graceful interrupt!
              jobRecord.state = 'WORKER_ERROR';
              jobRecord.error = err.message;
              this.currentJob = null;
              if (this.worker) {
                try {
                  this.worker.onmessage = null;
                  this.worker.onerror = null;
                  this.worker.onmessageerror = null;
                  this.worker.terminate();
                } catch {}
                this.worker = null;
              }
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
    if (this.state === 'INITIALIZING') {
      this.terminateAndRecover('Initialization cancelled by user request');
      return {
        status: 'INITIALIZATION_HARD_TERMINATED',
        termination: 'HARD_TERMINATED',
        interruptRequested: true,
        cancellationCompleted: true,
        durationMs: 0,
        error: 'Initialization cancelled by user request'
      };
    }

    if (this.state !== 'RUNNING' || !this.currentJob) {
      return { status: 'NO_ACTIVE_JOB', interruptRequested: false, cancellationCompleted: false };
    }

    const activeJob = this.currentJob;
    activeJob.state = 'INTERRUPT_REQUESTED';
    this.activeCancellationOutcome = null;
    const interruptRequestedAt = performance.now();
    this.setState('CANCELLING', { jobId: activeJob.id });

    // Post INTERRUPT message correlated to targetJobId
    try {
      this.worker.postMessage({
        type: 'INTERRUPT',
        id: `interrupt_${activeJob.id}`,
        targetJobId: activeJob.id,
        payload: { targetJobId: activeJob.id }
      });
    } catch (err) {
      console.warn('Failed to post INTERRUPT message, proceeding to hard termination:', err);
      this.terminateAndRecover('Failed to post INTERRUPT message');
      return {
        status: 'HARD_TERMINATED',
        jobId: activeJob.id,
        interruptRequested: true,
        cancellationCompleted: true,
        durationMs: performance.now() - interruptRequestedAt,
        error: err.message
      };
    }

    return new Promise((resolve) => {
      let resolved = false;

      const finishCancellation = (status, error = null) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        removeListener();
        this.activeCancellationCleanup = null;
        const durationMs = performance.now() - interruptRequestedAt;

        resolve({
          status: this.activeCancellationOutcome?.status || status,
          termination: this.activeCancellationOutcome?.termination || (status === 'HARD_TERMINATED' ? 'HARD_TERMINATED' : undefined),
          code: this.activeCancellationOutcome?.code || undefined,
          jobId: activeJob.id,
          interruptRequested: true,
          cancellationCompleted: status === 'GRACEFUL_INTERRUPT_CONFIRMED' || status === 'HARD_TERMINATED' || status === 'INTERRUPT_UNSUPPORTED',
          durationMs,
          error: this.activeCancellationOutcome?.error || (error ? (error.message || String(error)) : null)
        });
        this.activeCancellationOutcome = null;
      };

      const timer = setTimeout(() => {
        if (this.state === 'CANCELLING' && !resolved) {
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

      this.activeCancellationCleanup = () => {
        clearTimeout(timer);
        removeListener();
        if (!resolved) {
          resolved = true;
          const status = activeJob.state === 'WORKER_ERROR' ? 'WORKER_ERROR' : 'HARD_TERMINATED';
          resolve({
            status: this.activeCancellationOutcome?.status || status,
            termination: this.activeCancellationOutcome?.termination || (status === 'HARD_TERMINATED' ? 'HARD_TERMINATED' : undefined),
            code: this.activeCancellationOutcome?.code || undefined,
            jobId: activeJob.id,
            interruptRequested: true,
            cancellationCompleted: status === 'GRACEFUL_INTERRUPT_CONFIRMED' || status === 'HARD_TERMINATED' || status === 'INTERRUPT_UNSUPPORTED',
            durationMs: performance.now() - interruptRequestedAt,
            error: this.activeCancellationOutcome?.error || activeJob.error || 'Aborted by lifecycle manager error'
          });
          this.activeCancellationOutcome = null;
        }
      };
    });
  }

  /**
   * Hard worker termination and recovery
   */
  terminateAndRecover(reason = 'Manual termination') {
    if (this.worker) {
      try {
        this.worker.onmessage = null;
        this.worker.onerror = null;
        this.worker.onmessageerror = null;
        this.worker.terminate();
      } catch (err) {
        console.warn('Error during worker.terminate():', err);
      }
      this.worker = null;
    }

    if (this.currentJob && !this.currentJob.settled) {
      const err = new Error(`Job terminated: ${reason}`);
      err.code = 'HARD_TERMINATED';
      const activeJob = this.currentJob;
      this.currentJob = null;
      activeJob.reject(err);
    }

    // Clear all pending message handlers and reject their promises
    for (const [id, handler] of this.messageHandlers.entries()) {
      try {
        const err = new Error(`Worker terminated (${reason}): pending operation aborted for id=${id}.`);
        err.code = 'WORKER_TERMINATED';
        handler.reject(err);
      } catch {}
    }
    this.messageHandlers.clear();

    if (this.activeCancellationCleanup) {
      try { this.activeCancellationCleanup(); } catch {}
      this.activeCancellationCleanup = null;
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
