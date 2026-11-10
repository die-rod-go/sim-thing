import { describe, expect, it } from "vitest";
import { makeSampleAgent, makeSampleEvent } from "../fixtures/sample-data";
import { describeEvent, filterEvents, listEventPlaces } from "./event-feed";

const ada = makeSampleAgent("ada", "Ada", 0, 0);
const bob = { ...makeSampleAgent("bob", "Bob", 1, 1), place: "tavern" };
const events = [
  makeSampleEvent(1, ada, 1),
  makeSampleEvent(2, bob, 2),
  { ...makeSampleEvent(3, bob, 3), targetId: "ada", targetName: "Ada" },
];

describe("eventFeed", () => {
  it("shows every event newest first without a filter", () => {
    const ids = filterEvents(events, { agentId: null, place: null }).map((event) => event.id);
    expect(ids).toEqual([3, 2, 1]);
  });

  it("includes events where the agent is actor or target", () => {
    const ids = filterEvents(events, { agentId: "ada", place: null }).map((event) => event.id);
    expect(ids).toEqual([3, 1]);
  });

  it("combines the agent and place filters", () => {
    const ids = filterEvents(events, { agentId: "ada", place: "tavern" }).map((event) => event.id);
    expect(ids).toEqual([3]);
  });

  it("lists distinct places alphabetically", () => {
    expect(listEventPlaces(events)).toEqual(["square", "tavern"]);
  });

  it("prefixes the actor's name to the description", () => {
    expect(describeEvent(events[0]!)).toBe('Ada said "Fresh bread here!"');
  });
});
