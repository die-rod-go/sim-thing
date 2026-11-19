import { describe, expect, it } from "vitest";
import type { PlayerPerson, PlayerView } from "@village/shared";
import { describeNearness, describeTurn } from "../../src/format/player-lines";

function view(fields: Partial<PlayerView>): PlayerView {
  return {
    isDead: false,
    isYourTurn: false,
    turnReason: null,
    doing: null,
    pendingActs: [],
    ...fields,
  } as PlayerView;
}

const JESS: PlayerPerson = {
  name: "Jess",
  pronouns: "she/her",
  distanceTiles: 1,
  isInReach: true,
  canHearYou: true,
  canHearWhisper: true,
  doing: "standing around",
  isDead: false,
};

describe("the player's panel lines", () => {
  it("says when it is the player's turn, and why", () => {
    expect(describeTurn(view({ isYourTurn: true }), false)).toBe("Your turn.");
    expect(describeTurn(view({ isYourTurn: true, turnReason: "Jess said my name" }), false)).toBe(
      "Your turn: Jess said my name.",
    );
  });

  it("says what the agent is doing while the clock runs, and what comes next", () => {
    expect(describeTurn(view({ doing: "walking to the bakery" }), false)).toBe(
      "Walking to the bakery…",
    );
    expect(describeTurn(view({ pendingActs: ["wait 5 min", "walk to the well"] }), true)).toBe(
      "Next: wait 5 min; then walk to the well (when the clock runs again)",
    );
  });

  it("says how near someone is and whether they would hear", () => {
    expect(describeNearness(JESS)).toBe("within reach, would hear a whisper");
    const farOff = { ...JESS, distanceTiles: 9, isInReach: false, canHearWhisper: false };
    expect(describeNearness(farOff)).toBe("9 tiles away, hears you");
    expect(describeNearness({ ...farOff, canHearYou: false })).toBe(
      "9 tiles away, too far to hear you",
    );
  });
});
