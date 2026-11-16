import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { SimLoop, type AdvanceTick } from "../../src/sim/loop";
import { ManualScheduler, flushPromises } from "../../src/sim/manual-scheduler";
import { buildEmptyItems, buildEmptySeededWorld } from "../../src/sim/test-sim";
import {
  createEmptyTickResult,
  createWorldState,
  type WorldState,
} from "../../src/sim/world-state";

const INTERVAL_AT_1X_MS = 1000 / config.clock.baseTicksPerSecond;

function buildEmptyState(): WorldState {
  return createWorldState(
    { grid: { width: 1, height: 1, isWall: [false] }, places: [], placements: [], startTiles: {} },
    buildEmptySeededWorld(),
    buildEmptyItems(),
  );
}

function countingAdvance(): { advanceTick: AdvanceTick; ticksSeen: number[] } {
  const ticksSeen: number[] = [];
  return {
    ticksSeen,
    advanceTick: (state) => {
      ticksSeen.push(state.tick);
      return Promise.resolve(createEmptyTickResult(state.tick));
    },
  };
}

function buildLoop(advanceTick: AdvanceTick, isPaused = false) {
  const scheduler = new ManualScheduler();
  const loop = new SimLoop({ state: buildEmptyState(), advanceTick, scheduler, isPaused });
  return { loop, scheduler };
}

describe("SimLoop", () => {
  it("runs ticks at the base rate at 1x and faster at higher speeds", async () => {
    const counter = countingAdvance();
    const { loop, scheduler } = buildLoop(counter.advanceTick);
    loop.start();
    await scheduler.advance(INTERVAL_AT_1X_MS * 3);
    expect(counter.ticksSeen).toEqual([0, 1, 2, 3]);

    loop.setSpeed(4);
    await scheduler.advance(INTERVAL_AT_1X_MS);
    expect(counter.ticksSeen.length).toBe(8);
    expect(loop.getState().tick).toBe(8);
  });

  it("stops ticking while paused and resumes on resume", async () => {
    const counter = countingAdvance();
    const { loop, scheduler } = buildLoop(counter.advanceTick);
    const pauseChanges: boolean[] = [];
    loop.addPauseListener((isPaused) => pauseChanges.push(isPaused));
    loop.start();
    await scheduler.advance(0);
    loop.pause();
    await scheduler.advance(INTERVAL_AT_1X_MS * 5);
    expect(counter.ticksSeen).toEqual([0]);
    expect(loop.getClock()).toEqual({ tick: 1, isPaused: true, speed: 1 });

    loop.resume();
    await scheduler.advance(0);
    expect(counter.ticksSeen).toEqual([0, 1]);
    expect(pauseChanges).toEqual([true, false]);
  });

  it("steps exactly one tick while paused and refuses to step while running", async () => {
    const counter = countingAdvance();
    const { loop, scheduler } = buildLoop(counter.advanceTick, true);
    loop.start();
    expect(await loop.step()).toBe(true);
    expect(await loop.step()).toBe(true);
    expect(counter.ticksSeen).toEqual([0, 1]);
    expect(scheduler.pendingCount()).toBe(0);

    loop.resume();
    expect(await loop.step()).toBe(false);
  });

  it("never overlaps ticks and waits for a slow tick before the next", async () => {
    let releaseTick: () => void = () => undefined;
    let runningCount = 0;
    let maxRunning = 0;
    const advanceTick: AdvanceTick = (state) => {
      runningCount += 1;
      maxRunning = Math.max(maxRunning, runningCount);
      return new Promise((resolveTick) => {
        releaseTick = () => {
          runningCount -= 1;
          resolveTick(createEmptyTickResult(state.tick));
        };
      });
    };
    const { loop, scheduler } = buildLoop(advanceTick);
    loop.start();
    await scheduler.advance(INTERVAL_AT_1X_MS * 10);
    expect(loop.isTickRunning()).toBe(true);
    expect(loop.getState().tick).toBe(0);

    releaseTick();
    await flushPromises();
    expect(loop.getState().tick).toBe(1);
    await scheduler.advance(0);
    expect(loop.isTickRunning()).toBe(true);
    expect(maxRunning).toBe(1);
  });

  it("holds ticks while a between-ticks task runs, e.g. a reset", async () => {
    const counter = countingAdvance();
    const { loop, scheduler } = buildLoop(counter.advanceTick);
    loop.start();
    await scheduler.advance(0);
    const replacement = buildEmptyState();
    replacement.tick = 100;
    await loop.runBetweenTicks(() => loop.replaceState(replacement));
    await scheduler.advance(0);
    expect(counter.ticksSeen).toEqual([0, 100]);
  });

  it("answers without editing when the sim resumes before the tick an edit waited on ends", async () => {
    let releaseTick: () => void = () => undefined;
    const advanceTick: AdvanceTick = (state) =>
      new Promise((resolveTick) => {
        releaseTick = () => resolveTick(createEmptyTickResult(state.tick));
      });
    const { loop, scheduler } = buildLoop(advanceTick);
    loop.start();
    await scheduler.advance(0);
    loop.pause();
    let isEdited = false;
    const answer = loop.editWhilePaused(() => {
      isEdited = true;
      return { result: createEmptyTickResult(0), answer: "edited" };
    }, "resumed");
    loop.resume();
    releaseTick();
    expect(await answer).toBe("resumed");
    expect(isEdited).toBe(false);
  });

  it("pauses with a reason when a tick fails", async () => {
    const { loop, scheduler } = buildLoop(() => Promise.reject(new Error("llm exploded")));
    const reasons: (string | null)[] = [];
    loop.addPauseListener((_isPaused, reason) => reasons.push(reason));
    loop.start();
    await scheduler.advance(0);
    expect(loop.isPaused()).toBe(true);
    expect(reasons[0]).toContain("llm exploded");
  });

  it("tells tick listeners about each finished tick after the clock advances", async () => {
    const counter = countingAdvance();
    const { loop } = buildLoop(counter.advanceTick, true);
    const seen: { resultTick: number; stateTick: number }[] = [];
    loop.addTickListener((result, state) =>
      seen.push({ resultTick: result.tick, stateTick: state.tick }),
    );
    loop.start();
    await loop.step();
    expect(seen).toEqual([{ resultTick: 0, stateTick: 1 }]);
  });
});
