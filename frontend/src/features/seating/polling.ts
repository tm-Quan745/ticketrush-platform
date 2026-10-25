export function jitterDelay(retryAfterMs = 0, random = Math.random, interval = 2500) {
  return Math.max(interval, retryAfterMs) * (1 + random() * .15);
}
export interface PollEnvironment {
  hidden(): boolean; listen(handler: () => void): () => void;
  set(handler: () => void, ms: number): ReturnType<typeof setTimeout>; clear(timer: ReturnType<typeof setTimeout>): void;
  now(): number;
}
export const browserPolling: PollEnvironment = {
  hidden: () => document.hidden, listen: handler => { document.addEventListener('visibilitychange', handler); return () => document.removeEventListener('visibilitychange', handler); },
  set: (handler, ms) => setTimeout(handler, ms), clear: timer => clearTimeout(timer), now: () => Date.now(),
};
// One request at a time. Hide/unmount invalidates late replies as well as aborting fetch.
export function startPolling(task: (signal: AbortSignal) => Promise<{ retryAfterMs?: number; stop?: boolean } | void>, env: PollEnvironment = browserPolling, interval = 2500, random = Math.random) {
  let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined, due = 0;
  function clear() { if (timer !== undefined) env.clear(timer); timer = undefined; controller?.abort(); }
  function schedule(ms: number) { due = env.now() + ms; if (!stopped && !env.hidden()) timer = env.set(run, ms); }
  async function run() {
    if (stopped || env.hidden()) return;
    controller = new AbortController(); const signal = controller.signal;
    try {
      const result = await task(signal); if (signal.aborted || stopped) return;
      if (result?.stop) { stopped = true; return; }
      schedule(jitterDelay(result?.retryAfterMs, random, interval));
    } catch (error) {
      if (!signal.aborted && !stopped) schedule(jitterDelay((error as { retryAfterMs?: number }).retryAfterMs, random, interval));
    }
  }
  const unsubscribe = env.listen(() => { clear(); if (!stopped && !env.hidden()) schedule(Math.max(0, due - env.now())); });
  if (!env.hidden()) void run();
  return () => { stopped = true; clear(); unsubscribe(); };
}
