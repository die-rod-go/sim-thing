import { describe, expect, it } from "vitest";
import type { Moment, WorldEvent } from "@village/shared";
import { makeSampleAgent, makeSampleEvent, makeSampleMoment } from "../fixtures/sample-data";
import { EVENT_CATEGORIES } from "./event-feed";
import { buildPlaceChats, buildStoryLog, type StoryFilter } from "./story-feed";
import { mergeSpeakerRuns } from "./thread-view";

const MAX_GAP_TICKS = 10;
const ada = makeSampleAgent("ada", "Ada", 0, 0);
const bob = makeSampleAgent("bob", "Bob", 1, 0);
const clara = { ...makeSampleAgent("clara", "Clara", 9, 9), place: "tavern" };
const dora = { ...makeSampleAgent("dora", "Dora", 5, 5), place: "bakery" };

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

function chatSummaries(events: WorldEvent[], filter: StoryFilter, currentTick: number) {
  return buildPlaceChats(events, filter, currentTick, MAX_GAP_TICKS).map(
    (chat) => `${chat.place}${chat.isLive ? " live" : ""}`,
  );
}

function logKeys(events: WorldEvent[], filter: StoryFilter, moments: Moment[] = []): string[] {
  return buildStoryLog(events, filter, moments).map((item) =>
    item.kind === "event" ? `event-${item.event.id}` : `moment-${item.moment.id}`,
  );
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

describe("buildPlaceChats", () => {
  it("puts live chats above quiet ones and keeps each group in place-name order", () => {
    const events = [
      makeSampleEvent(1, clara, 1),
      makeSampleEvent(2, dora, 2),
      makeSampleEvent(3, ada, 95),
      makeSampleEvent(4, clara, 96),
    ];
    expect(chatSummaries(events, SHOW_ALL, 100)).toEqual(["square live", "tavern live", "bakery"]);
  });

  it("does not move a chat when it gets a new line", () => {
    const before = [makeSampleEvent(1, clara, 90), makeSampleEvent(2, ada, 91)];
    const after = [...before, makeSampleEvent(3, clara, 95)];
    expect(chatSummaries(before, SHOW_ALL, 95)).toEqual(chatSummaries(after, SHOW_ALL, 95));
  });

  it("gathers everything said and done at a place into its chat, oldest first", () => {
    const events = [
      makeAction(1, { actor: bob, tick: 1 }, "action_started"),
      makeSampleEvent(2, ada, 50),
      makeAction(3, { actor: clara, tick: 51 }, "action_started"),
      makeAction(4, { actor: bob, tick: 52 }, "hurt"),
    ];
    const [square] = buildPlaceChats(events, SHOW_ALL, 55, MAX_GAP_TICKS);
    expect(square?.entries.map((entry) => entry.eventId)).toEqual([1, 2, 4]);
  });

  it("leaves hidden categories out of the chats", () => {
    const events = [
      makeSampleEvent(1, ada, 1),
      makeAction(2, { actor: ada, tick: 2 }, "walk_started"),
    ];
    const filter: StoryFilter = {
      ...SHOW_ALL,
      categories: new Set(EVENT_CATEGORIES.filter((category) => category !== "movement")),
    };
    const [square] = buildPlaceChats(events, filter, 5, MAX_GAP_TICKS);
    expect(square?.entries.map((entry) => entry.eventId)).toEqual([1]);
  });

  it("only gives a chat to places where someone has spoken", () => {
    const events = [makeAction(1, { actor: clara, tick: 1 }, "action_started")];
    expect(chatSummaries(events, SHOW_ALL, 5)).toEqual([]);
  });

  it("names only the latest conversation's speakers", () => {
    const events = [makeSampleEvent(1, bob, 1), makeSampleEvent(2, ada, 50)];
    const [square] = buildPlaceChats(events, SHOW_ALL, 55, MAX_GAP_TICKS);
    expect(square?.recentSpeakerIds).toEqual(["ada"]);
    expect(square?.speakerIds).toEqual(["bob", "ada"]);
  });

  it("drops the chats when talk is filtered out", () => {
    const filter: StoryFilter = { ...SHOW_ALL, categories: new Set(["action"]) };
    expect(chatSummaries([makeSampleEvent(1, ada, 1)], filter, 5)).toEqual([]);
  });

  it("keeps only places the filtered agent spoke at", () => {
    const events = [makeSampleEvent(1, ada, 1), makeSampleEvent(2, clara, 2)];
    expect(chatSummaries(events, { ...SHOW_ALL, agentId: "clara" }, 5)).toEqual(["tavern live"]);
  });
});

describe("mergeSpeakerRuns with a gap", () => {
  it("marks a pause and starts a new run after a long quiet stretch", () => {
    const events = [
      makeSampleEvent(1, ada, 1),
      makeSampleEvent(2, ada, 2),
      makeSampleEvent(3, ada, 50),
    ];
    const [square] = buildPlaceChats(events, SHOW_ALL, 55, MAX_GAP_TICKS);
    const blocks = mergeSpeakerRuns(square?.entries ?? [], MAX_GAP_TICKS);
    expect(blocks.map((block) => block.kind)).toEqual(["run", "pause", "run"]);
  });
});

describe("buildStoryLog", () => {
  it("lists every shown action newest first, leaving speech to the chats", () => {
    const events = [
      makeSampleEvent(1, ada, 1),
      makeAction(2, { actor: clara, tick: 30 }, "action_started"),
      makeAction(3, { actor: bob, tick: 40 }, "gave"),
    ];
    expect(logKeys(events, SHOW_ALL)).toEqual(["event-3", "event-2"]);
  });

  it("hides movement and filters by agent", () => {
    const events = [
      makeAction(1, { actor: ada, tick: 1 }, "walk_started"),
      makeAction(2, { actor: bob, tick: 2 }, "action_started"),
      makeAction(3, { actor: ada, tick: 3 }, "action_finished"),
    ];
    const filter: StoryFilter = {
      ...SHOW_ALL,
      agentId: "ada",
      categories: new Set(EVENT_CATEGORIES.filter((category) => category !== "movement")),
    };
    expect(logKeys(events, filter)).toEqual(["event-3"]);
  });

  it("leaves moments out unless the reader turns them on", () => {
    expect(logKeys([], SHOW_ALL, [goalMoment])).toEqual([]);
  });

  it("shows only the big beats when moments are on", () => {
    const filter: StoryFilter = { ...SHOW_ALL, isShowingMoments: true };
    expect(logKeys([], filter, [goalMoment, planMoment])).toEqual(["moment-7"]);
  });
});
