import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Request state for one API call.
 *
 * The request is aborted when the component unmounts or the dependencies change, so a
 * heavy page (a stock page fires six requests) cannot keep working after the user has
 * already navigated away. Pass the signal on to the api helper to make the request
 * itself cancellable, otherwise the extra argument is simply ignored:
 *
 *   useApi(() => api.stock(symbol), [symbol])                  // state only
 *   useApi((signal) => api.stock(symbol, { signal }), [symbol]) // cancellable request
 */
export function useApi(fn, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const { signal } = controller;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef
      .current(signal)
      .then((data) => !signal.aborted && setState({ data, error: null, loading: false }))
      .catch((error) => !signal.aborted && setState({ data: null, error, loading: false }));
    return () => controller.abort();
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
