import { describe, expect, it } from "vitest";
import type { ConversationThread } from "../format/conversations";
import { listConversationLinks, pickActivityCue, type ActivityGlyphs } from "./activity-cues";

const GLYPHS: ActivityGlyphs = {
  sleepVerb: "sleep",
  verbGlyphs: { "bake bread": "B" },
  actionGlyphs: { wait: "W", interact: "I" },
};

function makeThread(speakerIds: string[], endTick: number): ConversationThread {
  return {
    id: endTick,
    place: "tavern",
    startTick: 0,
    endTick,
    speakerIds,
    speakerNames: speakerIds,
    entries: [],
  };
}

describe("pickActivityCue", () => {
  it("shows sleep for a sleeping agent", () => {
    const sleeping = { kind: "interact", target: "bed", verb: "sleep", endsAtTick: 400 };
    expect(pickActivityCue(sleeping, GLYPHS)).toEqual({ kind: "sleep" });
  });

  it("prefers the verb glyph over the action kind glyph", () => {
    const baking = { kind: "interact", target: "oven", verb: "bake bread", endsAtTick: 50 };
    expect(pickActivityCue(baking, GLYPHS)).toEqual({ kind: "glyph", glyph: "B" });
    const reading = { kind: "interact", target: "board", verb: "read", endsAtTick: 50 };
    expect(pickActivityCue(reading, GLYPHS)).toEqual({ kind: "glyph", glyph: "I" });
  });

  it("shows nothing for idle or walking agents", () => {
    expect(pickActivityCue(null, GLYPHS)).toBeNull();
    const walking = { kind: "walk_to", target: "bakery", endsAtTick: null };
    expect(pickActivityCue(walking, GLYPHS)).toBeNull();
  });
});

describe("listConversationLinks", () => {
  it("links every pair of speakers in ongoing conversations once", () => {
    const threads = [makeThread(["cara", "ada", "bob"], 100), makeThread(["bob", "ada"], 98)];
    const links = listConversationLinks(threads, 100, 10);
    expect(links.map((link) => link.key).sort()).toEqual(["ada|bob", "ada|cara", "bob|cara"]);
  });

  it("skips finished conversations and lone speakers", () => {
    const threads = [makeThread(["ada", "bob"], 50), makeThread(["cara"], 100)];
    expect(listConversationLinks(threads, 100, 10)).toEqual([]);
  });
});
