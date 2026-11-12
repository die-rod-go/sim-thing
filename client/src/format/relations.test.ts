import { describe, expect, it } from "vitest";
import { makeSampleAgent, makeSampleEvent, makeSampleMemory } from "../fixtures/sample-data";
import { groupConversations } from "./conversations";
import { buildRelations } from "./relations";

const MAX_GAP_TICKS = 10;
const ada = makeSampleAgent("ada", "Ada", 0, 0);
const bob = makeSampleAgent("bob", "Bob", 1, 1);
const clara = makeSampleAgent("clara", "Clara", 2, 2);
ada.awareness = {
  clara: { agentId: "clara", tick: 40, via: "saw", place: "square", doing: "selling" },
};
ada.dossiers = { bob: { text: "Owes me two coins.", updatedTick: 20 } };
const memories = [
  { ...makeSampleMemory("m2", "ada", 5), tags: ["bob"] },
  { ...makeSampleMemory("m4", "ada", 9), tags: ["bob", "bakery"] },
];
const threads = groupConversations(
  [makeSampleEvent(1, ada, 1), makeSampleEvent(2, bob, 2)],
  MAX_GAP_TICKS,
);

describe("buildRelations", () => {
  it("lists everyone else, most recently perceived first", () => {
    const relations = buildRelations(ada, [ada, bob, clara], memories, threads, 50, 2);
    expect(relations.map((relation) => relation.name)).toEqual(["Clara", "Bob"]);
    expect(relations[0]?.minutesSincePerceived).toBe(20);
    expect(relations[1]?.minutesSincePerceived).toBeNull();
  });

  it("collects the dossier, tagged memories and shared conversations per person", () => {
    const bobRelation = buildRelations(ada, [ada, bob, clara], memories, threads, 50, 2).find(
      (relation) => relation.agentId === "bob",
    );
    expect(bobRelation?.dossier).toEqual({ text: "Owes me two coins.", minutesAgo: 60 });
    expect(bobRelation?.memoryCount).toBe(2);
    expect(bobRelation?.sharedThreadCount).toBe(1);
  });
});
