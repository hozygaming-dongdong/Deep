/* Module worker for the tuner (dev-only). Runs the REAL simSummary off the main
   thread so the UI never freezes, and posts a progress message per step — the
   sim is synchronous, but because it runs on a separate thread its postMessage
   calls reach the main thread live, giving a real progress bar for free. */
import { simSummary } from './tuning.js';

self.onmessage = (e) => {
  const { cfg, opts } = e.data || {};
  try {
    const result = simSummary(cfg, {
      ...opts,
      onProgress: (frac) => self.postMessage({ type: 'progress', frac }),
    });
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
