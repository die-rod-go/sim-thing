/** Real-time scheduling for the sim loop, injectable so tests can drive time by hand. */
export interface Scheduler {
  /** Milliseconds on a monotonic clock. */
  now(): number;
  /** Runs `callback` after `delayMs`; returns a function that cancels it. */
  schedule(callback: () => void, delayMs: number): () => void;
}

/** The only place real time enters the sim; sim logic reads time from the tick count. */
export function createRealScheduler(): Scheduler {
  return {
    now: () => performance.now(),
    schedule: (callback, delayMs) => {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    },
  };
}
