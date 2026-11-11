import { describe, expect, it } from "vitest";
import { buildThingCatalog, type Entity, type ItemDefinition } from "@village/shared";
import { listPlacedGlyphs } from "./entity-glyphs";

const oven: ItemDefinition = {
  id: "oven",
  name: "oven",
  glyph: { index: 11, color: "#ffffff" },
  components: {},
};
const knife: ItemDefinition = {
  id: "knife",
  name: "knife",
  glyph: { index: 12, color: "#ffffff" },
  components: { holdable: {} },
};

const catalog = buildThingCatalog(
  { holdable: { description: "Can be carried.", isVisible: false, fields: {} } },
  { agentBody: "person", agentHealth: "health.current", lyingWhenOnTile: { has: "holdable" } },
  [oven, knife],
);

function entityAt(id: string, location: Entity["location"]): Entity {
  return { id, definitionId: "oven", label: null, location, changes: {} };
}

describe("listPlacedGlyphs", () => {
  it("draws entities on tiles from their definition's glyph and skips carried ones", () => {
    const entities = [
      entityAt("entity-1", { kind: "tile", place: "bakery", pos: { x: 3, y: 12 } }),
      entityAt("entity-2", { kind: "inside", holderId: "mara" }),
    ];
    expect(listPlacedGlyphs(entities, catalog)).toEqual([
      { entityId: "entity-1", glyph: oven.glyph, tileX: 3, tileY: 12 },
    ]);
  });

  it("draws items lying on the ground over the placed object on the same tile", () => {
    const tile = { kind: "tile", place: "tavern", pos: { x: 31, y: 14 } } as const;
    const entities: Entity[] = [
      { ...entityAt("entity-1", tile), definitionId: "knife" },
      entityAt("entity-2", tile),
    ];
    expect(listPlacedGlyphs(entities, catalog).map((placed) => placed.entityId)).toEqual([
      "entity-2",
      "entity-1",
    ]);
  });
});
