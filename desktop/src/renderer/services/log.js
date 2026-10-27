// Central place for non-fatal errors. Previously most of these were swallowed
// by empty `catch {}` blocks, which made production issues invisible.

const isTest = typeof process !== 'undefined' && process.env?.VITEST;

export function logWarn(scope, err) {
  if (isTest) return;
  console.warn(`[concord] ${scope}:`, err?.code || '', err?.message || err);
}

export function logError(scope, err) {
  if (isTest) return;
  console.error(`[concord] ${scope}:`, err);
}

/** Wraps a promise so a failure is logged instead of becoming an unhandled rejection. */
export function quietly(scope, promise) {
  return Promise.resolve(promise).catch((err) => {
    logWarn(scope, err);
    return null;
  });
}
