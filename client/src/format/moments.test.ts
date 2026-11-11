import { describe, expect, it } from "vitest";
import type { Moment } from "@village/shared";
import { buildDiary, isStoryMoment, selectToastMoments } from "./moments";

const base = { agentId: "ada", agentName: "Ada", text: "" };

function makeReflection(id: number, tick: number, pass: "morning" | "night" | "weekly"): Moment {
  return {
    ...base,
    id,
    tick,
    kind: "reflection",
    pass,
    summary: `summary ${id}`,
    moodEntry: null,
    insights: [],
  };
}

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
  it("lets personality changes and weekly reflections into the story", () => {
    expect(isStoryMoment(personalityMoment)).toBe(true);
    expect(isStoryMoment(makeReflection(1, 1, "weekly"))).toBe(true);
  });

  it("keeps failures and nightly reflections out of the story", () => {
    expect(isStoryMoment(failureMoment)).toBe(false);
    expect(isStoryMoment(makeReflection(2, 1, "night"))).toBe(false);
  });
});

describe("selectToastMoments", () => {
  it("notifies only personality changes newer than the last one seen", () => {
    const moments = [{ ...personalityMoment, id: 2 }, personalityMoment, failureMoment];
    expect(selectToastMoments(moments, 2).map((moment) => moment.id)).toEqual([3]);
  });
});

describe("buildDiary", () => {
  it("keeps one agent's night reflections, newest first, labelled by day", () => {
    const moments = [
      makeReflection(1, 10, "night"),
      makeReflection(2, 20, "morning"),
      makeReflection(3, 30, "night"),
      { ...makeReflection(4, 40, "night"), agentId: "bob" },
    ];
    const diary = buildDiary(moments, "ada", (tick) => tick / 10);
    expect(diary.map((entry) => [entry.momentId, entry.day])).toEqual([
      [3, 3],
      [1, 1],
    ]);
  });
});
