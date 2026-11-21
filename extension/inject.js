if (!globalThis.__jobpilotPromise) {
  globalThis.__jobpilotPromise = import(chrome.runtime.getURL("content.js"))
    .then(() => {
      globalThis.__jobpilotReady = true;
    })
    .catch((error) => {
      globalThis.__jobpilotError = String(error && error.message ? error.message : error);
      throw error;
    });
}
