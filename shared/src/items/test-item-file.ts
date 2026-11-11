import { itemFileSchema, type ItemFile } from "./item-file";

/* A small item file for tests: a knife, bread, a coin, an oven and a chest. */

export function buildTestItemFile(
  overrides: Partial<Record<keyof ItemFile, unknown>> = {},
): ItemFile {
  return itemFileSchema.parse({
    components: {
      durability: { fields: { toughness: { type: "number" } } },
      container: { fields: { capacity: { type: "number" } } },
      weight: { fields: { kilograms: { type: "number" } } },
      food: { fields: { hunger: { type: "number" } } },
      weapon: {
        fields: {
          damage: { type: "range" },
          hitChance: { type: "number" },
          stimulus: { type: "text" },
        },
      },
    },
    properties: { sharp: {}, flesh: {}, metal: {} },
    person: { properties: ["flesh"] },
    definitions: [
      {
        id: "knife",
        name: "knife",
        plural: "knives",
        form: "carriable",
        sprite: { tileset: "village", tile: 1 },
        properties: ["sharp", "metal"],
        components: {
          weight: { kilograms: 0.3 },
          weapon: { damage: { min: 0.2, max: 0.4 }, hitChance: 0.7, stimulus: "cut" },
        },
      },
      {
        id: "bread",
        name: "bread",
        form: "carriable",
        sprite: { tileset: "village", tile: 2 },
        components: { weight: { kilograms: 0.4 }, food: { hunger: 0.5 } },
      },
      {
        id: "coin",
        name: "coin",
        plural: "coins",
        form: "carriable",
        sprite: { tileset: "village", tile: 3 },
        properties: ["metal"],
        components: { weight: { kilograms: 0.005 } },
      },
      {
        id: "oven",
        name: "oven",
        form: "placeable",
        sprite: { tileset: "village", tile: 4 },
        components: { durability: { toughness: 6 } },
      },
      {
        id: "chest",
        name: "chest",
        form: "placeable",
        sprite: { tileset: "village", tile: 5 },
        components: { container: { capacity: 10 } },
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
