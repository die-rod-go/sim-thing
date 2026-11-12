import { describe, expect, it } from "vitest";
import { pickActivityCue, type ActivityGlyphs } from "./activity-cues";

const GLYPHS: ActivityGlyphs = {
  sleepVerb: "sleep",
  verbGlyphs: { "bake bread": "B" },
  actionGlyphs: { wait: "W", interact: "I" },
};

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
