/**
 * Run work the reader is not waiting for once the main thread is free.
 *
 * Measured 27 Sept: every page load rewrote the whole offline cache (ten
 * IndexedDB tables, the 396-row auction archive among them) and re-evaluated
 * every alert inside the same window as hydration and first paint. Neither is
 * needed until a LATER visit or an offline one, so both wait for idle.
 * `timeout` keeps it from waiting forever on a page that is never idle.
 */
export function whenIdle(fn: () => void, timeout = 4000): void {
  if (typeof window === 'undefined') return;
  const ric = (window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (ric) ric(fn, { timeout });
  else setTimeout(fn, 1500);
}
