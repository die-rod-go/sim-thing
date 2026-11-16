import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import {
  countHeld,
  findEntity,
  listContents,
  listHeldOfDefinition,
  locateInside,
  moveEntity,
} from "../../src/items/entity-store";
import { addComponent } from "../../src/items/thing-writes";
import { readField, type ThingRef } from "../../src/items/things";
import {
  BESIDE_SQUARE,
  SQUARE,
  aim,
  contextOf,
  entityThing,
  finish,
  handOver,
  lastFailure,
  memoryTexts,
  setField,
} from "./combat-test-kit";
import { ALWAYS, NEVER, placeThing, runTicks, setUpRules } from "./rule-test-kit";
import type { TestSim } from "../../src/sim/test-sim";

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

function heldIds(sim: TestSim, definitionId: string, path: string): unknown[] {
  return listHeldOfDefinition(sim.state, "mara", definitionId).map((entity) =>
    readField(sim.state, entityThing(entity), path),
  );
}

/** An anvil beside Mara and iron for each lock she forges, then the forging. */
function forgeLocks(sim: TestSim, count: number): void {
  placeThing(sim, "anvil", BESIDE_SQUARE);
  giveSome(sim, "iron_ingot", count);
  for (let forged = 0; forged < count; forged += 1) doVerb(sim, "forge lock", "anvil");
}

function hasComponentOn(sim: TestSim, thing: ThingRef, component: string): boolean {
  if (thing.kind !== "entity") throw new Error("not an entity");
  return Object.hasOwn(findEntity(sim.state, thing.entityId).changes, component);
}

describe("locks", () => {
  it("forges a lock and a key that share a new id, unlike the next pair", () => {
    const sim = setUpRules();
    forgeLocks(sim, 2);
    const lockIds = heldIds(sim, "lock", "lock.lockId");
    expect(heldIds(sim, "key", "key.lockId")).toEqual(lockIds);
    expect(new Set(lockIds).size).toBe(2);
    expect(lockIds.every((lockId) => typeof lockId === "string" && lockId !== "")).toBe(true);
  });

  it("fits a lock to a door, which then locks and unlocks only with its own key", () => {
    const sim = setUpRules();
    forgeLocks(sim, 1);
    const [lockId] = heldIds(sim, "lock", "lock.lockId");
    const door = placeThing(sim, "door", SQUARE);
    doVerb(sim, "fit", "lock", "door");
    expect(readField(sim.state, door, "fitted_lock.lockId")).toBe(lockId);
    addComponent(contextOf(sim), door, "closed", { minutes: null });
    doVerb(sim, "lock", "door");
    expect(hasComponentOn(sim, door, "locked")).toBe(true);

    const [ownKey] = listHeldOfDefinition(sim.state, "mara", "key");
    if (ownKey === undefined) throw new Error("no key was forged");
    moveEntity(sim.state, ownKey.id, locateInside("tobias"));
    setField(sim, entityThing(handOver(sim, "mara", "key")), "key.lockId", "another lock");
    doVerb(sim, "unlock", "door");
    expect(lastFailure(sim, "mara")).toMatch(/^I tried to unlock the door but /);
    expect(hasComponentOn(sim, door, "locked")).toBe(true);

    moveEntity(sim.state, ownKey.id, locateInside("mara"));
    doVerb(sim, "unlock", "door");
    doVerb(sim, "open", "door");
    expect(hasComponentOn(sim, door, "locked")).toBe(false);
    expect(hasComponentOn(sim, door, "closed")).toBe(false);
  });

  it("copies a key that opens the same lock as the original", () => {
    const sim = setUpRules();
    forgeLocks(sim, 1);
    const [lockId] = heldIds(sim, "lock", "lock.lockId");
    giveSome(sim, "iron_ingot", 1);
    doVerb(sim, "copy key", "anvil");
    expect(heldIds(sim, "key", "key.lockId")).toEqual([lockId, lockId]);
  });
});

describe("writing", () => {
  it("turns held paper into a note that carries the words and who wrote them", () => {
    const sim = setUpRules();
    const paper = handOver(sim, "mara", "paper");
    aim(sim, "mara", { verb: "write on", itemName: "paper", text: "Meet me at the well" });
    finish(sim, "mara");
    const note = entityThing(paper);
    expect(definitionOf(sim, note)).toBe("note");
    expect(readField(sim.state, note, "writing.text")).toBe("Meet me at the well");
    expect(readField(sim.state, note, "writing.author")).toBe("Mara");
    expect(countHeld(sim.state, "mara", "paper")).toBe(0);
  });
});

describe("a tool wearing out in the hand", () => {
  it("files the broken tool as the holder's own, and as theirs for onlookers", () => {
    const sim = setUpRules();
    placeThing(sim, "iron_vein", SQUARE);
    const pickaxe = handOver(sim, "mara", "pickaxe");
    setField(sim, entityThing(pickaxe), "health.current", 0.01);
    doVerb(sim, "mine", "iron vein");
    expect(countHeld(sim.state, "mara", "pickaxe")).toBe(0);
    expect(memoryTexts(sim, "mara")).toContain("My pickaxe broke");
    expect(memoryTexts(sim, "tobias")).toContain("I saw that Mara's pickaxe broke");
  });
});
