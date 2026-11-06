// Writes run strictly one after another, so an older save can never land
// after a newer one. `drain()` resolves once everything queued is on disk.

let tail: Promise<unknown> = Promise.resolve();

export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}

function drain(): Promise<void> {
  return tail.then(() => undefined);
}

// Pending debounced writers register a flush here (see PageEditor).
const flushers = new Set<() => void>();

export function registerFlush(fn: () => void): () => void {
  flushers.add(fn);
  return () => flushers.delete(fn);
}

/** Pushes every debounced edit into the queue, then waits for the queue. */
export async function flushAll(): Promise<void> {
  flushers.forEach((fn) => fn());
  await drain();
}
