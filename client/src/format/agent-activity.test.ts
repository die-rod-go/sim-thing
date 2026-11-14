import { describe, expect, it } from "vitest";
import type { WorldEvent } from "@village/shared";
import {
  makeSampleAgent,
  makeSampleEvent,
  makeSampleLlmCall,
  makeSampleMoment,
} from "../fixtures/sample-data";
import { buildAgentActivity, findNewestThought } from "./agent-activity";
import { groupConversations } from "./conversations";
import { summarizeLlmCall } from "./thoughts";

const MAX_GAP_TICKS = 10;
const ada = makeSampleAgent("ada", "Ada", 0, 0);
const bob = makeSampleAgent("bob", "Bob", 1, 0);

function say(id: number, speaker: typeof ada, tick: number, words: string): WorldEvent {
  return { ...makeSampleEvent(id, speaker, tick), speech: { words, volume: "normal" } };
}

function act(id: number, tick: number, kind: WorldEvent["kind"], place = "square"): WorldEvent {
  return {
    ...makeSampleEvent(id, ada, tick),
    kind,
    place,
    description: `${kind} ${id}`,
    speech: undefined,
  };
}

function buildFor(events: WorldEvent[], callTicks: number[] = []) {
  return buildAgentActivity({
    agentId: "ada",
    events,
    threads: groupConversations(events, MAX_GAP_TICKS),
    thoughts: callTicks.map((tick, callIndex) =>
      summarizeLlmCall(makeSampleLlmCall(callIndex + 1, "ada", tick)),
    ),
    latestThought: null,
    moments: [],
  });
}

describe("buildAgentActivity", () => {
  it("reads thought, then deed, then words within a tick, newest tick first", () => {
    const events = [act(1, 5, "action_started"), say(2, ada, 5, "Bread for sale!")];
    const groups = buildFor(events, [5, 2]);
    expect(groups.map((group) => group.tick)).toEqual([5, 2]);
    expect(groups[0]?.items.map((item) => item.kind)).toEqual(["thought", "action", "speech"]);
  });

  it("collapses a walk into one line naming where they arrived", () => {
    const events = [act(1, 1, "walk_started"), act(2, 4, "arrived", "bakery")];
    const groups = buildFor(events);
    const texts = groups.flatMap((group) =>
      group.items.map((item) => (item.kind === "action" ? item.text : "")),
    );
    expect(texts).toEqual(["walked to bakery"]);
  });

  it("shows the other speaker's line that a reply answered", () => {
    const events = [say(1, bob, 1, "Got any rye?"), say(2, ada, 2, "Only wheat today.")];
    const speech = buildFor(events).flatMap((group) => group.items)[0];
    expect(speech).toMatchObject({
      kind: "speech",
      words: "Only wheat today.",
      replyTo: { speakerName: "Bob", words: "Got any rye?" },
    });
  });

  it("leaves out other agents' doings", () => {
    const bobAction = { ...act(1, 1, "action_started"), actorId: "bob", actorName: "Bob" };
    expect(buildFor([bobAction])).toEqual([]);
  });

  it("adds the server's latest thought when no call covers it", () => {
    const groups = buildAgentActivity({
      agentId: "ada",
      events: [],
      threads: [],
      thoughts: [],
      latestThought: { text: "Bob looks tired", tick: 9 },
      moments: [],
    });
    expect(groups[0]?.items[0]).toMatchObject({ kind: "thought", headline: "Bob looks tired" });
  });
});

describe("buildAgentActivity folding and pairing", () => {
  it("folds failed attempts in a row into one item", () => {
    const groups = buildFor([
      act(1, 1, "action_failed"),
      act(2, 2, "action_failed"),
      act(3, 3, "action_failed"),
      act(4, 4, "action_finished"),
    ]);
    const kinds = groups.flatMap((group) => group.items.map((item) => item.kind));
    expect(kinds).toEqual(["action", "failures"]);
  });

  it("moves a line beside the decision that produced it", () => {
    const line: WorldEvent = {
      ...makeSampleEvent(1, ada, 6),
      speech: { words: "Bread!", volume: "normal", thought: "Sell it", llmCallId: 1 },
    };
    const groups = buildFor([line], [5]);
    expect(groups).toHaveLength(1);
    const speech = groups[0]?.items.find((item) => item.kind === "speech");
    expect(speech?.kind === "speech" && speech.isThoughtShownAbove).toBe(true);
  });

  it("leaves failure moments to the events that already show them", () => {
    const groups = buildAgentActivity({
      agentId: "ada",
      events: [],
      threads: [],
      thoughts: [],
      latestThought: null,
      moments: [
        { ...makeSampleMoment(1, ada, 3), kind: "action_failed", eventId: 1, description: "no" },
        makeSampleMoment(4, ada, 4),
      ],
    });
    expect(groups.flatMap((group) => group.items.map((item) => item.key))).toEqual(["moment-4"]);
  });
});

describe("findNewestThought", () => {
  it("prefers whichever thought is newer", () => {
    const thoughts = [summarizeLlmCall(makeSampleLlmCall(1, "ada", 4))];
    expect(findNewestThought(thoughts, { text: "later", tick: 6 })?.text).toBe("later");
    expect(findNewestThought(thoughts, { text: "earlier", tick: 2 })?.text).toBe(
      "I should sell bread",
    );
  });
});
