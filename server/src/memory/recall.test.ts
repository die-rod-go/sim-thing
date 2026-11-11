import type { Memory } from "@village/shared";
import { describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store";
import { buildCue, recallForDecision, scoreMemory, searchMemories } from "./recall";

const TICKS_PER_HOUR = 60;

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

const knownNames = ["Mara", "Bob", "Clara", "bakery", "tavern", "oven"];

describe("buildCue", () => {
  it("intention names pull matching memories into the cue", () => {
    const cue = buildCue({
      place: "village road",
      aroundAgentNames: ["Clara"],
      nearbyEntityNames: ["bench"],
      actionTarget: null,
      conversationText: "Clara: lovely morning",
      intention: "buy bread from Mara at the bakery",
      knownNames,
    });
    expect(cue).toEqual(
      expect.arrayContaining(["village road", "clara", "bench", "mara", "bakery"]),
    );
    expect(cue).not.toContain("bob");
    expect(new Set(cue).size).toBe(cue.length);
  });

  it("adds names mentioned in the current conversation and the action target", () => {
    const cue = buildCue({
      place: "bakery",
      aroundAgentNames: [],
      nearbyEntityNames: [],
      actionTarget: "oven",
      conversationText: "Bob: is the tavern open?",
      intention: "",
      knownNames,
    });
    expect(cue).toEqual(expect.arrayContaining(["bakery", "oven", "bob", "tavern"]));
  });
});

describe("scoreMemory", () => {
  it("scores tag overlap, recency and strength per the brief", () => {
    const memory = makeMemory({ id: "m1", tags: ["mara", "bakery"], strength: 0.8, tick: 0 });
    const sixHoursLater = 6 * TICKS_PER_HOUR;
    const score = scoreMemory(memory, ["mara", "oven"], sixHoursLater);
    expect(score).toBeCloseTo(1.0 * (1 / 2) + 0.5 * 0.5 + 0.5 * 0.8);
  });

  it("ignores the similarity hook while its weight is zero", () => {
    const memory = makeMemory({ id: "m1", tags: ["mara"] });
    expect(scoreMemory(memory, ["mara"], 0, () => 1)).toBeCloseTo(scoreMemory(memory, ["mara"], 0));
  });
});

describe("recallForDecision", () => {
  it("takes the top memories per bucket", () => {
    const store = new MemoryStore();
    for (let index = 0; index < 5; index += 1) {
      store.add(makeMemory({ id: `p${index}`, bucket: "places", tags: [`place${index}`] }));
    }
    store.add(makeMemory({ id: "other-agent", agentId: "bob", bucket: "places", tags: ["mara"] }));
    const recalled = recallForDecision(store, "mara", ["place3"], 0);
    expect(recalled.places).toHaveLength(2);
    expect(recalled.places[0]?.id).toBe("p3");
    expect(recalled.seen).toEqual([]);
  });

  it("association pass pulls in memories linked by tags of top results", () => {
    const store = new MemoryStore();
    store.addAll([
      makeMemory({ id: "d1", bucket: "did", tags: ["mara", "cellar"] }),
      makeMemory({ id: "p1", bucket: "places", tags: ["mara"] }),
      makeMemory({ id: "p2", bucket: "places", tags: ["mara"] }),
      makeMemory({ id: "p3", bucket: "places", tags: ["cellar"] }),
      makeMemory({ id: "p4", bucket: "places", tags: ["well"] }),
    ]);
    const recalled = recallForDecision(store, "mara", ["mara"], 0);
    expect(recalled.places.map((memory) => memory.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("bumps a recalled memory at most once per sim-hour", () => {
    const store = new MemoryStore();
    store.add(makeMemory({ id: "d1", tags: ["mara"], strength: 0.5 }));
    recallForDecision(store, "mara", ["mara"], 1000);
    expect(store.get("d1")?.strength).toBeCloseTo(0.7);
    expect(store.get("d1")?.lastRecalledTick).toBe(1000);
    recallForDecision(store, "mara", ["mara"], 1000 + TICKS_PER_HOUR / 2);
    expect(store.get("d1")?.strength).toBeCloseTo(0.7);
    recallForDecision(store, "mara", ["mara"], 1000 + TICKS_PER_HOUR);
    expect(store.get("d1")?.strength).toBeCloseTo(0.9);
  });

  it("never bumps strength above 1", () => {
    const store = new MemoryStore();
    store.add(makeMemory({ id: "d1", tags: ["mara"], strength: 0.95 }));
    const recalled = recallForDecision(store, "mara", ["mara"], 0);
    expect(recalled.did[0]?.strength).toBe(1);
  });
});

describe("searchMemories", () => {
  it("finds memories in any bucket that share a name from the query", () => {
    const store = new MemoryStore();
    store.addAll([
      makeMemory({ id: "c1", bucket: "conversations", tags: ["bob"] }),
      makeMemory({ id: "pe1", bucket: "people", tags: ["bob", "tavern"] }),
      makeMemory({ id: "s1", bucket: "seen", tags: ["clara"] }),
    ]);
    const results = searchMemories(store, "mara", "what do I know about Bob?", knownNames, 0);
    expect(results.map((memory) => memory.id).sort()).toEqual(["c1", "pe1"]);
    expect(results.every((memory) => memory.lastRecalledTick === 0)).toBe(true);
  });

  it("finds nothing for a query that names nothing known", () => {
    const store = new MemoryStore();
    store.add(makeMemory({ id: "c1", tags: ["bob"] }));
    expect(searchMemories(store, "mara", "anything at all", knownNames, 0)).toEqual([]);
  });

  it("returns at most the recall action's result limit", () => {
    const store = new MemoryStore();
    for (let index = 0; index < 10; index += 1) {
      store.add(makeMemory({ id: `c${index}`, tags: ["bob"] }));
    }
    expect(searchMemories(store, "mara", "Bob", knownNames, 0)).toHaveLength(6);
  });
});
