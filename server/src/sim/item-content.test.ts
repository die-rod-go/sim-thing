import { describe, expect, it } from "vitest";
import { config } from "../config";
import { countHeld, findEntity, listContents } from "../items/entity-store";
import { addComponent } from "../items/thing-writes";
import { readField, type ThingRef } from "../items/things";
import { SQUARE, aim, contextOf, finish, handOver, lastFailure, setField } from "./combat-test-kit";
import { ALWAYS, NEVER, placeThing, runTicks, setUpRules } from "./rule-test-kit";
import type { TestSim } from "./test-sim";

const TICKS_PER_HOUR = Math.ceil(60 / config.clock.minutesPerTick);

function definitionOf(sim: TestSim, thing: ThingRef): string {
  if (thing.kind !== "entity") throw new Error("not an entity");
  return findEntity(sim.state, thing.entityId).definitionId;
}

function numberAt(sim: TestSim, thing: ThingRef, path: string): number {
  const value = readField(sim.state, thing, path);
  return typeof value === "number" ? value : Number.NaN;
}

function giveSome(sim: TestSim, definitionId: string, count: number): void {
  for (let given = 0; given < count; given += 1) handOver(sim, "mara", definitionId);
}

function doVerb(sim: TestSim, verb: string, itemName: string, targetName?: string): void {
  aim(sim, "mara", { verb, itemName, ...(targetName === undefined ? {} : { targetName }) });
  if (sim.agent("mara").currentAction !== null) finish(sim, "mara");
}

describe("resource nodes", () => {
  it("mines ore from a vein with a pickaxe, wearing the pickaxe down", () => {
    const sim = setUpRules();
    const vein = placeThing(sim, "iron_vein", SQUARE);
    const pickaxe = handOver(sim, "mara", "pickaxe");
    doVerb(sim, "mine", "iron vein");
    expect(countHeld(sim.state, "mara", "iron_ore")).toBe(1);
    expect(numberAt(sim, vein, "stock.amount")).toBe(7);
    expect(numberAt(sim, { kind: "entity", entityId: pickaxe.id }, "health.current")).toBeLessThan(
      4,
    );
  });

  it("refuses to mine without a pickaxe", () => {
    const sim = setUpRules();
    placeThing(sim, "iron_vein", SQUARE);
    doVerb(sim, "mine", "iron vein");
    expect(countHeld(sim.state, "mara", "iron_ore")).toBe(0);
    expect(lastFailure(sim, "mara")).toMatch(/^I tried to mine the iron vein but /);
  });

  it("turns a vein whose stock runs out into a depleted vein", () => {
    const sim = setUpRules();
    const vein = placeThing(sim, "coal_vein", SQUARE);
    setField(sim, vein, "stock.amount", 1);
    handOver(sim, "mara", "pickaxe");
    doVerb(sim, "mine", "coal vein");
    expect(countHeld(sim.state, "mara", "coal")).toBe(1);
    expect(definitionOf(sim, vein)).toBe("depleted_vein");
  });

  it("fells a tree into wood and a stump, and the stump grows into a young tree", () => {
    const sim = setUpRules();
    const tree = placeThing(sim, "tree", SQUARE);
    handOver(sim, "mara", "axe");
    const woodBefore = countHeld(sim.state, "mara", "wood");
    doVerb(sim, "chop down", "tree");
    expect(countHeld(sim.state, "mara", "wood")).toBe(woodBefore + 6);
    expect(definitionOf(sim, tree)).toBe("stump");
    setField(sim, tree, "turns_into.hoursLeft", 1);
    runTicks(sim, TICKS_PER_HOUR);
    expect(definitionOf(sim, tree)).toBe("young_tree");
  });

  it("catches a fish at a fishing spot when the roll goes well", () => {
    const sim = setUpRules(ALWAYS);
    placeThing(sim, "fishing_spot", SQUARE);
    handOver(sim, "mara", "fishing_rod");
    doVerb(sim, "fish", "fishing spot");
    expect(countHeld(sim.state, "mara", "fish")).toBe(1);
  });

  it("catches nothing at a fishing spot when the roll goes badly", () => {
    const sim = setUpRules(NEVER);
    placeThing(sim, "fishing_spot", SQUARE);
    handOver(sim, "mara", "fishing_rod");
    doVerb(sim, "fish", "fishing spot");
    expect(countHeld(sim.state, "mara", "fish")).toBe(0);
  });

  it("draws water from a well with a bucket and keeps the bucket", () => {
    const sim = setUpRules();
    placeThing(sim, "well", SQUARE);
    handOver(sim, "mara", "bucket");
    doVerb(sim, "draw water", "well");
    expect(countHeld(sim.state, "mara", "water")).toBe(1);
    expect(countHeld(sim.state, "mara", "bucket")).toBe(1);
  });

  it("sows wheat in an empty field only with a hoe, and it grows into a wheat field", () => {
    const sim = setUpRules();
    const field = placeThing(sim, "empty_field", SQUARE);
    giveSome(sim, "wheat", 2);
    const wheatBefore = countHeld(sim.state, "mara", "wheat");
    doVerb(sim, "sow wheat", "empty field");
    expect(definitionOf(sim, field)).toBe("empty_field");
    handOver(sim, "mara", "hoe");
    doVerb(sim, "sow wheat", "empty field");
    expect(definitionOf(sim, field)).toBe("young_wheat");
    expect(countHeld(sim.state, "mara", "wheat")).toBe(wheatBefore - 2);
    setField(sim, field, "turns_into.hoursLeft", 1);
    runTicks(sim, TICKS_PER_HOUR);
    expect(definitionOf(sim, field)).toBe("wheat_field");
  });
});

describe("food and containers", () => {
  it("spoils carried bread into spoiled food when its hours run out", () => {
    const sim = setUpRules();
    const bread = handOver(sim, "mara", "bread");
    const thing: ThingRef = { kind: "entity", entityId: bread.id };
    setField(sim, thing, "turns_into.hoursLeft", 1);
    runTicks(sim, TICKS_PER_HOUR);
    expect(definitionOf(sim, thing)).toBe("spoiled_food");
    expect(countHeld(sim.state, "mara", "spoiled_food")).toBe(1);
  });

  it("pours ale into a mug and gives the mug back once the ale is drunk", () => {
    const sim = setUpRules();
    const kettle = placeThing(sim, "brew_kettle", SQUARE);
    setField(sim, kettle, "stock.amount", 2);
    handOver(sim, "mara", "mug");
    doVerb(sim, "pour ale", "brew kettle");
    expect(countHeld(sim.state, "mara", "ale")).toBe(1);
    expect(countHeld(sim.state, "mara", "mug")).toBe(0);
    expect(numberAt(sim, kettle, "stock.amount")).toBe(1);
    doVerb(sim, "drink", "ale");
    expect(countHeld(sim.state, "mara", "ale")).toBe(0);
    expect(countHeld(sim.state, "mara", "mug")).toBe(1);
  });

  it("cooks stew into a carried pot, leaving ash in the fireplace", () => {
    const sim = setUpRules();
    const fireplace = placeThing(sim, "fireplace", SQUARE);
    const pot = handOver(sim, "mara", "cooking_pot");
    giveSome(sim, "firewood", 2);
    giveSome(sim, "water", 1);
    giveSome(sim, "fish", 1);
    giveSome(sim, "carrot", 1);
    giveSome(sim, "mushrooms", 1);
    doVerb(sim, "cook stew", "fireplace");
    expect(numberAt(sim, { kind: "entity", entityId: pot.id }, "stock.amount")).toBe(4);
    if (fireplace.kind !== "entity") throw new Error("not an entity");
    const ash = listContents(sim.state, fireplace.entityId).filter(
      (entity) => entity.definitionId === "ash",
    );
    expect(ash).toHaveLength(1);
    expect(countHeld(sim.state, "mara", "fish")).toBe(0);
  });
});

describe("locks", () => {
  it("won't open a locked door until a key unlocks it", () => {
    const sim = setUpRules();
    const door = placeThing(sim, "door", SQUARE);
    for (const component of ["closed", "fitted_lock", "locked"]) {
      addComponent(contextOf(sim), door, component, { minutes: null });
    }
    doVerb(sim, "open", "door");
    expect(lastFailure(sim, "mara")).not.toBeNull();
    handOver(sim, "mara", "key");
    doVerb(sim, "unlock", "door");
    doVerb(sim, "open", "door");
    if (door.kind !== "entity") throw new Error("not an entity");
    const { changes } = findEntity(sim.state, door.entityId);
    expect(Object.hasOwn(changes, "locked")).toBe(false);
    expect(Object.hasOwn(changes, "closed")).toBe(false);
  });
});
