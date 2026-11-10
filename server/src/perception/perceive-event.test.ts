import { describe, expect, it } from "vitest";
import type { Position, Volume } from "@village/shared";
import { config } from "../config";
import { perceiveEvent } from "./perceive-event";
import { buildAsciiWorld, buildTestEvent, requireMarker } from "./test-grid";
import type { Perceiver } from "./types";

function buildPerceiver(agentId: string, pos: Position, isAsleep = false): Perceiver {
  return { agentId, name: agentId.charAt(0).toUpperCase() + agentId.slice(1), pos, isAsleep };
}

function buildSpeech(pos: Position, words: string, volume: Volume = "normal") {
  return buildTestEvent({
    pos,
    loudness: config.perception.speechLoudness[volume],
    speech: { words, volume },
  });
}

describe("perceiving events", () => {
  it("an event in sight is seen and carries no direction", () => {
    const asciiWorld = buildAsciiWorld("#a....b#");
    const event = buildSpeech(requireMarker(asciiWorld, "a"), "Hello");
    const [perception] = perceiveEvent(asciiWorld.world, event, [
      buildPerceiver("bob", requireMarker(asciiWorld, "b")),
    ]);
    expect(perception).toEqual({
      agentId: "bob",
      via: "saw",
      isInSight: true,
      hearing: "clear",
      direction: null,
    });
  });

  it("actor does not perceive its own event", () => {
    const asciiWorld = buildAsciiWorld("#a....b#");
    const event = buildSpeech(requireMarker(asciiWorld, "a"), "Hello");
    const perceptions = perceiveEvent(asciiWorld.world, event, [
      buildPerceiver("speaker", requireMarker(asciiWorld, "a")),
    ]);
    expect(perceptions).toEqual([]);
  });

  it("heard-but-not-seen sound carries a direction", () => {
    const asciiWorld = buildAsciiWorld(`
      #######
      #a....#
      #####.#
      #b#c..#
      #######`);
    const event = buildSpeech(requireMarker(asciiWorld, "a"), "Anyone there?");
    const perceptions = perceiveEvent(asciiWorld.world, event, [
      buildPerceiver("clara", requireMarker(asciiWorld, "c")),
      buildPerceiver("bob", requireMarker(asciiWorld, "b")),
    ]);
    expect(perceptions).toEqual([
      {
        agentId: "clara",
        via: "heard",
        isInSight: false,
        hearing: "clear",
        direction: "north-west",
      },
    ]);
  });

  it("muffles speech heard through a closed door", () => {
    const asciiWorld = buildAsciiWorld("#a..D..b#");
    const event = buildSpeech(requireMarker(asciiWorld, "a"), "Secret plans");
    const [perception] = perceiveEvent(asciiWorld.world, event, [
      buildPerceiver("bob", requireMarker(asciiWorld, "b")),
    ]);
    expect(perception?.via).toBe("heard_muffled");
    expect(perception?.hearing).toBe("muffled");
    expect(perception?.direction).toBe("west");
  });

  it("silent events are only seen", () => {
    const asciiWorld = buildAsciiWorld("#a..D..b.c#");
    const event = buildTestEvent({ pos: requireMarker(asciiWorld, "b"), kind: "arrived" });
    const perceptions = perceiveEvent(asciiWorld.world, event, [
      buildPerceiver("anna", requireMarker(asciiWorld, "a")),
      buildPerceiver("carl", requireMarker(asciiWorld, "c")),
    ]);
    expect(perceptions.map((perception) => [perception.agentId, perception.via])).toEqual([
      ["carl", "saw"],
    ]);
  });

  it("sleeping agent hears its own name but not normal speech", () => {
    const asciiWorld = buildAsciiWorld("#a....b#");
    const speakerPos = requireMarker(asciiWorld, "a");
    const sleeper = buildPerceiver("bob", requireMarker(asciiWorld, "b"), true);
    const ordinary = buildSpeech(speakerPos, "Good morning, everyone");
    expect(perceiveEvent(asciiWorld.world, ordinary, [sleeper])).toEqual([]);
    const nameOnlyAsPrefix = buildSpeech(speakerPos, "Ask Bobby about it");
    expect(perceiveEvent(asciiWorld.world, nameOnlyAsPrefix, [sleeper])).toEqual([]);

    const calling = buildSpeech(speakerPos, "Wake up, BOB!");
    const [perception] = perceiveEvent(asciiWorld.world, calling, [sleeper]);
    expect(perception?.via).toBe("heard");
    expect(perception?.isInSight).toBe(false);
    expect(perception?.direction).toBe("west");
  });

  it("sleeping agent does not hear its name beyond muffled reach", () => {
    const asciiWorld = buildAsciiWorld("#a..............b#");
    const event = buildSpeech(requireMarker(asciiWorld, "a"), "Where is Bob?");
    const sleeper = buildPerceiver("bob", requireMarker(asciiWorld, "b"), true);
    expect(perceiveEvent(asciiWorld.world, event, [sleeper])).toEqual([]);
  });

  it("sleeping agent hears a shout", () => {
    const asciiWorld = buildAsciiWorld("#a..D..b#");
    const event = buildSpeech(requireMarker(asciiWorld, "a"), "Fire!", "shout");
    const [perception] = perceiveEvent(asciiWorld.world, event, [
      buildPerceiver("bob", requireMarker(asciiWorld, "b"), true),
    ]);
    expect(perception?.via).toBe("heard");
  });
});
