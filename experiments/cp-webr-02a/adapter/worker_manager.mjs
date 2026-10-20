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
      const { type, id, payload, error } = event.data || {};
      if (id && this.messageHandlers.has(id)) {
        const handler = this.messageHandlers.get(id);
        this.messageHandlers.delete(id);
        if (error) {
          handler.reject(new Error(error));
        } else {
          handler.resolve(payload);
        }
      }
    };

    this.worker.onerror = (err) => {
      console.error('Worker error caught in lifecycle manager:', err);
      if (this.currentJob) {
        this.currentJob.reject(new Error(`Worker execution error: ${err.message || 'Unknown error'}`));
        this.currentJob = null;
      }
      this.setState('RECOVERABLE_ERROR', { error: err.message });
    };
  }

  /**
   * Submits a statistical analysis job (Single-job concurrency enforcement)
   */
  async submitAnalysis(datasetInput) {
    if (this.state !== 'READY' && this.state !== 'COMPLETED') {
      if (this.state === 'RUNNING') {
        const err = new Error(`Concurrency violation: Worker is currently RUNNING job ${this.currentJob?.id}. Concurrent tasks prohibited.`);
        err.code = 'CONCURRENCY_ERROR';
        throw err;
      }
      throw new Error(`Worker not ready for analysis: current state is ${this.state}`);
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.setState('RUNNING', { jobId });

    return new Promise((resolve, reject) => {
      this.currentJob = { id: jobId, resolve, reject, startTime: Date.now() };

      this.sendMessage('RUN_ANALYSIS', datasetInput, jobId)
        .then((result) => {
          this.setState('COMPLETED', { jobId, result });
          this.currentJob = null;
          // Return to READY state for next analysis
          this.setState('READY');
          resolve(result);
        })
        .catch((err) => {
          this.setState('RECOVERABLE_ERROR', { jobId, error: err.message });
          this.currentJob = null;
          reject(err);
        });
    });
  }

  /**
   * Graceful interruption with hard-termination fallback
   */
  async cancelCurrentJob() {
    if (this.state !== 'RUNNING' || !this.currentJob) {
      return { status: 'NO_ACTIVE_JOB' };
    }

    const activeJob = this.currentJob;
    this.setState('CANCELLING', { jobId: activeJob.id });

    // Try graceful interrupt
    let interruptedGracefully = false;
    try {
      this.worker.postMessage({ type: 'INTERRUPT', id: 'interrupt_req' });
    } catch (err) {
      console.warn('Failed to post INTERRUPT message, proceeding to hard termination:', err);
    }

    // Await cessation or fallback to hard termination after timeout
    const cancelPromise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.state === 'CANCELLING') {
          // Hard terminate
          this.terminateAndRecover('Hard termination after cancellation timeout');
          resolve({ status: 'HARD_TERMINATED' });
        }
      }, this.options.cancelTimeoutMs);

      // If currentJob rejects due to interruption
      const origReject = activeJob.reject;
      activeJob.reject = (err) => {
        clearTimeout(timer);
        interruptedGracefully = true;
        this.setState('READY');
        origReject(err);
        resolve({ status: 'GRACEFUL_INTERRUPT' });
      };
    });

    return cancelPromise;
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
