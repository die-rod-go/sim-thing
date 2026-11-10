import { describe, expect, it } from "vitest";
import type { Agent, WorldObject } from "@village/shared";
import { config } from "../config";
import {
  cancelInteraction,
  describeInteractionOption,
  finishInteraction,
  listAvailableInteractions,
  startInteraction,
  type StartedInteraction,
} from "./interactions";
import { makeAgent, makeObject } from "./testFixtures";

function expectStarted(result: ReturnType<typeof startInteraction>): StartedInteraction {
  if (!result.isSuccess) {
    throw new Error(`Expected success, got: ${result.reason}`);
  }
  return result;
}

function finish(started: StartedInteraction): { agent: Agent; object: WorldObject | null } {
  return finishInteraction(started);
}

describe("listing interactions", () => {
  it("marks missing inputs for an object's interactions", () => {
    const agent = makeAgent({ inventory: { wheat: 2 } });
    const [option] = listAvailableInteractions(agent, makeObject("oven", "oven"));
    expect(option?.name).toBe("bake bread");
    expect(option?.missingInputs).toEqual({ wood: 1 });
    expect(option?.isStockEmpty).toBe(false);
  });

  it("describes an option with what is missing", () => {
    const agent = makeAgent({ inventory: { wheat: 2 } });
    const [option] = listAvailableInteractions(agent, makeObject("oven", "oven"));
    expect(option && describeInteractionOption(option)).toBe(
      "bake bread (needs 2 wheat, 1 wood; you are missing 1 wood)",
    );
  });

  it("marks an empty field", () => {
    const field = makeObject("wheat_field", "wheat field", { stock: 2.5 });
    const [option] = listAvailableInteractions(makeAgent(), field);
    expect(option?.isStockEmpty).toBe(true);
    expect(option && describeInteractionOption(option)).toBe(
      "harvest wheat (the wheat field is empty)",
    );
  });

  it("lists interactions for a held item", () => {
    const options = listAvailableInteractions(makeAgent({ inventory: { bread: 1 } }), "Bread");
    expect(options.map((option) => describeInteractionOption(option))).toEqual([
      "eat (needs 1 bread)",
    ]);
  });
});

describe("starting and finishing interactions", () => {
  it("baking consumes 2 wheat and 1 wood and yields 4 bread when finished", () => {
    const agent = makeAgent({ inventory: { wheat: 3, wood: 1 } });
    const started = expectStarted(
      startInteraction({
        agent,
        target: makeObject("oven", "oven"),
        interaction: "Bake Bread",
        tick: 100,
      }),
    );
    expect(started.agent.inventory).toEqual({ wheat: 1 });
    expect(started.agent.currentAction).toEqual({
      kind: "interact",
      target: "oven",
      endsAtTick: 190,
    });
    expect(started.record.interaction).toBe("bake bread");
    const finished = finish(started);
    expect(finished.agent.inventory).toEqual({ wheat: 1, bread: 4 });
    expect(finished.agent.currentAction).toBeNull();
    expect(finished.agent.needs.energy).toBeCloseTo(0.75, 9);
  });

  it("baking fails without wood and explains what is missing", () => {
    const agent = makeAgent({ inventory: { wheat: 1 } });
    const result = startInteraction({
      agent,
      target: makeObject("oven", "oven"),
      interaction: "bake bread",
      tick: 0,
    });
    expect(result).toEqual({
      isSuccess: false,
      reason: "I don't have enough wheat: I need 2 and have 1; I don't have any wood: I need 1",
    });
  });

  it("fails for an interaction the object doesn't offer", () => {
    const result = startInteraction({
      agent: makeAgent(),
      target: makeObject("oven", "oven"),
      interaction: "brew ale",
      tick: 0,
    });
    expect(result).toEqual({ isSuccess: false, reason: "The oven doesn't do 'brew ale'" });
  });

  it("harvesting takes stock at the start and wheat at the finish", () => {
    const field = makeObject("wheat_field", "wheat field", { stock: 12 });
    const started = expectStarted(
      startInteraction({
        agent: makeAgent(),
        target: field,
        interaction: "harvest wheat",
        tick: 0,
      }),
    );
    expect(started.object?.state.stock).toBe(9);
    expect(finish(started).agent.inventory).toEqual({ wheat: 3 });
  });

  it("harvesting fails when the field is empty", () => {
    const field = makeObject("wheat_field", "wheat field", { stock: 2 });
    const result = startInteraction({
      agent: makeAgent(),
      target: field,
      interaction: "harvest wheat",
      tick: 0,
    });
    expect(result).toEqual({ isSuccess: false, reason: "The wheat field is empty" });
  });

  it("eating bread restores hunger", () => {
    const agent = makeAgent({
      inventory: { bread: 2 },
      needs: { hunger: 0.3, energy: 0.8, social: 0.8, fun: 0.8 },
    });
    const started = expectStarted(
      startInteraction({ agent, target: "bread", interaction: "eat", tick: 0 }),
    );
    expect(started.object).toBeNull();
    const finished = finish(started);
    expect(finished.agent.needs.hunger).toBeCloseTo(0.8, 9);
    expect(finished.agent.inventory).toEqual({ bread: 1 });
  });

  it("eating fails without bread", () => {
    const result = startInteraction({
      agent: makeAgent(),
      target: "bread",
      interaction: "eat",
      tick: 0,
    });
    expect(result).toEqual({ isSuccess: false, reason: "I don't have any bread: I need 1" });
  });

  it("playing cards gives extra fun per other player", () => {
    const table = makeObject("card_table", "card table", { userIds: ["bob", "cora"] });
    const agent = makeAgent({ needs: { hunger: 0.8, energy: 0.8, social: 0.8, fun: 0.2 } });
    const started = expectStarted(
      startInteraction({ agent, target: table, interaction: "play cards", tick: 0 }),
    );
    expect(started.object?.state.userIds).toEqual(["bob", "cora", "mara"]);
    const finished = finish(started);
    const expectedFun = 0.2 + 0.2 + 2 * config.playCards.funPerOtherPlayer;
    expect(finished.agent.needs.fun).toBeCloseTo(expectedFun, 9);
    expect(finished.object?.state.userIds).toEqual(["bob", "cora"]);
  });

  it("cancelling frees the object and refunds nothing", () => {
    const agent = makeAgent({ inventory: { wheat: 2, wood: 1 } });
    const started = expectStarted(
      startInteraction({
        agent,
        target: makeObject("oven", "oven"),
        interaction: "bake bread",
        tick: 0,
      }),
    );
    const cancelled = cancelInteraction(started);
    expect(cancelled.agent.inventory).toEqual({});
    expect(cancelled.agent.currentAction).toBeNull();
    expect(cancelled.object?.state.userIds).toEqual([]);
  });

  it("posting a note through the board needs words", () => {
    const board = makeObject("notice_board", "notice board");
    const failed = startInteraction({
      agent: makeAgent(),
      target: board,
      interaction: "post a note",
      tick: 0,
    });
    expect(failed.isSuccess).toBe(false);
    const posted = expectStarted(
      startInteraction({
        agent: makeAgent(),
        target: board,
        interaction: "post a note",
        tick: 3,
        text: "Bread for 2 coins",
      }),
    );
    expect(posted.object?.state.notes).toEqual([
      { authorId: "mara", authorName: "Mara", text: "Bread for 2 coins", tick: 3 },
    ]);
  });

  it("reading the board through an interaction returns its notes", () => {
    const note = { authorId: "bob", authorName: "Bob", text: "Wood for sale", tick: 1 };
    const board = makeObject("notice_board", "notice board", { notes: [note] });
    const read = expectStarted(
      startInteraction({ agent: makeAgent(), target: board, interaction: "read", tick: 5 }),
    );
    expect(read.notesRead).toEqual([note]);
  });

  it("opening an open door fails", () => {
    const door = makeObject("door", "bakery door", { isOpen: true });
    const result = startInteraction({
      agent: makeAgent(),
      target: door,
      interaction: "open",
      tick: 0,
    });
    expect(result).toEqual({ isSuccess: false, reason: "Bakery door is already open" });
  });

  it("sleeping in a bed starts sleep with no end tick", () => {
    const bed = makeObject("bed", "Mara's bed");
    const started = expectStarted(
      startInteraction({ agent: makeAgent(), target: bed, interaction: "sleep", tick: 10 }),
    );
    expect(started.agent.currentAction).toEqual({
      kind: "sleep",
      target: "Mara's bed",
      endsAtTick: null,
    });
    expect(started.record.startedAtTick).toBe(10);
  });
});
