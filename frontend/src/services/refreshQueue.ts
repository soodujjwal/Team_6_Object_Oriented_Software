/** Coalesce event bursts; changes received during a read get one follow-up. */
export function createRefreshQueue(task: () => Promise<void>, delayMs = 30) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false, dirty = false, disposed = false;
  const request = () => {
    if (disposed) return;
    if (running) { dirty = true; return; }
    if (timer !== undefined) return;
    timer = setTimeout(async () => {
      timer = undefined;
      if (disposed) return;
      running = true;
      try { await task(); }
      catch { /* The caller presents its own request errors. */ }
      finally { running = false; if (dirty && !disposed) { dirty = false; request(); } }
    }, delayMs);
  };
  return { request, dispose: () => { disposed = true; clearTimeout(timer); } };
}
