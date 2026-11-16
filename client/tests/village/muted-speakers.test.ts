import { describe, expect, it } from "vitest";
import {
  parseMutedSpeakers,
  serializeMutedSpeakers,
  toggleMutedSpeaker,
} from "../../src/village/muted-speakers";

describe("muted speakers", () => {
  it("mutes an unmuted agent and unmutes a muted one", () => {
    const muted = toggleMutedSpeaker(new Set(), "ada");
    expect([...muted]).toEqual(["ada"]);
    expect([...toggleMutedSpeaker(muted, "ada")]).toEqual([]);
  });

  it("leaves the original set untouched when toggling", () => {
    const original = new Set(["ada"]);
    toggleMutedSpeaker(original, "bram");
    expect([...original]).toEqual(["ada"]);
  });

  it("round-trips through storage", () => {
    const muted = new Set(["ada", "bram"]);
    expect(parseMutedSpeakers(serializeMutedSpeakers(muted))).toEqual(muted);
  });

  it("treats missing, corrupt or wrongly shaped storage as nothing stored", () => {
    expect(parseMutedSpeakers(null)).toBeNull();
    expect(parseMutedSpeakers("{not json")).toBeNull();
    expect(parseMutedSpeakers('{"ada":true}')).toBeNull();
    expect(parseMutedSpeakers('["ada", 3]')).toEqual(new Set(["ada"]));
  });
});
