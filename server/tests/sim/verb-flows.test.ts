import type { Entity, Position } from "@village/shared";
import { describe, expect, it } from "vitest";
import { countHeld, createEntity, findEntity, listContents } from "../../src/items/entity-store";
import { readField } from "../../src/items/things";
import { wakeAgent } from "../../src/sim/action-stopping";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import {
  NEXT_TO_SQUARE,
  SQUARE,
  aim,
  buildCombatSim,
  contextOf,
  finish,
  fixRolls,
  handOver,
  lastFailure,
  memoryTexts,
  place,
  readHealth,
} from "./combat-test-kit";
import {
  createTestSim,
  decisionReply,
  promptOf,
  findEntityByLabel,
  scriptByAgent,
} from "../../src/sim/test-sim";
import type { TestSim } from "../../src/sim/test-sim";
import { progressActions } from "../../src/sim/tick-phases";
import { advanceWalk } from "../../src/sim/walking";
import { replaceAgent } from "../../src/sim/world-access";

const ALWAYS_HIT = 0;
const FOUR_TILES_AWAY = { x: 23, y: 15 };

function positionOf(sim: TestSim, label: string): Position {
  const { location } = findEntityByLabel(sim.state, label);
  if (location.kind !== "tile") throw new Error(`"${label}" isn't on a tile`);
  return location.pos;
}

function standOn(sim: TestSim, agentId: string, label: string): void {
  sim.placeAgent(agentId, positionOf(sim, label));
}

function healthOf(sim: TestSim, entity: Entity): number {
  const value = readField(sim.state, { kind: "entity", entityId: entity.id }, "health.current");
  return typeof value === "number" ? value : Number.NaN;
}

describe("everyday verbs", () => {
  it("eats held bread, which fills hunger once the meal is over", () => {
    const sim = buildCombatSim(["mara"]);
    const hungerBefore = sim.agent("mara").needs.hunger;
    const breadBefore = countHeld(sim.state, "mara", "bread");
    aim(sim, "mara", { verb: "eat", itemName: "bread" });
    expect(countHeld(sim.state, "mara", "bread")).toBe(breadBefore - 1);
    expect(sim.agent("mara").currentAction?.verb).toBe("eat");
    finish(sim, "mara");
    expect(sim.agent("mara").needs.hunger).toBeGreaterThan(hungerBefore);
    expect(memoryTexts(sim, "mara")).toContain("I finished eating bread");
  });

  it("harvests wheat from the field: the wheat arrives and the stock drops when the work ends", () => {
    const sim = buildCombatSim(["mara"]);
    standOn(sim, "mara", "wheat field");
    const field = findEntityByLabel(sim.state, "wheat field");
    const wheatBefore = countHeld(sim.state, "mara", "wheat");
    aim(sim, "mara", { verb: "harvest", itemName: "wheat field" });
    const stock = (): unknown =>
      readField(sim.state, { kind: "entity", entityId: field.id }, "stock.amount");
    expect(stock()).toBe(12);
    expect(countHeld(sim.state, "mara", "wheat")).toBe(wheatBefore);
    finish(sim, "mara");
    expect(countHeld(sim.state, "mara", "wheat")).toBe(wheatBefore + 3);
    expect(stock()).toBe(9);
  });

  it("sleeps in the bed, which the run keeps until the sleeper wakes", () => {
    const sim = buildCombatSim(["mara"]);
    standOn(sim, "mara", "rose cottage bed");
    const bed = findEntityByLabel(sim.state, "rose cottage bed");
    aim(sim, "mara", { verb: "sleep", itemName: "rose cottage bed" });
    expect(sim.agent("mara").currentAction?.kind).toBe("sleep");
    expect(getAgentRuntime(sim.state, "mara").verbRun?.itemIds).toEqual([bed.id]);
    wakeAgent(contextOf(sim), "mara");
    expect(getAgentRuntime(sim.state, "mara").verbRun).toBeNull();
    expect(sim.agent("mara").currentAction).toBeNull();
  });

  it("tells a sleeper who wakes on their own why they woke", () => {
    const sim = buildCombatSim(["mara"]);
    standOn(sim, "mara", "rose cottage bed");
    aim(sim, "mara", { verb: "sleep", itemName: "rose cottage bed" });
    const sleeper = sim.agent("mara");
    replaceAgent(sim.state, { ...sleeper, needs: { ...sleeper.needs, energy: 1 } });
    const context = contextOf(sim);
    progressActions(context);
    const woke = context.result.events.find((event) => event.kind === "woke");
    expect(woke?.description).toBe("woke up rested in the rose cottage bed");
    expect(woke?.actorDescription).toBe(
      "woke up in the rose cottage bed after 0 min of sleep, fully rested: I can't sleep again until I'm tired",
    );
  });

  it("tells a sleeper woken by hunger that they must eat before sleeping again", () => {
    const sim = buildCombatSim(["mara"]);
    standOn(sim, "mara", "rose cottage bed");
    aim(sim, "mara", { verb: "sleep", itemName: "rose cottage bed" });
    const sleeper = sim.agent("mara");
    replaceAgent(sim.state, { ...sleeper, needs: { ...sleeper.needs, hunger: 0 } });
    sim.state.tick += 90;
    const context = contextOf(sim);
    progressActions(context);
    const woke = context.result.events.find((event) => event.kind === "woke");
    expect(woke?.description).toBe("woke up hungry in the rose cottage bed");
    expect(woke?.actorDescription).toBe(
      "woke up in the rose cottage bed after 1 h 30 min of sleep because hunger won't let me stay asleep: I can't sleep again until I've eaten",
    );
  });

  it("walks to an item lying out of reach, then picks it up", () => {
    const sim = buildCombatSim(["mara"]);
    place(sim, { mara: SQUARE });
    const knife = createEntity(sim.state, "knife", {
      kind: "tile",
      place: "town square",
      pos: FOUR_TILES_AWAY,
    });
    aim(sim, "mara", { verb: "pick up", itemName: "knife" });
    expect(sim.agent("mara").currentAction?.kind).toBe("walk_to");
    for (let count = 0; count < 4; count += 1) {
      advanceWalk(contextOf(sim), "mara");
      sim.state.tick += 1;
    }
    expect(findEntity(sim.state, knife.id).location).toEqual({ kind: "inside", holderId: "mara" });
  });
});

describe("fighting", () => {
  it("punches bare-handed and hurts the target on a hit", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    fixRolls(sim, ALWAYS_HIT);
    aim(sim, "mara", { verb: "punch", targetName: "Tobias" });
    finish(sim, "mara");
    expect(readHealth(sim, "tobias")).toBeLessThan(1);
  });

  it("loads the gun with put, then a shot uses up a bullet", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    const gun = handOver(sim, "mara", "gun");
    for (let made = 0; made < 3; made += 1) handOver(sim, "mara", "bullet");
    aim(sim, "mara", { verb: "put", itemName: "bullet", targetName: "gun", amount: 2 });
    expect(listContents(sim.state, gun.id)).toHaveLength(2);
    expect(countHeld(sim.state, "mara", "bullet")).toBe(1);
    fixRolls(sim, ALWAYS_HIT);
    aim(sim, "mara", { verb: "shoot", itemName: "gun", targetName: "Tobias" });
    finish(sim, "mara");
    expect(listContents(sim.state, gun.id)).toHaveLength(1);
    expect(readHealth(sim, "tobias")).toBeLessThan(1);
  });

  it("can't shoot an empty gun", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    handOver(sim, "mara", "gun");
    aim(sim, "mara", { verb: "shoot", itemName: "gun", targetName: "Tobias" });
    expect(lastFailure(sim, "mara")).toContain("I tried to shoot Tobias with a gun but");
    expect(readHealth(sim, "tobias")).toBe(1);
  });

  it("shoots from further than arm's length, as far as the gun reaches", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: FOUR_TILES_AWAY });
    const gun = handOver(sim, "mara", "gun");
    createEntity(sim.state, "bullet", { kind: "inside", holderId: gun.id });
    fixRolls(sim, ALWAYS_HIT);
    aim(sim, "mara", { verb: "shoot", itemName: "gun", targetName: "Tobias" });
    expect(sim.agent("mara").currentAction?.verb).toBe("shoot");
  });
});

describe("choosing the item", () => {
  it("uses a held thing for a verb it offers, and one inside the chest for the verb it doesn't", () => {
    const sim = buildCombatSim();
    place(sim, { mara: { x: 29, y: 17 } });
    const chest = findEntityByLabel(sim.state, "tavern chest");
    const held = handOver(sim, "mara", "bandage");
    const inChest = createEntity(sim.state, "bandage", { kind: "inside", holderId: chest.id });
    aim(sim, "mara", { verb: "take", itemName: "bandage", fromName: "tavern chest" });
    expect(findEntity(sim.state, inChest.id).location).toEqual({
      kind: "inside",
      holderId: "mara",
    });
    aim(sim, "mara", { verb: "drop", itemName: "bandage" });
    expect(findEntity(sim.state, held.id).location.kind).toBe("tile");
  });

  it("takes from the holder the reply names when two things hold the same item", () => {
    const sim = buildCombatSim();
    place(sim, { mara: { x: 29, y: 17 } });
    const chest = findEntityByLabel(sim.state, "tavern chest");
    const gun = handOver(sim, "mara", "gun");
    const chestBullet = createEntity(sim.state, "bullet", { kind: "inside", holderId: chest.id });
    const gunBullet = createEntity(sim.state, "bullet", { kind: "inside", holderId: gun.id });
    aim(sim, "mara", { verb: "take", itemName: "bullet", fromName: "gun" });
    expect(findEntity(sim.state, gunBullet.id).location.kind).toBe("inside");
    expect(findEntity(sim.state, gunBullet.id).location).toEqual({
      kind: "inside",
      holderId: "mara",
    });
    expect(findEntity(sim.state, chestBullet.id).location).toEqual({
      kind: "inside",
      holderId: chest.id,
    });
  });

  it("takes fewer than asked when that is all there is", () => {
    const sim = buildCombatSim();
    place(sim, { mara: { x: 29, y: 17 } });
    const chest = findEntityByLabel(sim.state, "tavern chest");
    createEntity(sim.state, "bandage", { kind: "inside", holderId: chest.id });
    aim(sim, "mara", { verb: "take", itemName: "bandages", fromName: "tavern chest", amount: 5 });
    expect(countHeld(sim.state, "mara", "bandage")).toBe(1);
    expect(memoryTexts(sim, "mara")).toContain("I took bandage from the tavern chest");
  });

  it("wears the weapon down with each strike", () => {
    const sim = buildCombatSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    const knife = handOver(sim, "mara", "knife");
    fixRolls(sim, ALWAYS_HIT);
    aim(sim, "mara", { verb: "attack", itemName: "knife", targetName: "Tobias" });
    finish(sim, "mara");
    expect(healthOf(sim, knife)).toBeCloseTo(4 - 0.02, 9);
  });
});

describe("notes on the board", () => {
  const BOARD = "notice board";

  function postNote(sim: TestSim, text: string): void {
    standOn(sim, "mara", BOARD);
    aim(sim, "mara", { verb: "post a note", itemName: BOARD, text });
    finish(sim, "mara");
  }

  it("posts a note on the board, which a reader of the board then remembers", () => {
    const sim = buildCombatSim();
    postNote(sim, "Bread at noon");
    const board = findEntityByLabel(sim.state, BOARD);
    expect(listContents(sim.state, board.id)).toHaveLength(1);
    standOn(sim, "tobias", BOARD);
    aim(sim, "tobias", { verb: "read", itemName: BOARD });
    finish(sim, "tobias");
    expect(memoryTexts(sim, "tobias").some((text) => text.includes("Bread at noon"))).toBe(true);
  });

  it("takes a note off the board", () => {
    const sim = buildCombatSim();
    postNote(sim, "Bread at noon");
    aim(sim, "mara", { verb: "take", itemName: "note", fromName: BOARD });
    const board = findEntityByLabel(sim.state, BOARD);
    expect(listContents(sim.state, board.id)).toHaveLength(0);
    expect(countHeld(sim.state, "mara", "note")).toBe(1);
  });

  it("hands a taken note over, and the next holder reads it", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "tobias"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0
            ? decisionReply({ action: "give", target: "Tobias", item: "note", amount: 1 })
            : undefined,
        Tobias: (request) =>
          promptOf(request).includes("is offering you")
            ? decisionReply({ action: "continue", offer: "accept" })
            : undefined,
      }),
    });
    standOn(sim, "mara", BOARD);
    sim.placeAgent("tobias", positionOf(sim, BOARD));
    aim(sim, "mara", { verb: "post a note", itemName: BOARD, text: "Meet at the well" });
    finish(sim, "mara");
    aim(sim, "mara", { verb: "take", itemName: "note", fromName: BOARD });
    await sim.advance(2);
    expect(countHeld(sim.state, "tobias", "note")).toBe(1);
    aim(sim, "tobias", { verb: "read", itemName: "note" });
    finish(sim, "tobias");
    expect(memoryTexts(sim, "tobias").some((text) => text.includes("Meet at the well"))).toBe(true);
  });
});
