import { describe, expect, it } from "vitest";
import type { Moment, WorldEvent } from "@village/shared";
import { makeSampleAgent, makeSampleEvent, makeSampleMoment } from "../fixtures/sample-data";
import { groupConversations } from "./conversations";
import { EVENT_CATEGORIES } from "./event-feed";
import { buildStory, type StoryFilter } from "./story-feed";

const MAX_GAP_TICKS = 10;
const ada = makeSampleAgent("ada", "Ada", 0, 0);
const bob = makeSampleAgent("bob", "Bob", 1, 0);
const clara = { ...makeSampleAgent("clara", "Clara", 9, 9), place: "tavern" };

const SHOW_ALL: StoryFilter = {
  agentId: null,
  place: null,
  categories: new Set(EVENT_CATEGORIES),
  isShowingMoments: false,
};

function makeAction(
  id: number,
  actorTick: { actor: typeof ada; tick: number },
  kind: WorldEvent["kind"],
): WorldEvent {
  return {
    ...makeSampleEvent(id, actorTick.actor, actorTick.tick),
    kind,
    description: `${kind} ${id}`,
    speech: undefined,
  };
}

function storyKeys(
  events: WorldEvent[],
  filter: StoryFilter,
  currentTick: number,
  moments: Moment[] = [],
): string[] {
  const threads = groupConversations(events, MAX_GAP_TICKS);
  return buildStory(events, threads, filter, currentTick, MAX_GAP_TICKS, moments).map((item) => {
    if (item.kind === "thread") return `thread-${item.thread.id}`;
    return item.kind === "event" ? `event-${item.event.id}` : `moment-${item.moment.id}`;
  });
}

const goalMoment: Moment = {
  ...makeSampleMoment(7, ada, 5),
  kind: "goal_added",
  text: "set a new goal",
  goal: { text: "Open a stall", why: "", progress: "", kind: "world" },
};
const planMoment: Moment = {
  ...makeSampleMoment(8, ada, 6),
  kind: "daily_plan",
  text: "planned the day",
  plan: "Bake",
};

describe("buildStory", () => {
  it("pins a live conversation above newer events", () => {
    const events = [
      makeSampleEvent(1, ada, 50),
      makeAction(2, { actor: clara, tick: 52 }, "action_started"),
    ];
    expect(storyKeys(events, SHOW_ALL, 55)).toEqual(["thread-1", "event-2"]);
  });

  it("orders finished threads and events newest first", () => {
    const events = [
      makeSampleEvent(1, ada, 1),
      makeAction(2, { actor: clara, tick: 30 }, "action_started"),
      makeSampleEvent(3, clara, 40),
    ];
    expect(storyKeys(events, SHOW_ALL, 100)).toEqual(["thread-3", "event-2", "thread-1"]);
  });

  it("does not repeat a gift already shown inside its conversation", () => {
    const gift = {
      ...makeAction(2, { actor: bob, tick: 3 }, "gave"),
      description: "gave Ada 1 bread",
    };
    const events = [makeSampleEvent(1, bob, 1), gift];
    expect(storyKeys(events, SHOW_ALL, 100)).toEqual(["thread-1"]);
  });

  it("hides movement and filters by agent", () => {
    const events = [
      makeAction(1, { actor: ada, tick: 1 }, "walk_started"),
      makeAction(2, { actor: bob, tick: 2 }, "action_started"),
      makeAction(3, { actor: ada, tick: 3 }, "action_finished"),
    ];
    const filter: StoryFilter = {
      agentId: "ada",
      place: null,
      categories: new Set(EVENT_CATEGORIES.filter((category) => category !== "movement")),
      isShowingMoments: false,
    };
    expect(storyKeys(events, filter, 100)).toEqual(["event-3"]);
  });

  it("drops conversations when talk is filtered out", () => {
    const filter: StoryFilter = { ...SHOW_ALL, categories: new Set(["action"]) };
    expect(storyKeys([makeSampleEvent(1, ada, 1)], filter, 100)).toEqual([]);
  });

  it("leaves moments out unless the reader turns them on", () => {
    expect(storyKeys([], SHOW_ALL, 100, [goalMoment])).toEqual([]);
  });

  it("shows only the big beats when moments are on", () => {
    const filter: StoryFilter = { ...SHOW_ALL, isShowingMoments: true };
    expect(storyKeys([], filter, 100, [goalMoment, planMoment])).toEqual(["moment-7"]);
  });
});
