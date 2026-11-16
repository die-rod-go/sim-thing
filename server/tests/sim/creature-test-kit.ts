import { buildItemCatalog, parseItemFile, type Entity, type Position } from "@village/shared";
import { createEntity } from "../../src/items/entity-store";
import { findPlaceAt } from "../../src/world/map-loader";
import {
  NEXT_TO_SQUARE,
  SQUARE,
  buildCombatSim,
  contextOf,
  fixRolls,
  place,
} from "./combat-test-kit";
import { actCreatures } from "../../src/sim/creatures/creature-phase";
import type { TestSim } from "../../src/sim/test-sim";
import type { TickResult } from "../../src/sim/world-state";

/** Open ground east of the square, clear of the bench, the board and the agents. */
export const FIELD_EDGE = { x: 23, y: 19 };

export const MIDDLING_STATS = { strength: 0.5, agility: 0.5 };
export const WOLF_STATS = { strength: 0.9, agility: 1 };
/** How hurt the wolf gets before it runs from people. */
export const WOLF_FLEE_BELOW_HEALTH = 0.2;

/** How close a person gets before the deer runs. */
export const DEER_FLEE_RADIUS = 3;
/** How far the deer and the wolf see; the boar sees less. */
export const CREATURE_SIGHT_TILES = 8;
export const BOAR_SIGHT_TILES = 2;

const ownBody = (component: string) => ({ allOf: [{ has: component }, { where: "self" }] });
const isDead = { field: "health.current", atMost: 0 };
const number = { type: "number" };
const animal = (extra: Record<string, unknown>) => ({
  alive: {},
  flesh: {},
  creature: { sightTiles: CREATURE_SIGHT_TILES, wanderChance: 0.5 },
  health: { max: 0.5, current: 0.5 },
  stats: MIDDLING_STATS,
  drops: { item: "meat", count: 2 },
  ...extra,
});
const JAWS = { damage: { min: 0.1, max: 0.1 }, hitChance: 1 };

const CREATURE_COMPONENTS = {
  creature: { fields: { sightTiles: number, wanderChance: number } },
  timid: { fields: { radius: number } },
  defensive: { fields: { grudgeMinutes: number } },
  provoked: {},
  predator: { fields: { fleeBelowHealth: number } },
  grazer: {},
  sated: {},
  jaws: { fields: { damage: { type: "range" }, hitChance: number } },
  stats: { fields: { strength: number, agility: number } },
  drops: { fields: { item: { type: "item" }, count: number } },
};

const CREATURE_DEFINITIONS = [
  {
    id: "deer",
    name: "deer",
    glyph: { index: 100, color: "#c89a5a" },
    components: animal({ timid: { radius: DEER_FLEE_RADIUS }, grazer: {} }),
  },
  {
    id: "boar",
    name: "boar",
    glyph: { index: 98, color: "#8a6a4a" },
    components: animal({
      creature: { sightTiles: BOAR_SIGHT_TILES, wanderChance: 0.5 },
      defensive: { grudgeMinutes: 30 },
      jaws: JAWS,
    }),
  },
  {
    id: "wolf",
    name: "wolf",
    glyph: { index: 119, color: "#a8a8b0" },
    components: animal({
      predator: { fleeBelowHealth: WOLF_FLEE_BELOW_HEALTH },
      jaws: JAWS,
      stats: WOLF_STATS,
    }),
  },
];

const CREATURE_VERBS = [
  {
    name: "bite",
    appliesTo: ownBody("jaws"),
    target: {
      allOf: [{ field: "health.current", above: 0 }, { has: "flesh" }, { not: { where: "self" } }],
    },
    steps: [
      { step: "wait", minutes: 1, loudness: 6 },
      { step: "roll_hit", chance: { from: "item.jaws.hitChance" } },
      {
        step: "damage",
        on: "target",
        field: "health.current",
        amount: { from: "item.jaws.damage" },
      },
    ],
    phrases: {
      ongoing: "biting {target}",
      hit: "bit {target}",
      missed: "snapped at {target} and missed",
      killed: "mauled to death by {actor}",
      attempt: "bite {target}",
    },
  },
  {
    name: "graze",
    appliesTo: ownBody("grazer"),
    target: { allOf: [{ has: "crop" }, { has: "stock" }] },
    steps: [
      { step: "wait", minutes: 1 },
      { step: "change", on: "target", field: "stock.amount", by: -1 },
      { step: "add", on: "user", component: "sated", minutes: 60 },
    ],
    phrases: {
      ongoing: "grazing on {target}",
      done: "grazed on {target}",
      attempt: "graze on {target}",
    },
  },
];

/**
 * Run before the test items' own rules, so a dead creature drops its meat before it is gone. Being
 * hit provokes a defensive creature, with whoever hit it as the source.
 */
const CREATURE_RULES = [
  {
    trigger: "becomes",
    if: { allOf: [{ has: "creature" }, { has: "drops" }, isDead] },
    steps: [
      {
        step: "create",
        item: { from: "self.drops.item" },
        count: { from: "self.drops.count" },
        at: "self",
      },
    ],
  },
  {
    trigger: "becomes",
    if: { allOf: [{ has: "creature" }, isDead] },
    steps: [{ step: "announce", text: "died" }, { step: "destroy" }],
  },
  {
    trigger: "stimulus",
    stimulus: "impact",
    if: { has: "defensive" },
    steps: [
      { step: "add", component: "provoked", minutes: { from: "self.defensive.grudgeMinutes" } },
    ],
  },
];

const PERSON = { definition: "person" };
const SIGHT = { from: "self.creature.sightTiles" };
const creature = (...parts: unknown[]) => ({ allOf: [{ has: "creature" }, ...parts] });

const CREATURE_INSTINCTS = [
  { do: "flee", appliesTo: { has: "timid" }, from: PERSON, radius: { from: "self.timid.radius" } },
  {
    do: "flee",
    appliesTo: {
      allOf: [
        { has: "predator" },
        { field: "health.current", below: { from: "self.predator.fleeBelowHealth" } },
      ],
    },
    from: PERSON,
    radius: SIGHT,
  },
  {
    do: "verb",
    appliesTo: creature({ has: "provoked" }),
    verb: "bite",
    range: SIGHT,
    sourceOf: "provoked",
  },
  {
    do: "verb",
    appliesTo: creature({ has: "grazer" }, { not: { has: "sated" } }),
    verb: "graze",
    target: { field: "stock.amount", atLeast: 1 },
    range: SIGHT,
  },
  {
    do: "verb",
    appliesTo: creature({ has: "predator" }),
    verb: "bite",
    target: PERSON,
    range: SIGHT,
  },
  {
    do: "wander",
    appliesTo: { has: "creature" },
    chance: { from: "self.creature.wanderChance" },
  },
];

/** Mara and Tobias side by side on the square, the test items plus deer, boars and wolves. */
export function buildCreatureSim(roll = 0.99): TestSim {
  const sim = buildCombatSim();
  place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
  const file = sim.state.items.file;
  sim.state.items = buildItemCatalog(
    parseItemFile({
      ...file,
      world: {
        ...file.world,
        creatureStrength: "stats.strength",
        creatureAgility: "stats.agility",
      },
      components: { ...file.components, ...CREATURE_COMPONENTS },
      definitions: [...file.definitions, ...CREATURE_DEFINITIONS],
      verbs: [...file.verbs, ...CREATURE_VERBS],
      rules: [...CREATURE_RULES, ...file.rules],
      instincts: CREATURE_INSTINCTS,
    }),
  );
  fixRolls(sim, roll);
  return sim;
}

export function placeCreature(sim: TestSim, definitionId: string, pos: Position): Entity {
  return createEntity(sim.state, definitionId, {
    kind: "tile",
    place: findPlaceAt(sim.state.map, pos),
    pos,
  });
}

/** Moves the clock on and lets every creature act, `count` times. */
export function actForTicks(sim: TestSim, count: number): TickResult[] {
  const results: TickResult[] = [];
  for (let tick = 0; tick < count; tick += 1) {
    sim.state.tick += 1;
    const context = contextOf(sim);
    actCreatures(context);
    results.push(context.result);
  }
  return results;
}
