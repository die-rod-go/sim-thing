import type { Memory } from "@village/shared";
import { describe, expect, it } from "vitest";
import { config } from "../config";
import { applyForgetting, fadeStrength } from "./forgetting";
import { MemoryStore } from "./memory-store";

const MINUTES_PER_TICK = 1;
const TICKS_PER_DAY = 24 * 60;

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

describe("fadeStrength", () => {
  it("halves strength over one half-life", () => {
    expect(fadeStrength(0.8, 12, 12)).toBeCloseTo(0.4);
    expect(fadeStrength(1, 48, 24)).toBeCloseTo(0.25);
  });
});

describe("applyForgetting", () => {
  it("a did memory falls to half strength after a day", () => {
    const store = new MemoryStore();
    store.add(makeMemory({ id: "d1" }));
    applyForgetting(store, TICKS_PER_DAY, MINUTES_PER_TICK);
    expect(store.get("d1")?.strength).toBeCloseTo(0.5);
  });

  it("fades place memories more slowly than seen ones", () => {
    const store = new MemoryStore();
    store.addAll([
      makeMemory({ id: "s1", bucket: "seen" }),
      makeMemory({ id: "p1", bucket: "places" }),
    ]);
    applyForgetting(store, TICKS_PER_DAY, MINUTES_PER_TICK);
    expect(store.get("s1")?.strength).toBeCloseTo(0.25);
    expect(store.get("p1")?.strength).toBeCloseTo(0.5 ** (24 / config.memory.halfLifeHours.places));
  });

  it("deletes memories below 0.05", () => {
    const store = new MemoryStore();
    store.addAll([
      makeMemory({ id: "weak", bucket: "seen", strength: 0.09 }),
      makeMemory({ id: "strong", bucket: "seen", strength: 0.11 }),
    ]);
    const deletedIds = applyForgetting(store, TICKS_PER_DAY / 2, MINUTES_PER_TICK);
    expect(deletedIds).toEqual(["weak"]);
    expect(store.get("weak")).toBeUndefined();
    expect(store.get("strong")?.strength).toBeCloseTo(0.055);
  });

  it("trims a bucket to its cap by removing the weakest", () => {
    const store = new MemoryStore();
    for (let index = 0; index < 62; index += 1) {
      store.add(makeMemory({ id: `s${index}`, bucket: "seen", strength: 0.1 + index * 0.01 }));
    }
    store.add(makeMemory({ id: "bob-weak", agentId: "bob", bucket: "seen", strength: 0.1 }));
    const deletedIds = applyForgetting(store, 0, MINUTES_PER_TICK);
    expect(deletedIds.sort()).toEqual(["s0", "s1"]);
    expect(store.listByAgentAndBucket("mara", "seen")).toHaveLength(60);
    expect(store.get("bob-weak")).toBeDefined();
  });
});
