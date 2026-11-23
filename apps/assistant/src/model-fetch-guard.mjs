// Loaded only in the dedicated Harness child, never in the GUI or Runtime.
// Do not follow gateway redirects with model data or credentials.
export function guardedModelFetch(request, origin) {
  return (input, options = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    return request(input, url.origin === origin ? { ...options, redirect: 'error' } : options);
  };
}

if (process.env.OPM_MODEL_FETCH_ORIGIN) {
  globalThis.fetch = guardedModelFetch(globalThis.fetch, process.env.OPM_MODEL_FETCH_ORIGIN);
}
