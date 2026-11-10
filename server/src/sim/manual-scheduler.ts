import type { Scheduler } from "./scheduler";

interface PendingTimer {
  id: number;
  dueAt: number;
  callback: () => void;
}

/** A scheduler whose clock only moves when told to, for deterministic loop tests. */
export class ManualScheduler implements Scheduler {
  private currentTime = 0;
  private nextTimerId = 1;
  private timers: PendingTimer[] = [];

  now(): number {
    return this.currentTime;
  }

  schedule(callback: () => void, delayMs: number): () => void {
    const timer = { id: this.nextTimerId++, dueAt: this.currentTime + delayMs, callback };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((candidate) => candidate.id !== timer.id);
    };
  }

  pendingCount(): number {
    return this.timers.length;
  }

  /** Moves the clock forward, firing due timers in order and letting their promises settle. */
  async advance(milliseconds: number): Promise<void> {
    const targetTime = this.currentTime + milliseconds;
    for (;;) {
      await flushPromises();
      const due = this.timers
        .filter((timer) => timer.dueAt <= targetTime)
        .sort((first, second) => first.dueAt - second.dueAt || first.id - second.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((timer) => timer.id !== due.id);
      this.currentTime = Math.max(this.currentTime, due.dueAt);
      due.callback();
    }
    this.currentTime = targetTime;
    await flushPromises();
  }
}

const SETTLE_ROUNDS = 10;

export async function flushPromises(): Promise<void> {
  for (let round = 0; round < SETTLE_ROUNDS; round++) await Promise.resolve();
}
