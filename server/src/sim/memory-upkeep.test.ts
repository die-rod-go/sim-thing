import type { Memory } from "@village/shared";
import { describe, expect, it } from "vitest";
import { config } from "../config";
import { enforceBucketCaps } from "./memory-upkeep";
import { buildEmptyItems, buildEmptySeededWorld } from "./test-sim";
import { createWorldState, type WorldState } from "./world-state";

function buildStateWithMemories(memories: Memory[]): WorldState {
  const state = createWorldState(
    { grid: { width: 1, height: 1, isWall: [false] }, places: [], placements: [], startTiles: {} },
    buildEmptySeededWorld(),
    buildEmptyItems(),
  );
  state.memoryStore.addAll(memories);
  return state;
}

function makeMemory(overrides: Partial<Memory> & { id: string }): Memory {
  return {
    agentId: "mara",
    bucket: "did",
    tick: 0,
    text: "I did something",
    tags: [],
    strength: 1,
    lastRecalledTick: null,
    ...overrides,
  };
}

/** Strengths rise with the index and all stay above the delete threshold. */
function makeBucket(agentId: string, count: number): Memory[] {
  const strengthStep = (1 - config.memory.deleteBelowStrength) / (count + 1);
  return [...Array(count).keys()].map((index) =>
    makeMemory({
      id: `${agentId}-${index}`,
      agentId,
      strength: config.memory.deleteBelowStrength + (index + 1) * strengthStep,
    }),
  );
}

describe("enforceBucketCaps", () => {
  it("deletes the weakest memories of a bucket over its cap", () => {
    const overCap = makeBucket("mara", config.memory.bucketCap + 2);
    const state = buildStateWithMemories(overCap);
    enforceBucketCaps(state);
    expect(state.memoryStore.size).toBe(config.memory.bucketCap);
    expect(state.memoryStore.get("mara-0")).toBeUndefined();
    expect(state.memoryStore.get("mara-1")).toBeUndefined();
    expect(state.memoryStore.get(`mara-${config.memory.bucketCap + 1}`)).toBeDefined();
  });

  it("leaves a bucket within its cap untouched", () => {
    const withinCap = makeBucket("tobin", config.memory.bucketCap);
    const state = buildStateWithMemories(withinCap);
    enforceBucketCaps(state);
    expect(state.memoryStore.size).toBe(config.memory.bucketCap);
  });

  it("deletes a memory below the delete threshold even in a bucket within its cap", () => {
    const weakStrength = config.memory.deleteBelowStrength / 2;
    const state = buildStateWithMemories([
      makeMemory({ id: "weak", strength: weakStrength }),
      makeMemory({ id: "strong" }),
    ]);
    enforceBucketCaps(state);
    expect(state.memoryStore.get("weak")).toBeUndefined();
    expect(state.memoryStore.get("strong")).toBeDefined();
  });
});
