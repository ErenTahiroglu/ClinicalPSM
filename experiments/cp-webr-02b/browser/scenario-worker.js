let webR = null;
let selectedChannelType = 'PostMessage';
let activeJobId = null;
let activeInterruptJobId = null;
let activeMode = null;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

self.onmessage = async event => {
  const { type, id, payload = {}, targetJobId } = event.data || {};
  try {
    if (type === 'INIT') {
      const params = new URL(self.location.href).searchParams;
      if (params.has('delayinit')) {
        await delay(500);
        self.postMessage({ type: 'INIT_COMPLETE', id, payload: { channelType: 'SharedArrayBuffer' } });
        return;
      }
      if (params.has('unsupported')) {
        selectedChannelType = 'PostMessage';
        self.postMessage({ type: 'INIT_COMPLETE', id, payload: { channelType: selectedChannelType } });
        return;
      }
      const mod = await import('/assets/webr/webr.js');
      const sharedReady = self.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';
      const channelType = sharedReady ? mod.ChannelType.SharedArrayBuffer : mod.ChannelType.PostMessage;
      selectedChannelType = sharedReady ? 'SharedArrayBuffer' : 'PostMessage';
      webR = new mod.WebR({ baseUrl: '/assets/webr/', repoUrl: '/assets/repo', channelType });
      await webR.init();
      self.postMessage({ type: 'INIT_COMPLETE', id, payload: {
        channelType: selectedChannelType,
        crossOriginIsolated: self.crossOriginIsolated === true,
        sharedArrayBufferAvailable: typeof SharedArrayBuffer !== 'undefined'
      } });
      return;
    }

    if (type === 'INTERRUPT') {
      const jobId = targetJobId || payload.targetJobId;
      if (selectedChannelType !== 'SharedArrayBuffer' || !webR) {
        self.postMessage({ type: 'INTERRUPT_FAILED', id, targetJobId: jobId, code: 'INTERRUPT_UNSUPPORTED_IN_POSTMESSAGE_MODE', error: 'Graceful interruption is unsupported in this channel.' });
        return;
      }
      if (jobId !== activeJobId) {
        self.postMessage({ type: 'INTERRUPT_FAILED', id, targetJobId: jobId, code: 'NO_ACTIVE_MATCHING_JOB', error: 'No matching job is active.' });
        return;
      }
      activeInterruptJobId = jobId;
      try { webR.interrupt(); }
      catch (error) {
        self.postMessage({ type: 'INTERRUPT_FAILED', id, targetJobId: jobId, code: 'INTERRUPT_REQUEST_FAILED', error: error.message });
        return;
      }
      self.postMessage({ type: 'INTERRUPT_ACK', id, targetJobId: jobId, payload: { status: 'INTERRUPT_REQUESTED' } });
      return;
    }

    if (type !== 'RUN_SCENARIO') return;
    activeJobId = id;
    activeMode = payload.mode;

    if (activeMode === 'ONERROR') {
      setTimeout(() => { throw new Error('synthetic browser worker onerror positive control'); }, 0);
      return;
    }
    if (activeMode === 'MESSAGEERROR') return;
    if (activeMode === 'BLOCKING_JS') {
      const started = performance.now();
      while (performance.now() - started < 800) { /* isolated hard-termination control */ }
      self.postMessage({ type: 'ANALYSIS_COMPLETE', id, payload: { mode: activeMode } });
      return;
    }
    if (activeMode === 'LATE_SUCCESS') {
      await delay(150);
      self.postMessage({ type: 'ANALYSIS_COMPLETE', id, payload: { mode: activeMode } });
      return;
    }
    if (activeMode === 'SUCCESS') {
      self.postMessage({ type: 'ANALYSIS_COMPLETE', id, payload: { mode: activeMode } });
      return;
    }
    if (activeMode === 'POST_EGRESS') {
      try {
        await fetch('https://egress.invalid/worker-sentinel', { method: 'POST', body: 'SYNTHETIC_EGRESS_SENTINEL_02B' });
      } catch {}
      self.postMessage({ type: 'ANALYSIS_COMPLETE', id, payload: { mode: activeMode } });
      return;
    }

    try {
      if (activeMode === 'SLOW_R') {
        await webR.evalR('local({ x <- 0; for (i in 1:15000000) x <- x + sin(i) * cos(i); x })');
      } else {
        await webR.evalR('stop("R runtime says execution interrupted as test text, but no R interrupt occurred")');
      }
      if (activeInterruptJobId === id) {
        self.postMessage({ type: 'ERROR', id, targetJobId: id, code: 'LATE_RESULT_REJECTED', error: 'R evaluation returned after interrupt request' });
      } else {
        self.postMessage({ type: 'ANALYSIS_COMPLETE', id, payload: { mode: activeMode } });
      }
    } catch (error) {
      if (activeMode === 'RUNTIME_ERROR_DURING_INTERRUPT') {
        await delay(120);
      }
      const nativeInterrupt = error?.name === 'UnwindProtectException' || error?.code === 'OPERATION_CANCELLED';
      if (nativeInterrupt && activeInterruptJobId === id && activeJobId === id) {
        self.postMessage({ type: 'ERROR', id, targetJobId: id, code: 'OPERATION_CANCELLED', error: 'WebR evaluation unwound after request for this job' });
      } else {
        self.postMessage({ type: 'ERROR', id, targetJobId: id, code: 'R_RUNTIME_ERROR', error: error?.message || String(error) });
      }
    } finally {
      if (activeJobId === id) activeJobId = null;
      if (activeInterruptJobId === id) activeInterruptJobId = null;
    }
  } catch (error) {
    self.postMessage({ type: 'ERROR', id, targetJobId: targetJobId || id, code: error?.code || 'WORKER_ERROR', error: error?.message || String(error) });
  }
};
