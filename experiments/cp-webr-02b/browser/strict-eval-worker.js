self.onmessage = () => {
  let evalAllowed = false;
  let errorName = null;
  try {
    evalAllowed = new Function('return 6 * 7')() === 42;
  } catch (error) {
    errorName = error?.name || 'Error';
  }
  self.postMessage({ evalAllowed, errorName });
};
