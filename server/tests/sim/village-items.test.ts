import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { buildDecisionPrompt } from "../../src/decision/decision-prompt";
import { isAsleep } from "../../src/economy/sleep";
import {
  countHeld,
  findEntityIfPresent,
  listContents,
  moveEntity,
  locateInside,
} from "../../src/items/entity-store";
import { loadItemCatalog } from "../../src/items/load-items";
import { readField, readThingId, type ThingRef } from "../../src/items/things";
import {
  NEXT_TO_SQUARE,
  SQUARE,
  aim,
  entityThing,
  finish,
  handOver,
  lastFailure,
  memoryTexts,
  setField,
} from "./combat-test-kit";
import { buildDecisionContext } from "../../src/sim/context-builder";
import {
  ALWAYS,
  NEVER,
  OPEN_GROUND,
  TOBIAS,
  hasComponentNow,
  placeThing,
  setUpRules,
} from "./rule-test-kit";
import { actForTicks } from "./creature-test-kit";
import type { TestSim } from "../../src/sim/test-sim";

/*
 * The shipped `seeds/items.json` at work: each economy chain from the items spec, run end to end
 * with the project's own content rather than the engine's test fixtures.
 */

const projectItems = loadItemCatalog(
  resolve(import.meta.dirname, "../../..", config.server.itemsPath),
  [],
);

/** Mara and Tobias side by side on the square, with the project's items and nothing placed yet. */
function setUpVillage(roll = NEVER): TestSim {
  const sim = setUpRules(roll);
  sim.state.items = projectItems;
  sim.state.entities = [];
  return sim;
}

function giveSome(sim: TestSim, agentId: string, definitionId: string, count: number): void {
  for (let given = 0; given < count; given += 1) handOver(sim, agentId, definitionId);
}

function doVerb(
  sim: TestSim,
  agentId: string,
  verb: string,
  itemName?: string,
  targetName?: string,
  text?: string,
): void {
  aim(sim, agentId, {
    verb,
    ...(itemName === undefined ? {} : { itemName }),
    ...(targetName === undefined ? {} : { targetName }),
    ...(text === undefined ? {} : { text }),
  });
  if (sim.agent(agentId).currentAction !== null) finish(sim, agentId);
}

function numberAt(sim: TestSim, thing: ThingRef, path: string): number {
  const value = readField(sim.state, thing, path);
  return typeof value === "number" ? value : Number.NaN;
}

function heldOf(sim: TestSim, agentId: string, definitionId: string): ThingRef[] {
  return listContents(sim.state, agentId)
    .filter((entity) => entity.definitionId === definitionId)
    .map(entityThing);
}

function poisonEndOf(sim: TestSim, agentId: string): number | null | undefined {
  return sim.agent(agentId).bodyChanges.poisoned?.endsAtTick;
}

describe("gathering", () => {
  it("harvests two wheat from a wheat field and takes two from its stock", () => {
    const sim = setUpVillage();
    const field = placeThing(sim, "wheat_field", SQUARE);
    doVerb(sim, "mara", "harvest", "wheat field");
    expect(countHeld(sim.state, "mara", "wheat")).toBe(2);
    expect(numberAt(sim, field, "stock.amount")).toBe(10);
  });

  it("refuses to harvest a field with less than one harvest left", () => {
    const sim = setUpVillage();
    const field = placeThing(sim, "wheat_field", SQUARE);
    setField(sim, field, "stock.amount", 1);
    doVerb(sim, "mara", "harvest", "wheat field");
    expect(countHeld(sim.state, "mara", "wheat")).toBe(0);
    expect(lastFailure(sim, "mara")).toMatch(/isn't enough left/);
  });

  it("slaughters a pig with a cleaver for two raw meat", () => {
    const sim = setUpVillage();
    const pig = placeThing(sim, "pig", SQUARE);
    if (pig.kind !== "entity") throw new Error("expected the pig to be an entity");
    handOver(sim, "mara", "cleaver");
    doVerb(sim, "mara", "slaughter", "pig");
    expect(countHeld(sim.state, "mara", "raw_meat")).toBe(2);
    expect(findEntityIfPresent(sim.state, pig.entityId)).toBeUndefined();
  });

  it("refuses to slaughter without a cleaver", () => {
    const sim = setUpVillage();
    placeThing(sim, "pig", SQUARE);
    doVerb(sim, "mara", "slaughter", "pig");
    expect(countHeld(sim.state, "mara", "raw_meat")).toBe(0);
  });

  it("fells a tree into four wood and a stump with an axe", () => {
    const sim = setUpVillage();
    const tree = placeThing(sim, "tree", SQUARE);
    handOver(sim, "mara", "axe");
    doVerb(sim, "mara", "chop down", "tree");
    expect(countHeld(sim.state, "mara", "wood")).toBe(4);
    expect(hasComponentNow(sim, tree, "turns_into")).toBe(true);
  });

  it("mines the last diamond from a vein and leaves a spent vein", () => {
    const sim = setUpVillage();
    const vein = placeThing(sim, "diamond_vein", SQUARE);
    setField(sim, vein, "stock.amount", 1);
    handOver(sim, "mara", "pickaxe");
    doVerb(sim, "mara", "mine", "diamond vein");
    expect(countHeld(sim.state, "mara", "diamond")).toBe(1);
    expect(hasComponentNow(sim, vein, "minable")).toBe(false);
  });

  it("catches a fish at the lake on a lucky roll", () => {
    const sim = setUpVillage(ALWAYS);
    placeThing(sim, "lake", SQUARE);
    handOver(sim, "mara", "fishing_rod");
    doVerb(sim, "mara", "fish", "lake");
    expect(countHeld(sim.state, "mara", "raw_fish")).toBe(1);
  });

  it("draws water from the well without a tool", () => {
    const sim = setUpVillage();
    placeThing(sim, "well", SQUARE);
    doVerb(sim, "mara", "draw water", "well");
    expect(countHeld(sim.state, "mara", "water")).toBe(1);
  });
});

describe("recipes", () => {
  it("bakes two bread from wheat and water at the oven", () => {
    const sim = setUpVillage();
    placeThing(sim, "oven", SQUARE);
    giveSome(sim, "mara", "wheat", 1);
    giveSome(sim, "mara", "water", 1);
    doVerb(sim, "mara", "bake bread", "oven");
    expect(countHeld(sim.state, "mara", "bread")).toBe(2);
    expect(countHeld(sim.state, "mara", "wheat")).toBe(0);
    expect(countHeld(sim.state, "mara", "water")).toBe(0);
  });

  it("cooks raw fish into cooked fish at the oven", () => {
    const sim = setUpVillage();
    placeThing(sim, "oven", SQUARE);
    giveSome(sim, "mara", "raw_fish", 1);
    doVerb(sim, "mara", "cook fish", "oven");
    expect(countHeld(sim.state, "mara", "cooked_fish")).toBe(1);
  });

  it("refuses a recipe missing an ingredient and uses up nothing", () => {
    const sim = setUpVillage();
    placeThing(sim, "anvil", SQUARE);
    giveSome(sim, "mara", "iron", 1);
    giveSome(sim, "mara", "wood", 1);
    doVerb(sim, "mara", "forge a sword", "anvil");
    expect(countHeld(sim.state, "mara", "sword")).toBe(0);
    expect(countHeld(sim.state, "mara", "iron")).toBe(1);
    expect(lastFailure(sim, "mara")).toMatch(/iron/);
  });

  it("places a made bed on the maker's tile instead of in their hands", () => {
    const sim = setUpVillage();
    placeThing(sim, "carpentry_table", NEXT_TO_SQUARE);
    giveSome(sim, "mara", "wood", 4);
    doVerb(sim, "mara", "make a bed", "carpentry table");
    expect(countHeld(sim.state, "mara", "bed")).toBe(0);
    const beds = sim.state.entities.filter((entity) => entity.definitionId === "bed");
    expect(beds).toHaveLength(1);
    expect(beds[0]?.location).toMatchObject({ kind: "tile", pos: sim.agent("mara").pos });
  });

  it("brews a fire flask from fireweed and ale at the cauldron", () => {
    const sim = setUpVillage();
    placeThing(sim, "cauldron", SQUARE);
    giveSome(sim, "mara", "fireweed", 1);
    giveSome(sim, "mara", "ale", 1);
    doVerb(sim, "mara", "brew a fire flask", "cauldron");
    expect(countHeld(sim.state, "mara", "fire_flask")).toBe(1);
  });
});

describe("locks and keys", () => {
  /** Mara forges a lock at the anvil and fits it to a chest beside her; returns the chest. */
  function setUpLockedChest(sim: TestSim): ThingRef {
    placeThing(sim, "anvil", SQUARE);
    const chest = placeThing(sim, "chest", SQUARE);
    giveSome(sim, "mara", "iron", 1);
    doVerb(sim, "mara", "forge a lock", "anvil");
    doVerb(sim, "mara", "fit", "lock", "chest");
    doVerb(sim, "mara", "lock", "chest");
    return chest;
  }

  it("forges a lock and a key that share a fresh lock id", () => {
    const sim = setUpVillage();
    placeThing(sim, "anvil", SQUARE);
    giveSome(sim, "mara", "iron", 2);
    doVerb(sim, "mara", "forge a lock", "anvil");
    doVerb(sim, "mara", "forge a lock", "anvil");
    const lockIds = heldOf(sim, "mara", "lock").map((lock) =>
      readField(sim.state, lock, "lock.lockId"),
    );
    const keyIds = heldOf(sim, "mara", "key").map((key) => readField(sim.state, key, "key.lockId"));
    expect(keyIds).toEqual(lockIds);
    expect(new Set(lockIds).size).toBe(2);
    expect(lockIds.every((lockId) => typeof lockId === "string" && lockId !== "")).toBe(true);
  });

  it("locks a fitted chest with its key, hiding and closing it to others", () => {
    const sim = setUpVillage();
    const chest = setUpLockedChest(sim);
    expect(hasComponentNow(sim, chest, "locked")).toBe(true);
    giveSome(sim, "tobias", "bread", 1);
    doVerb(sim, "tobias", "put", "bread", "chest");
    expect(countHeld(sim.state, "tobias", "bread")).toBe(1);
  });

  it("won't unlock with a key made for a different lock", () => {
    const sim = setUpVillage();
    const chest = setUpLockedChest(sim);
    giveSome(sim, "tobias", "iron", 1);
    doVerb(sim, "tobias", "forge a lock", "anvil");
    doVerb(sim, "tobias", "unlock", "chest");
    expect(hasComponentNow(sim, chest, "locked")).toBe(true);
  });

  it("unlocks with a copy of the right key", () => {
    const sim = setUpVillage();
    const chest = setUpLockedChest(sim);
    giveSome(sim, "mara", "iron", 1);
    doVerb(sim, "mara", "copy", "anvil", "key");
    expect(countHeld(sim.state, "mara", "key")).toBe(2);
    const [original, copy] = heldOf(sim, "mara", "key");
    if (!original || !copy) throw new Error("expected two keys");
    if (copy.kind !== "entity") throw new Error("a key is an entity");
    moveEntity(sim.state, copy.entityId, locateInside("tobias"));
    doVerb(sim, "tobias", "unlock", "chest");
    expect(hasComponentNow(sim, chest, "locked")).toBe(false);
  });

  it("can't see inside a locked chest when inspecting it", () => {
    const sim = setUpVillage();
    setUpLockedChest(sim);
    doVerb(sim, "tobias", "inspect", "chest");
    expect(memoryTexts(sim, "tobias")).toContain(
      "I inspected the chest: locked, I couldn't see inside it",
    );
  });

  it("forces a locked chest open with an axe, damaging it and taking its lock", () => {
    const sim = setUpVillage();
    const chest = setUpLockedChest(sim);
    handOver(sim, "tobias", "axe");
    doVerb(sim, "tobias", "force open", "chest");
    expect(hasComponentNow(sim, chest, "locked")).toBe(false);
    expect(hasComponentNow(sim, chest, "fitted_lock")).toBe(false);
    expect(numberAt(sim, chest, "health.current")).toBeCloseTo(3.7);
  });
});

describe("food, drink and lacing", () => {
  it("shows how long carried bread has before it spoils", () => {
    const sim = setUpVillage();
    handOver(sim, "mara", "bread");
    const prompt = buildDecisionPrompt(buildDecisionContext(sim.state, "mara", false));
    expect(prompt).toMatch(/^- 1 bread, turns into spoiled food in 96 h \(eat/m);
  });

  it("fills hunger from bread and never poisons", () => {
    const sim = setUpVillage(ALWAYS);
    handOver(sim, "mara", "bread");
    const hungerBefore = sim.agent("mara").needs.hunger;
    doVerb(sim, "mara", "eat", "bread");
    expect(sim.agent("mara").needs.hunger).toBeGreaterThan(hungerBefore);
    expect(poisonEndOf(sim, "mara")).toBeUndefined();
  });

  it("poisons for thirty minutes on an unlucky bite of raw meat", () => {
    const sim = setUpVillage(ALWAYS);
    handOver(sim, "mara", "raw_meat");
    doVerb(sim, "mara", "eat", "raw meat");
    expect(typeof poisonEndOf(sim, "mara")).toBe("number");
  });

  it("laces bread with poison that looks like any bread, poisoning the eater until an antidote", () => {
    const sim = setUpVillage();
    handOver(sim, "mara", "poison");
    const bread = handOver(sim, "mara", "bread");
    doVerb(sim, "mara", "pour into", "poison", "bread");
    expect(countHeld(sim.state, "mara", "poison")).toBe(0);
    moveEntity(sim.state, bread.id, locateInside("tobias"));
    handOver(sim, "tobias", "bread");
    const prompt = buildDecisionPrompt(buildDecisionContext(sim.state, "tobias", false));
    // Lines group only when identical, so the laced loaf counted with a plain one can't be told apart.
    expect(prompt).toMatch(/^- 2 bread, turns into spoiled food in 96 h \(/m);
    doVerb(sim, "tobias", "eat", "bread");
    expect(poisonEndOf(sim, "tobias")).toBeNull();
    handOver(sim, "tobias", "antidote");
    doVerb(sim, "tobias", "drink", "antidote");
    expect(hasComponentNow(sim, TOBIAS, "poisoned")).toBe(false);
  });

  it("puts whoever drinks ale laced with a sleeping draught to sleep", () => {
    const sim = setUpVillage();
    handOver(sim, "mara", "sleeping_draught");
    const ale = handOver(sim, "mara", "ale");
    doVerb(sim, "mara", "pour into", "sleeping draught", "ale");
    moveEntity(sim.state, ale.id, locateInside("tobias"));
    aim(sim, "tobias", { verb: "drink", itemName: "ale" });
    finish(sim, "tobias");
    expect(isAsleep(sim.agent("tobias"))).toBe(true);
  });

  it("won't lace food that is already laced", () => {
    const sim = setUpVillage();
    handOver(sim, "mara", "poison");
    handOver(sim, "mara", "sleeping_draught");
    handOver(sim, "mara", "bread");
    doVerb(sim, "mara", "pour into", "poison", "bread");
    doVerb(sim, "mara", "pour into", "sleeping draught", "bread");
    expect(countHeld(sim.state, "mara", "sleeping_draught")).toBe(1);
  });
});

describe("potions", () => {
  it("heals a bleeding neighbour given a dose of healing potion", () => {
    const sim = setUpVillage();
    handOver(sim, "mara", "healing_potion");
    setField(sim, TOBIAS, "health.current", 0.5);
    doVerb(sim, "mara", "give a dose of", "healing potion", "Tobias");
    expect(numberAt(sim, TOBIAS, "health.current")).toBeCloseTo(0.9);
    expect(countHeld(sim.state, "mara", "healing_potion")).toBe(0);
  });

  it("poisons with no end time when drunk", () => {
    const sim = setUpVillage();
    handOver(sim, "mara", "poison");
    doVerb(sim, "mara", "drink", "poison");
    expect(poisonEndOf(sim, "mara")).toBeNull();
  });
});

describe("fire", () => {
  it("shatters a thrown fire flask and sets the target and what is beside it burning", () => {
    const sim = setUpVillage(ALWAYS);
    const flask = handOver(sim, "mara", "fire_flask");
    const bench = placeThing(sim, "bench", NEXT_TO_SQUARE);
    doVerb(sim, "mara", "throw", "fire flask", "Tobias");
    expect(findEntityIfPresent(sim.state, flask.id)).toBeUndefined();
    expect(hasComponentNow(sim, TOBIAS, "burning")).toBe(true);
    expect(hasComponentNow(sim, bench, "burning")).toBe(true);
  });

  it("douses a burning bench with water and leaves it wet", () => {
    const sim = setUpVillage(ALWAYS);
    handOver(sim, "mara", "fire_flask");
    const bench = placeThing(sim, "bench", NEXT_TO_SQUARE);
    doVerb(sim, "mara", "throw", "fire flask", "Tobias");
    handOver(sim, "mara", "water");
    doVerb(sim, "mara", "douse", "water", "bench");
    expect(hasComponentNow(sim, bench, "burning")).toBe(false);
    expect(hasComponentNow(sim, bench, "wet")).toBe(true);
  });
});

describe("tools and weapons", () => {
  it("destroys a worn-out axe and tells its holder it broke and is gone", () => {
    const sim = setUpVillage();
    placeThing(sim, "tree", SQUARE);
    const axe = handOver(sim, "mara", "axe");
    setField(sim, entityThing(axe), "health.current", 0.02);
    doVerb(sim, "mara", "chop down", "tree");
    expect(countHeld(sim.state, "mara", "axe")).toBe(0);
    expect(memoryTexts(sim, "mara")).toContain("My axe broke and is gone");
  });

  it("shoots one loaded arrow from a bow", () => {
    const sim = setUpVillage(ALWAYS);
    handOver(sim, "mara", "bow");
    giveSome(sim, "mara", "arrow", 2);
    aim(sim, "mara", { verb: "put", itemName: "arrows", targetName: "bow", amount: 2 });
    expect(countHeld(sim.state, "mara", "arrow")).toBe(0);
    doVerb(sim, "mara", "shoot", "bow", "Tobias");
    const [bow] = heldOf(sim, "mara", "bow");
    if (!bow || bow.kind !== "entity") throw new Error("expected the bow");
    expect(listContents(sim.state, bow.entityId)).toHaveLength(1);
    expect(numberAt(sim, TOBIAS, "health.current")).toBeLessThan(1);
  });
});

describe("writing and the notice board", () => {
  it("writes on held paper anywhere, turning it into a note with text and author", () => {
    const sim = setUpVillage();
    const paper = handOver(sim, "mara", "paper");
    doVerb(sim, "mara", "write on", "paper", undefined, "Meet me at the well");
    expect(readField(sim.state, entityThing(paper), "writing.text")).toBe("Meet me at the well");
    expect(readField(sim.state, entityThing(paper), "writing.author")).toBe("Mara");
  });

  it("pins a note on the notice board but refuses bread", () => {
    const sim = setUpVillage();
    const board = placeThing(sim, "notice_board", SQUARE);
    if (board.kind !== "entity") throw new Error("a board is an entity");
    handOver(sim, "mara", "paper");
    handOver(sim, "mara", "bread");
    doVerb(sim, "mara", "write on", "paper", undefined, "Lost: one goat");
    doVerb(sim, "mara", "put", "note", "notice board");
    doVerb(sim, "mara", "put", "bread", "notice board");
    expect(listContents(sim.state, board.entityId).map((entity) => entity.definitionId)).toEqual([
      "note",
    ]);
  });
});

describe("inspecting", () => {
  it("counts what a chest holds into the inspector's stream", () => {
    const sim = setUpVillage();
    const chest = placeThing(sim, "chest", SQUARE);
    giveSome(sim, "mara", "wheat", 3);
    doVerb(sim, "mara", "put", "wheat", "chest");
    doVerb(sim, "mara", "put", "wheat", "chest");
    doVerb(sim, "tobias", "inspect", "chest");
    expect(sim.streamTexts("tobias")).toContain("I inspected the chest: holding 2 wheat");
    expect(listContents(sim.state, readThingId(chest))).toHaveLength(2);
  });

  it("says an empty chest is empty", () => {
    const sim = setUpVillage();
    placeThing(sim, "chest", SQUARE);
    doVerb(sim, "mara", "inspect", "chest");
    expect(memoryTexts(sim, "mara")).toContain("I inspected the chest: empty");
  });

  it("notes how much a source has left, and nothing about its insides", () => {
    const sim = setUpVillage();
    const field = placeThing(sim, "wheat_field", SQUARE);
    setField(sim, field, "stock.amount", 6);
    doVerb(sim, "mara", "inspect", "wheat field");
    expect(memoryTexts(sim, "mara")).toContain("I inspected the wheat field: 6 left");
  });
});

describe("goblins", () => {
  it("hunts the nearest person and scratches them, leaving them poisoned for a while", () => {
    const sim = setUpVillage(ALWAYS);
    placeThing(sim, "goblin", OPEN_GROUND);
    const scratch = actForTicks(sim, 10)
      .flatMap((result) => result.events)
      .find((event) => event.kind === "attacked");
    const victimId = scratch?.targetId ?? "";
    expect(sim.streamTexts(victimId)).toContain("The goblin scratched me");
    expect(typeof poisonEndOf(sim, victimId)).toBe("number");
  });
});
