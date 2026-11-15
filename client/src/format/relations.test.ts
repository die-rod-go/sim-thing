import { describe, expect, it } from "vitest";
import { makeSampleAgent, makeSampleEvent } from "../fixtures/sample-data";
import { groupConversations } from "./conversations";
import { buildRelations } from "./relations";

const MAX_GAP_TICKS = 10;
const ada = makeSampleAgent("ada", "Ada", 0, 0);
const bob = makeSampleAgent("bob", "Bob", 1, 1);
const clara = makeSampleAgent("clara", "Clara", 2, 2);
ada.awareness = {
  clara: { agentId: "clara", tick: 40, via: "saw", place: "square", doing: "selling" },
};
const bobEntry = {
  whatIThinkOfThem: "Owes me two coins.",
  whatTheyThinkOfMe: "",
  whatIWantFromThem: "My two coins.",
  whatTheyWantFromMe: "",
  misc: "",
};
ada.people = { bob: bobEntry };
const threads = groupConversations(
  [makeSampleEvent(1, ada, 1), makeSampleEvent(2, bob, 2)],
  MAX_GAP_TICKS,
);

describe("buildRelations", () => {
  it("lists everyone else, most recently perceived first", () => {
    const relations = buildRelations(ada, [ada, bob, clara], threads, 50, 2);
    expect(relations.map((relation) => relation.name)).toEqual(["Clara", "Bob"]);
    expect(relations[0]?.minutesSincePerceived).toBe(20);
    expect(relations[1]?.minutesSincePerceived).toBeNull();
  });

  it("collects the person entry and shared conversations per person", () => {
    const bobRelation = buildRelations(ada, [ada, bob, clara], threads, 50, 2).find(
      (relation) => relation.agentId === "bob",
    );
    expect(bobRelation?.entry).toEqual(bobEntry);
    expect(bobRelation?.sharedThreadCount).toBe(1);
  });
});
