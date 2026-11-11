import { describe, expect, it } from "vitest";
import type { Entity, ItemDefinition } from "@village/shared";
import { listPlacedSprites } from "./entity-sprites";

const oven: ItemDefinition = {
  id: "oven",
  name: "oven",
  form: "placeable",
  sprite: { tileset: "village", tile: 11 },
  isVisibleWhenCarried: false,
  properties: [],
  components: {},
};

function entityAt(id: string, location: Entity["location"]): Entity {
  return { id, definitionId: "oven", label: null, location, state: { conditions: [] } };
}

describe("listPlacedSprites", () => {
  it("draws entities on tiles from their definition's sprite and skips carried ones", () => {
    const entities = [
      entityAt("entity-1", { kind: "tile", place: "bakery", pos: { x: 3, y: 12 } }),
      entityAt("entity-2", { kind: "inventory", agentId: "mara" }),
    ];
    expect(listPlacedSprites(entities, [oven])).toEqual([
      { entityId: "entity-1", tile: 11, tileX: 3, tileY: 12 },
    ]);
  });
});
