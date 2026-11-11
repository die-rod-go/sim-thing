import { describe, expect, it } from "vitest";
import type { Entity, ItemDefinition } from "@village/shared";
import { listPlacedGlyphs } from "./entity-glyphs";

const oven: ItemDefinition = {
  id: "oven",
  name: "oven",
  form: "placeable",
  glyph: { index: 11, color: "#ffffff" },
  isVisibleWhenCarried: false,
  properties: [],
  components: {},
};

function entityAt(id: string, location: Entity["location"]): Entity {
  return { id, definitionId: "oven", label: null, location, state: { conditions: [] } };
}

describe("listPlacedGlyphs", () => {
  it("draws entities on tiles from their definition's glyph and skips carried ones", () => {
    const entities = [
      entityAt("entity-1", { kind: "tile", place: "bakery", pos: { x: 3, y: 12 } }),
      entityAt("entity-2", { kind: "inventory", agentId: "mara" }),
    ];
    expect(listPlacedGlyphs(entities, [oven])).toEqual([
      { entityId: "entity-1", glyph: oven.glyph, tileX: 3, tileY: 12 },
    ]);
  });

  it("draws items on the ground over the placed object on the same tile", () => {
    const knife: ItemDefinition = { ...oven, id: "knife", name: "knife", form: "carriable" };
    const tile = { kind: "tile", place: "tavern", pos: { x: 31, y: 14 } } as const;
    const entities: Entity[] = [
      { ...entityAt("entity-1", tile), definitionId: "knife" },
      entityAt("entity-2", tile),
    ];
    expect(listPlacedGlyphs(entities, [oven, knife]).map((placed) => placed.entityId)).toEqual([
      "entity-2",
      "entity-1",
    ]);
  });
});
