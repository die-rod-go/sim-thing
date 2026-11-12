import { describe, expect, it } from "vitest";
import { makeSampleAgent, makeSampleEvent } from "../fixtures/sample-data";
import {
  categorizeEvent,
  describeEventForViewer,
  filterEvents,
  groupEventsByHour,
  listEventPlaces,
} from "./event-feed";

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

  it("hides events whose category is switched off", () => {
    const walk = { ...makeSampleEvent(4, ada, 4), kind: "walk_started" as const };
    expect(categorizeEvent(walk)).toBe("movement");
    const ids = filterEvents([...events, walk], {
      agentId: null,
      place: null,
      categories: new Set(["speech"]),
    }).map((event) => event.id);
    expect(ids).toEqual([3, 2, 1]);
  });

  it("groups consecutive events by sim day and hour", () => {
    const late = makeSampleEvent(5, ada, 61);
    const groups = groupEventsByHour([...events, late], { minutesPerTick: 1, startHour: 6 });
    expect(groups.map((group) => group.label)).toEqual(["Day 1 · 06:00", "Day 1 · 07:00"]);
    expect(groups[0]?.events).toHaveLength(3);
  });

  it("shows the actor's real reason for a failed action to the viewer", () => {
    const failed = {
      ...makeSampleEvent(4, ada, 4),
      kind: "action_failed" as const,
      description: "tried to hand over an axe, but it didn't happen",
      actorDescription: "tried to hand over an axe but had no axe",
    };
    expect(describeEventForViewer(failed)).toBe("tried to hand over an axe but had no axe");
    expect(describeEventForViewer({ ...failed, kind: "said" })).toBe(failed.description);
  });
});
