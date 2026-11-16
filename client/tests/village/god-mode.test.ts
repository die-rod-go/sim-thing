import { describe, expect, it } from "vitest";
import { buildThingCatalog, type Entity, type ItemDefinition } from "@village/shared";
import { makeSampleAgent } from "../../src/fixtures/sample-data";
import { resolveGodClick, type GodWorld } from "../../src/village/god-mode";

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

const BAKERY_TILE = { x: 3, y: 4 };
const tile = { kind: "tile", place: "bakery", pos: BAKERY_TILE } as const;
const entities: Entity[] = [
  { id: "entity-1", definitionId: "knife", label: null, location: tile, changes: {} },
  { id: "entity-2", definitionId: "oven", label: "bakery oven", location: tile, changes: {} },
];
const mara = makeSampleAgent("mara", "Mara", 1, 1);
const world: GodWorld = { agents: [mara], entities, catalog };

describe("god mode clicks", () => {
  it("picks up the thing drawn on top of a tile, then moves it where the next click lands", () => {
    const picked = resolveGodClick({ kind: "grab" }, { kind: "tile", pos: BAKERY_TILE }, world);
    expect(picked).toEqual({
      action: null,
      nextTool: { kind: "holding", held: { kind: "entity", entityId: "entity-1", name: "knife" } },
    });
    const dropped = resolveGodClick(picked.nextTool, { kind: "tile", pos: { x: 9, y: 9 } }, world);
    expect(dropped).toEqual({
      action: {
        kind: "move_entity",
        entityId: "entity-1",
        destination: { kind: "tile", pos: { x: 9, y: 9 } },
      },
      nextTool: { kind: "grab" },
    });
  });

  it("hands a held thing to the person clicked", () => {
    const held = { kind: "entity", entityId: "entity-2", name: "bakery oven" } as const;
    const outcome = resolveGodClick(
      { kind: "holding", held },
      { kind: "agent", agentId: "mara" },
      world,
    );
    expect(outcome.action).toEqual({
      kind: "move_entity",
      entityId: "entity-2",
      destination: { kind: "agent", agentId: "mara" },
    });
  });

  it("picks up a person and sets them down on the clicked tile", () => {
    const picked = resolveGodClick({ kind: "grab" }, { kind: "agent", agentId: "mara" }, world);
    const dropped = resolveGodClick(picked.nextTool, { kind: "tile", pos: { x: 5, y: 6 } }, world);
    expect(dropped.action).toEqual({ kind: "move_agent", agentId: "mara", pos: { x: 5, y: 6 } });
  });

  it("places the chosen definition and keeps the place tool for more", () => {
    const tool = { kind: "place", definitionId: "knife" } as const;
    const outcome = resolveGodClick(tool, { kind: "tile", pos: { x: 2, y: 2 } }, world);
    expect(outcome).toEqual({
      action: {
        kind: "place_entity",
        definitionId: "knife",
        destination: { kind: "tile", pos: { x: 2, y: 2 } },
      },
      nextTool: tool,
    });
  });

  it("deletes the top thing on a tile and does nothing on an empty one", () => {
    const tool = { kind: "delete" } as const;
    expect(resolveGodClick(tool, { kind: "tile", pos: BAKERY_TILE }, world).action).toEqual({
      kind: "delete_entity",
      entityId: "entity-1",
    });
    expect(resolveGodClick(tool, { kind: "tile", pos: { x: 0, y: 0 } }, world).action).toBeNull();
  });
});
