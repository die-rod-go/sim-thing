import { describe, expect, it } from "vitest";
import type { Awareness } from "@village/shared";
import {
  awarenessFromPerceptions,
  mergeAwareness,
  observeAgents,
  selectRecentAwareness,
} from "../../src/perception/awareness";
import { buildAsciiWorld, buildTestEvent, requireMarker } from "./test-grid";

function buildAwareness(overrides: Partial<Awareness> & { agentId: string }): Awareness {
  return { tick: 10, via: "saw", place: "square", doing: "standing around", ...overrides };
}

describe("awareness", () => {
  const asciiWorld = buildAsciiWorld(`
    #########
    #a..b#c.#
    #########`);
  const observer = {
    agentId: "anna",
    name: "Anna",
    pos: requireMarker(asciiWorld, "a"),
    isAsleep: false,
  };
  const others = [
    { agentId: "anna", pos: observer.pos, place: "bakery", doing: "kneading dough" },
    { agentId: "bob", pos: requireMarker(asciiWorld, "b"), place: "bakery", doing: "sweeping" },
    { agentId: "clara", pos: requireMarker(asciiWorld, "c"), place: "pantry", doing: "counting" },
  ];

  it("records agents in sight as seen", () => {
    expect(observeAgents(asciiWorld.world, observer, others, 42)).toEqual([
      { agentId: "bob", tick: 42, via: "saw", place: "bakery", doing: "sweeping" },
    ]);
  });

  it("a sleeping observer sees no one", () => {
    const sleeper = { ...observer, isAsleep: true };
    expect(observeAgents(asciiWorld.world, sleeper, others, 42)).toEqual([]);
  });

  it("records heard-but-unseen speakers as talking where the sound came from", () => {
    const event = buildTestEvent({
      tick: 77,
      actorId: "dave",
      place: "street",
      pos: { x: 0, y: 0 },
      loudness: 8,
      speech: { words: "Hello?", volume: "normal" },
    });
    const entries = awarenessFromPerceptions({
      event,
      perceptions: [
        {
          agentId: "anna",
          via: "heard_muffled",
          isInSight: false,
          hearing: "muffled",
          direction: "east",
        },
        { agentId: "bob", via: "saw", isInSight: true, hearing: "clear", direction: null },
      ],
    });
    expect(entries).toEqual([
      {
        perceiverId: "anna",
        awareness: {
          agentId: "dave",
          tick: 77,
          via: "heard_muffled",
          place: "street",
          doing: "talking",
        },
      },
    ]);
  });

  it("uses the event description for heard sounds that are not speech", () => {
    const event = buildTestEvent({
      actorId: "ed",
      pos: { x: 0, y: 0 },
      loudness: 15,
      description: "started chopping wood",
    });
    const [entry] = awarenessFromPerceptions({
      event,
      perceptions: [
        { agentId: "anna", via: "heard", isInSight: false, hearing: "clear", direction: "north" },
      ],
    });
    expect(entry?.awareness.doing).toBe("started chopping wood");
  });

  it("merging keeps the newest entry per agent without changing the original", () => {
    const record = { bob: buildAwareness({ agentId: "bob", tick: 10 }) };
    const newer = buildAwareness({ agentId: "bob", tick: 20, doing: "leaving" });
    const older = buildAwareness({ agentId: "bob", tick: 5, doing: "arriving" });
    const clara = buildAwareness({ agentId: "clara", tick: 3 });
    const merged = mergeAwareness(record, [newer, older, clara]);
    expect(merged).toEqual({ bob: newer, clara });
    expect(record.bob.tick).toBe(10);
  });

  it("prefers seeing over hearing within the same tick", () => {
    const seen = buildAwareness({ agentId: "bob", tick: 10, via: "saw" });
    const heard = buildAwareness({ agentId: "bob", tick: 10, via: "heard" });
    expect(mergeAwareness({}, [seen, heard]).bob).toBe(seen);
    expect(mergeAwareness({}, [heard, seen]).bob).toBe(seen);
  });

  it("selects only entries within the prompt window, newest first", () => {
    const record = {
      bob: buildAwareness({ agentId: "bob", tick: 50 }),
      clara: buildAwareness({ agentId: "clara", tick: 100 }),
      dave: buildAwareness({ agentId: "dave", tick: 39 }),
    };
    const recent = selectRecentAwareness(record, 100, 60, 1);
    expect(recent.map((entry) => entry.agentId)).toEqual(["clara", "bob"]);
    expect(Object.keys(record)).toHaveLength(3);
  });
});
