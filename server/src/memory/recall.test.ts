import type { Memory } from "@village/shared";
import { describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store";
import { buildCue, buildCueText, recallForDecision, scoreMemory, searchMemories } from "./recall";

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
      dailyPlan: "",
      goalsText: "",
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
      dailyPlan: "",
      goalsText: "",
      knownNames,
    });
    expect(cue).toEqual(expect.arrayContaining(["bakery", "oven", "bob", "tavern"]));
  });
});

describe("buildCue goals", () => {
  it("adds names found in the goals and the daily plan", () => {
    const cue = buildCue({
      place: "village road",
      aroundAgentNames: [],
      nearbyEntityNames: [],
      actionTarget: null,
      conversationText: "",
      intention: "",
      dailyPlan: "visit the tavern",
      goalsText: "get Bob to teach me",
      knownNames,
    });
    expect(cue).toEqual(expect.arrayContaining(["bob", "tavern"]));
  });
});

describe("buildCueText", () => {
  it("joins the intention, plan, reason, goals and only the last conversation lines", () => {
    const text = buildCueText({
      intention: "fetch water",
      dailyPlan: "bake",
      decisionReason: "someone arrived",
      goalsText: "be rich",
      conversationLines: ["first", "second", "third", "fourth", "fifth"],
    });
    for (const part of ["fetch water", "bake", "someone arrived", "be rich", "fifth"]) {
      expect(text).toContain(part);
    }
    expect(text).not.toContain("first");
  });
});

describe("scoreMemory", () => {
  it("scores tag overlap, recency and strength per the brief", () => {
    const memory = makeMemory({ id: "m1", tags: ["mara", "bakery"], strength: 0.8, tick: 0 });
    const sixHoursLater = 6 * TICKS_PER_HOUR;
    const score = scoreMemory(memory, ["mara", "oven"], sixHoursLater);
    expect(score).toBeCloseTo(1.0 * (1 / 2) + 0.3 * 0.5 + 0.3 * 0.8);
  });

  it("adds the weighted similarity", () => {
    const memory = makeMemory({ id: "m1", tags: ["mara"] });
    expect(scoreMemory(memory, ["mara"], 0, () => 1)).toBeCloseTo(
      scoreMemory(memory, ["mara"], 0) + 1.0,
    );
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
    expect(recalled.places).toHaveLength(1);
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
    expect(recalled.places.map((memory) => memory.id)).toEqual(["p1", "p3"]);
  });

  it("keeps only the best recallTotal memories overall", () => {
    const store = new MemoryStore();
    for (const bucket of [
      "seen",
      "conversations",
      "overheard",
      "did",
      "people",
      "reflections",
    ] as const) {
      for (let index = 0; index < 3; index += 1) {
        store.add(makeMemory({ id: `${bucket}${index}`, bucket, tags: ["mara"] }));
      }
    }
    const recalled = recallForDecision(store, "mara", ["mara"], 0);
    const total = Object.values(recalled).reduce((sum, list) => sum + list.length, 0);
    expect(total).toBeLessThanOrEqual(10);
  });

  it("adds at most the association total of linked memories", () => {
    const store = new MemoryStore();
    store.add(makeMemory({ id: "d1", tags: ["mara", "cellar"] }));
    for (let index = 0; index < 6; index += 1) {
      store.add(makeMemory({ id: `l${index}`, bucket: "places", tags: ["cellar"] }));
    }
    const recalled = recallForDecision(store, "mara", ["mara"], 0);
    const placesLimit = 1;
    expect(recalled.places).toHaveLength(placesLimit + 3);
  });

  it("does not return memories that repeat a line of the current conversation", () => {
    const store = new MemoryStore();
    store.addAll([
      makeMemory({
        id: "c1",
        bucket: "conversations",
        text: 'Clara said: "Is the well dry?"',
        tags: ["mara"],
      }),
      makeMemory({
        id: "c2",
        bucket: "conversations",
        text: 'Clara said: "Hello"',
        tags: ["mara"],
      }),
    ]);
    const recalled = recallForDecision(store, "mara", ["mara"], 0, {
      conversationWords: ["is the well dry"],
    });
    expect(recalled.conversations.map((memory) => memory.id)).toEqual(["c2"]);
  });

  it("does not recall a truncated copy of a line in the current conversation", () => {
    const line = "Is the well dry or has someone been taking water from it all morning long";
    const store = new MemoryStore();
    store.addAll([
      makeMemory({
        id: "c1",
        bucket: "conversations",
        text: 'Clara said: "Is the well dry or has someone been taking wat…',
        tags: ["mara"],
      }),
    ]);
    const recalled = recallForDecision(store, "mara", ["mara"], 0, { conversationWords: [line] });
    expect(recalled.conversations).toEqual([]);
  });

  it("recalls memories sharing words with the cue text", () => {
    const store = new MemoryStore();
    store.addAll([
      makeMemory({ id: "w1", text: "I carried water to the well" }),
      makeMemory({ id: "w2", text: "I sang a song" }),
    ]);
    const recalled = recallForDecision(store, "mara", [], 0, { cueText: "fetch water" });
    expect(recalled.did[0]?.id).toBe("w1");
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

  it("finds memories by plain words when the query names no one", () => {
    const store = new MemoryStore();
    store.addAll([
      makeMemory({ id: "w1", text: "I drew water from the well" }),
      makeMemory({ id: "w2", text: "I baked bread" }),
    ]);
    const results = searchMemories(store, "mara", "well water", knownNames, 0);
    expect(results.map((memory) => memory.id)).toEqual(["w1"]);
  });

  it("finds nothing for a query that matches no name or word", () => {
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
