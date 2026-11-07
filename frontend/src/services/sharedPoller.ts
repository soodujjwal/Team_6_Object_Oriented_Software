/** One in-flight, owner-scoped read for every subscriber. No disk cache. */
export function createSharedPoller<T>(options: {
  fetch: () => Promise<T>; owner: () => string | null; available: () => boolean;
  interval: (value: T) => number;
  listen: (resume: () => void) => () => void;
}) {
  const listeners = new Set<(value: T) => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flight: { owner: string; promise: Promise<T> } | undefined;
  let stopListening: (() => void) | undefined;
  let failures = 0, generation = 0;
  function schedule(delay: number) {
    clearTimeout(timer);
    if (listeners.size) timer = setTimeout(() => { void refresh().catch(() => {}); }, delay);
  }
  function refresh(): Promise<T> {
    const owner = options.owner();
    if (!owner || !options.available()) { schedule(30_000); return Promise.reject(new Error("Bank status will refresh when you're online.")); }
    if (flight?.owner === owner) return flight.promise;
    clearTimeout(timer);
    const current = generation;
    const promise = options.fetch().then(value => {
      if (current === generation && owner === options.owner()) {
        failures = 0;
        for (const listener of listeners) listener(value);
        schedule(options.interval(value));
      }
      return value;
    }, error => {
      if (current === generation && owner === options.owner()) schedule(Math.min(120_000, 30_000 * 2 ** Math.min(++failures, 2)));
      throw error;
    }).finally(() => { if (flight?.promise === promise) flight = undefined; });
    flight = { owner, promise };
    return promise;
  }
  return {
    refresh,
    subscribe(listener: (value: T) => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        stopListening = options.listen(() => schedule(100));
        schedule(0);
      } else schedule(0);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) { generation++; failures = 0; clearTimeout(timer); stopListening?.(); stopListening = undefined; flight = undefined; }
      };
    },
  };
}
