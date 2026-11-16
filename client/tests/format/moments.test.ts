import { describe, expect, it } from "vitest";
import type { Moment } from "@village/shared";
import { isStoryMoment, selectToastMoments } from "../../src/format/moments";

const base = { agentId: "ada", agentName: "Ada", text: "" };

const personalityMoment: Moment = {
  ...base,
  id: 3,
  tick: 9,
  kind: "personality_changed",
  field: "openness",
  oldValue: "0.6",
  newValue: "0.65",
  reason: "",
};

const failureMoment: Moment = {
  ...base,
  id: 4,
  tick: 9,
  kind: "action_failed",
  eventId: 1,
  description: "could not reach the oven",
};

describe("isStoryMoment", () => {
  it("lets personality changes into the story", () => {
    expect(isStoryMoment(personalityMoment)).toBe(true);
  });

  it("keeps failures out of the story", () => {
    expect(isStoryMoment(failureMoment)).toBe(false);
  });
});

describe("selectToastMoments", () => {
  it("notifies only personality changes newer than the last one seen", () => {
    const moments = [{ ...personalityMoment, id: 2 }, personalityMoment, failureMoment];
    expect(selectToastMoments(moments, 2).map((moment) => moment.id)).toEqual([3]);
  });
});
