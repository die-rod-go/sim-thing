import { config } from "../config";

/** A semaphore: at most `maxConcurrent` tasks run at once; the rest wait in arrival order. */
export class ConcurrencyLimiter {
  private runningCount = 0;
  private readonly waitingStarts: (() => void)[] = [];

  constructor(private readonly maxConcurrent: number = config.llm.concurrency) {
    if (maxConcurrent < 1) throw new Error(`Concurrency must be at least 1, got ${maxConcurrent}`);
  }

  get inFlightCount(): number {
    return this.runningCount;
  }

  get queuedCount(): number {
    return this.waitingStarts.length;
  }

  async run<Result>(task: () => Promise<Result>): Promise<Result> {
    await this.acquireSlot();
    try {
      return await task();
    } finally {
      this.releaseSlot();
    }
  }

  private acquireSlot(): Promise<void> {
    if (this.runningCount < this.maxConcurrent) {
      this.runningCount += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waitingStarts.push(resolve));
  }

  private releaseSlot(): void {
    const nextStart = this.waitingStarts.shift();
    // The slot passes straight to the next waiter, so runningCount stays the same.
    if (nextStart) nextStart();
    else this.runningCount -= 1;
  }
}
