self.onmessage = async () => {
  try {
    await fetch('https://egress.invalid/worker-sentinel', {
      method: 'POST',
      body: 'SYNTHETIC_EGRESS_SENTINEL_02B'
    });
    self.postMessage({ status: 'request-completed' });
  } catch {
    self.postMessage({ status: 'request-blocked' });
  }
};
