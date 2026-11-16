import type { ClockState } from "@village/shared";
import { config } from "../config";
import { createLogger } from "../logger";
import type { Scheduler } from "./scheduler";
import type { TickResult, WorldState } from "./world-state";

/**
 * Simulates one tick on the state it is given and reports what happened. It may take as long as
 * it needs (e.g. waiting on LLM decisions); the clock does not advance until it resolves.
 */
export type AdvanceTick = (state: WorldState) => Promise<TickResult>;

export type TickListener = (result: TickResult, state: WorldState) => void;
export type PauseListener = (isPaused: boolean, reason: string | null) => void;

export interface SimLoopOptions {
  state: WorldState;
  advanceTick: AdvanceTick;
  scheduler: Scheduler;
  speed?: number;
  isPaused?: boolean;
}

const MILLISECONDS_PER_SECOND = 1000;
const logger = createLogger("loop");

/**
 * Runs ticks at `baseTicksPerSecond * speed` at most, awaiting each tick before the next so ticks
 * never overlap. A slow tick delays the clock instead of being skipped.
 */
export class SimLoop {
  private state: WorldState;
  private readonly advanceTick: AdvanceTick;
  private readonly scheduler: Scheduler;
  private speed: number;
  private isPausedFlag: boolean;
  private isStarted = false;
  private isStopped = false;
  private holdCount = 0;
  private cancelScheduledTick: (() => void) | null = null;
  private runningTick: Promise<void> | null = null;
  private exclusiveChain: Promise<unknown> = Promise.resolve();
  private readonly tickListeners = new Set<TickListener>();
  private readonly pauseListeners = new Set<PauseListener>();

  constructor(options: SimLoopOptions) {
    this.state = options.state;
    this.advanceTick = options.advanceTick;
    this.scheduler = options.scheduler;
    this.speed = options.speed ?? 1;
    this.isPausedFlag = options.isPaused ?? false;
  }

  getState(): WorldState {
    return this.state;
  }

  getClock(): ClockState {
    return { tick: this.state.tick, isPaused: this.isPausedFlag, speed: this.speed };
  }

  getSpeed(): number {
    return this.speed;
  }

  isPaused(): boolean {
    return this.isPausedFlag;
  }

  isTickRunning(): boolean {
    return this.runningTick !== null;
  }

  addTickListener(listener: TickListener): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  addPauseListener(listener: PauseListener): () => void {
    this.pauseListeners.add(listener);
    return () => this.pauseListeners.delete(listener);
  }

  start(): void {
    this.isStarted = true;
    if (!this.isPausedFlag) this.scheduleNextTick(0);
  }

  pause(reason: string | null = null): void {
    if (this.isPausedFlag) return;
    this.isPausedFlag = true;
    this.cancelPendingTick();
    this.notifyPauseChanged(reason);
  }

  resume(): void {
    if (!this.isPausedFlag) return;
    this.isPausedFlag = false;
    this.notifyPauseChanged(null);
    if (this.canScheduleTicks()) this.scheduleNextTick(0);
  }

  /** Runs exactly one tick while paused. Returns false if not paused or a tick is already running. */
  async step(): Promise<boolean> {
    if (!this.isPausedFlag || this.runningTick !== null || this.holdCount > 0 || this.isStopped) {
      return false;
    }
    await this.launchTick();
    return true;
  }

  setSpeed(speed: number): void {
    if (!(speed > 0)) throw new Error(`Speed must be positive, got ${speed}`);
    this.speed = speed;
    if (this.cancelScheduledTick !== null) this.scheduleNextTick(this.tickIntervalMs());
  }

  /**
   * Runs `task` with no tick in flight and none starting until it finishes: the safe moment to
   * replace or save the world.
   */
  runBetweenTicks<Result>(task: () => Result | Promise<Result>): Promise<Result> {
    const run = async (): Promise<Result> => {
      this.holdCount += 1;
      this.cancelPendingTick();
      try {
        if (this.runningTick) await this.runningTick;
        return await task();
      } finally {
        this.holdCount -= 1;
        if (this.canScheduleTicks()) this.scheduleNextTick(0);
      }
    };
    const result = this.exclusiveChain.then(run, run);
    this.exclusiveChain = result.catch(() => undefined);
    return result;
  }

  /**
   * Changes the paused world by hand without advancing the clock. What the edit produced reaches
   * the tick listeners like a tick's result, so it is logged and broadcast the same way. Resolves
   * to the edit's own answer, or to `answerIfRunning` without editing when the sim was resumed
   * before the tick it waited on finished.
   */
  editWhilePaused<Answer>(
    edit: (state: WorldState) => { result: TickResult; answer: Answer },
    answerIfRunning: Answer,
  ): Promise<Answer> {
    return this.runBetweenTicks(() => {
      if (!this.isPausedFlag) return answerIfRunning;
      const { result, answer } = edit(this.state);
      for (const listener of this.tickListeners) listener(result, this.state);
      return answer;
    });
  }

  /** Replaces the world, e.g. after a reset. Call inside `runBetweenTicks`. */
  replaceState(state: WorldState): void {
    if (this.runningTick !== null) throw new Error("Cannot replace the world while a tick runs");
    this.state = state;
  }

  async stop(): Promise<void> {
    this.isStopped = true;
    this.cancelPendingTick();
    if (this.runningTick) await this.runningTick;
  }

  private tickIntervalMs(): number {
    return MILLISECONDS_PER_SECOND / (config.clock.baseTicksPerSecond * this.speed);
  }

  private canScheduleTicks(): boolean {
    return this.isStarted && !this.isStopped && !this.isPausedFlag && this.holdCount === 0;
  }

  private cancelPendingTick(): void {
    this.cancelScheduledTick?.();
    this.cancelScheduledTick = null;
  }

  private scheduleNextTick(delayMs: number): void {
    this.cancelPendingTick();
    this.cancelScheduledTick = this.scheduler.schedule(() => this.onScheduledTick(), delayMs);
  }

  private onScheduledTick(): void {
    this.cancelScheduledTick = null;
    if (!this.canScheduleTicks()) return;
    const startedAt = this.scheduler.now();
    void this.launchTick().then(() => {
      if (!this.canScheduleTicks()) return;
      const elapsedMs = this.scheduler.now() - startedAt;
      this.scheduleNextTick(Math.max(0, this.tickIntervalMs() - elapsedMs));
    });
  }

  private launchTick(): Promise<void> {
    if (this.runningTick) return this.runningTick;
    const tickPromise = this.runTick()
      .catch((error: unknown) => {
        logger.error(`tick ${this.state.tick} failed; pausing`, error);
        const message = error instanceof Error ? error.message : String(error);
        this.pause(`Tick ${this.state.tick} failed: ${message}`);
      })
      .finally(() => {
        this.runningTick = null;
      });
    this.runningTick = tickPromise;
    return tickPromise;
  }

  private async runTick(): Promise<void> {
    const state = this.state;
    const result = await this.advanceTick(state);
    state.tick += 1;
    logger.debug(`tick ${result.tick} done`, {
      moves: result.moves.length,
      events: result.events.length,
    });
    for (const listener of this.tickListeners) listener(result, state);
  }

  private notifyPauseChanged(reason: string | null): void {
    for (const listener of this.pauseListeners) listener(this.isPausedFlag, reason);
  }
}
