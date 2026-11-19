import { describe, expect, it } from "vitest";
import type { PlayerVerbOption } from "@village/shared";
import {
  buildGiveAct,
  buildOptionAct,
  buildTalkAct,
  buildTileAct,
  isOptionReady,
  resolveMoveKey,
} from "../../src/village/player-controls";

const EAT: PlayerVerbOption = {
  label: "eat",
  verb: "eat",
  item: "bread",
  from: null,
  targets: null,
  takes: [],
};

describe("the player's controls", () => {
  it("moves a tile for the arrow keys, WASD and the diagonal keys, and nothing else", () => {
    expect(resolveMoveKey("ArrowUp")).toEqual({ action: "move", direction: { x: 0, y: -1 } });
    expect(resolveMoveKey("D")).toEqual({ action: "move", direction: { x: 1, y: 0 } });
    expect(resolveMoveKey("z")).toEqual({ action: "move", direction: { x: -1, y: 1 } });
    expect(resolveMoveKey("f")).toBeNull();
  });

  it("moves to a clicked tile next door, walks to one farther, and ignores the agent's own", () => {
    const agentPos = { x: 5, y: 5 };
    expect(buildTileAct(agentPos, { x: 6, y: 4 })).toEqual({
      action: "move",
      direction: { x: 1, y: -1 },
    });
    expect(buildTileAct(agentPos, { x: 9, y: 5 })).toEqual({
      action: "walk_to",
      pos: { x: 9, y: 5 },
    });
    expect(buildTileAct(agentPos, agentPos)).toBeNull();
  });

  it("talks while carrying on with work, and waits for an answer when idle or waiting", () => {
    const baking = { kind: "use", verb: "bake bread", endsAtTick: 40 };
    expect(buildTalkAct(" Hello ", "normal", baking)).toEqual({
      action: "continue",
      say: "Hello",
      volume: "normal",
    });
    expect(buildTalkAct("Hello", "shout", null)).toMatchObject({ action: "wait", say: "Hello" });
    const waiting = { kind: "wait", endsAtTick: 12 };
    expect(buildTalkAct("Hello", "normal", waiting)).toMatchObject({ action: "wait" });
    expect(buildTalkAct("   ", "normal", null)).toBeNull();
  });

  it("does an option at once only when it needs nothing more chosen", () => {
    expect(isOptionReady(EAT)).toBe(true);
    expect(isOptionReady({ ...EAT, targets: ["Jess"] })).toBe(false);
    expect(isOptionReady({ ...EAT, takes: ["amount"] })).toBe(false);
  });

  it("turns an option into an interact with only the extras it takes", () => {
    const writeNote: PlayerVerbOption = {
      label: "write a note",
      verb: "write a note",
      item: "paper",
      from: "desk drawer",
      targets: null,
      takes: ["text"],
    };
    expect(buildOptionAct(writeNote, { text: " Meet at noon ", amount: 3 })).toEqual({
      action: "interact",
      verb: "write a note",
      item: "paper",
      from: "desk drawer",
      text: "Meet at noon",
    });
    const punch = { ...EAT, label: "punch", verb: "punch", item: null, targets: ["Bram"] };
    expect(buildOptionAct(punch, { target: "Bram" })).toEqual({
      action: "interact",
      verb: "punch",
      target: "Bram",
    });
  });

  it("gives with something asked back only when the player names it", () => {
    const choices = { person: "Jess", item: "bread", amount: 2, inReturn: "", inReturnAmount: 1 };
    expect(buildGiveAct(choices)).toEqual({
      action: "give",
      target: "Jess",
      item: "bread",
      amount: 2,
    });
    expect(buildGiveAct({ ...choices, inReturn: "coin", inReturnAmount: 5 })).toMatchObject({
      inReturn: "coin",
      inReturnAmount: 5,
    });
  });
});
