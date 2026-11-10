import type { Memory } from "@village/shared";
import { describe, expect, it } from "vitest";
import { MemoryIdGenerator, MemoryStore } from "./memory-store";
import { extractTags } from "./tags";
import { pushWorkingMemory } from "./working-memory";

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

describe("MemoryStore", () => {
  it("lists memories by agent and by agent and bucket", () => {
    const store = new MemoryStore();
    store.addAll([
      makeMemory({ id: "m1" }),
      makeMemory({ id: "m2", bucket: "seen" }),
      makeMemory({ id: "b1", agentId: "bob" }),
    ]);
    expect(store.listByAgent("mara").map((memory) => memory.id)).toEqual(["m1", "m2"]);
    expect(store.listByAgentAndBucket("mara", "seen").map((memory) => memory.id)).toEqual(["m2"]);
    expect(store.all()).toHaveLength(3);
  });

  it("removes and replaces memories", () => {
    const store = new MemoryStore();
    store.add(makeMemory({ id: "m1" }));
    expect(store.remove("m1")).toBe(true);
    expect(store.size).toBe(0);
    store.replaceAll([makeMemory({ id: "m2" }), makeMemory({ id: "m3" })]);
    expect(store.all().map((memory) => memory.id)).toEqual(["m2", "m3"]);
  });

  it("rejects a duplicate id", () => {
    const store = new MemoryStore();
    store.add(makeMemory({ id: "m1" }));
    expect(() => store.add(makeMemory({ id: "m1" }))).toThrow();
  });
});

describe("MemoryIdGenerator", () => {
  it("builds ids from agent, tick and a growing counter", () => {
    const generator = new MemoryIdGenerator();
    expect(generator.nextId("mara", 5)).toBe("mara-5-0");
    expect(generator.nextId("mara", 5)).toBe("mara-5-1");
    expect(generator.getState()).toBe(2);
  });
});

describe("extractTags", () => {
  const knownNames = ["Mara", "Bob", "bakery", "brew kettle"];

  it("finds known names case-insensitively as whole words, lowercased", () => {
    expect(extractTags("Did MARA leave the Bakery? Mara's late", knownNames)).toEqual([
      "mara",
      "bakery",
    ]);
  });

  it("ignores names inside other words", () => {
    expect(extractTags("Bobby went to the bakeryard", knownNames)).toEqual([]);
  });

  it("matches multi-word names", () => {
    expect(extractTags("the brew kettle is hot", knownNames)).toEqual(["brew kettle"]);
  });
});

describe("pushWorkingMemory", () => {
  it("keeps only the last 8 entries", () => {
    const entries = Array.from({ length: 8 }, (_, index) => `entry ${index}`);
    const updated = pushWorkingMemory(entries, "newest");
    expect(updated).toHaveLength(8);
    expect(updated[0]).toBe("entry 1");
    expect(updated[7]).toBe("newest");
  });
});
