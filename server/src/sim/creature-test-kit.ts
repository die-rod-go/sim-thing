import { buildItemCatalog, parseItemFile, type Entity, type Position } from "@village/shared";
import { createEntity } from "../items/entity-store";
import { findPlaceAt } from "../world/map-loader";

import {
  NEXT_TO_SQUARE,
  SQUARE,
  buildCombatSim,
  contextOf,
  fixRolls,
  place,
} from "./combat-test-kit";
import { actCreatures } from "./creatures/creature-phase";
import type { TestSim } from "./test-sim";
import type { TickResult } from "./world-state";

/** Open ground east of the square, clear of the bench, the board and the agents. */
export const FIELD_EDGE = { x: 23, y: 19 };

/** The wolf's own stats; deer and boars have none, so they are middling. */
export const WOLF_STATS = { strength: 0.9, agility: 1 };

const ownBody = (component: string) => ({ allOf: [{ has: component }, { where: "self" }] });
const isDead = { field: "health.current", atMost: 0 };
const animal = (extra: Record<string, unknown>) => ({
  alive: {},
  flesh: {},
  creature: {},
  health: { max: 0.5, current: 0.5 },
  drops: { item: "meat", count: 2 },
  ...extra,
});

const CREATURE_COMPONENTS = {
  creature: {},
  timid: {},
  defensive: {},
  predator: {},
  grazer: {},
  sated: {},
  jaws: { fields: { damage: { type: "range" }, hitChance: { type: "number" } } },
  stats: { fields: { strength: { type: "number" }, agility: { type: "number" } } },
  drops: { fields: { item: { type: "item" }, count: { type: "number" } } },
};

const CREATURE_DEFINITIONS = [
  {
    id: "deer",
    name: "deer",
    glyph: { index: 100, color: "#c89a5a" },
    components: animal({ timid: {}, grazer: {} }),
  },
  {
    id: "boar",
    name: "boar",
    glyph: { index: 98, color: "#8a6a4a" },
    components: animal({ defensive: {}, jaws: { damage: { min: 0.1, max: 0.1 }, hitChance: 1 } }),
  },
  {
    id: "wolf",
    name: "wolf",
    glyph: { index: 119, color: "#a8a8b0" },
    components: animal({
      predator: {},
      jaws: { damage: { min: 0.1, max: 0.1 }, hitChance: 1 },
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

/** Runs before the test items' own rules, so a dead creature drops its meat before it is gone. */
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
];

const PERSON = { definition: "person" };

const CREATURE_INSTINCTS = [
  { do: "flee", appliesTo: { has: "timid" }, from: PERSON, radius: 3 },
  { do: "verb", appliesTo: { has: "defensive" }, verb: "bite", isRetaliation: true },
  {
    do: "verb",
    appliesTo: { allOf: [{ has: "grazer" }, { not: { has: "sated" } }] },
    verb: "graze",
    target: { field: "stock.amount", atLeast: 1 },
  },
  { do: "verb", appliesTo: { has: "predator" }, verb: "bite", target: PERSON },
  { do: "wander", appliesTo: { has: "creature" }, chance: 0.5 },
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
