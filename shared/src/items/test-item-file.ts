import { itemFileSchema, type ItemFile } from "./item-file";

/* A small item file for tests: a knife, bread, a coin, an oven, a chest and the agents' body. */

export function buildTestItemFile(
  overrides: Partial<Record<keyof ItemFile, unknown>> = {},
): ItemFile {
  return itemFileSchema.parse({
    world: {
      lyingWhenOnTile: { has: "holdable" },
      closedSupply: { definition: "coin" },
      agentBody: "person",
      agentHealth: "health.current",
    },
    components: {
      health: {
        fields: {
          max: { type: "number", min: 0 },
          current: { type: "number", min: 0, max: "max" },
        },
      },
      capacity: { fields: { max: { type: "number", min: 0 } } },
      holdable: { fields: { kilograms: { type: "number", min: 0 } } },
      food: { fields: { hunger: { type: "number" } } },
      weapon: {
        fields: {
          damage: { type: "range" },
          hitChance: { type: "number" },
          stimulus: { type: "text" },
        },
      },
      sharp: {},
      flesh: {},
      metal: {},
    },
    definitions: [
      {
        id: "knife",
        name: "knife",
        plural: "knives",
        glyph: { index: 1, color: "#ffffff" },
        components: {
          holdable: { kilograms: 0.3 },
          sharp: {},
          metal: {},
          weapon: { damage: { min: 0.2, max: 0.4 }, hitChance: 0.7, stimulus: "cut" },
        },
      },
      {
        id: "bread",
        name: "bread",
        glyph: { index: 2, color: "#ffffff" },
        components: { holdable: { kilograms: 0.4 }, food: { hunger: 0.5 } },
      },
      {
        id: "coin",
        name: "coin",
        plural: "coins",
        glyph: { index: 3, color: "#ffffff" },
        components: { holdable: { kilograms: 0.005 }, metal: {} },
      },
      {
        id: "oven",
        name: "oven",
        glyph: { index: 4, color: "#ffffff" },
        components: { health: { max: 6, current: 6 } },
      },
      {
        id: "chest",
        name: "chest",
        glyph: { index: 5, color: "#ffffff" },
        components: { capacity: { max: 10 } },
      },
      {
        id: "person",
        name: "person",
        glyph: { index: 6, color: "#ffffff" },
        components: { flesh: {}, health: { max: 1, current: 1 } },
      },
    ],
    verbs: [
      {
        name: "eat",
        appliesTo: { allOf: [{ component: "food" }, { location: "held" }] },
        effects: [
          { type: "destroy", on: "item", when: "start" },
          { type: "change_need", on: "user", need: "hunger", amount: { from: "item.food.hunger" } },
        ],
      },
      {
        name: "bake bread",
        appliesTo: { definition: "oven" },
        inputs: { bread: 1 },
        effects: [{ type: "produce", on: "user", item: "bread", count: 2, into: "user" }],
      },
    ],
    ...overrides,
  });
}
