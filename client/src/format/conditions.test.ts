import { buildThingCatalog, type Entity } from "@village/shared";
import { describe, expect, it } from "vitest";
import {
  listTileConditionOverlays,
  listVisibleBodyComponents,
  listVisibleComponents,
} from "./conditions";
import { makeSampleAgent } from "../fixtures/sample-data";

const catalog = buildThingCatalog(
  {
    burning: { description: "On fire.", fields: {}, words: "on fire", isVisible: true },
    poisoned: { description: "Poison.", fields: {}, words: "poisoned", isVisible: false },
    door: { description: "A door.", isVisible: false, fields: {} },
  },
  { agentBody: "person", agentHealth: "health.current" },
  [
    { id: "person", name: "person", glyph: { index: 1, color: "#fff" }, components: {} },
    { id: "door", name: "door", glyph: { index: 2, color: "#fff" }, components: { door: {} } },
  ],
);

describe("visible components", () => {
  it("shows only the components others can see", () => {
    const shown = listVisibleComponents(catalog, { poisoned: {}, burning: {} });
    expect(shown).toEqual([{ name: "burning", words: "on fire" }]);
  });

  it("reads an agent's body changes", () => {
    const agent = {
      ...makeSampleAgent("ada", "Ada", 0, 0),
      bodyChanges: {
        burning: { fields: {}, endsAtTick: null, sourceId: null },
        poisoned: { fields: {}, endsAtTick: null, sourceId: null },
      },
    };
    expect(listVisibleBodyComponents(catalog, agent)).toEqual([
      { name: "burning", words: "on fire" },
    ]);
  });

  it("puts an overlay on the tile of a thing that is on fire, not on carried things", () => {
    const door: Entity = {
      id: "entity-1",
      definitionId: "door",
      label: null,
      location: { kind: "tile", place: "bakery", pos: { x: 3, y: 4 } },
      changes: { burning: { fields: {}, endsAtTick: null, sourceId: null } },
    };
    const carried: Entity = {
      ...door,
      id: "entity-2",
      location: { kind: "inside", holderId: "mara" },
    };
    expect(listTileConditionOverlays([door, carried], catalog)).toEqual([
      { key: "entity-1:burning", conditionName: "burning", tileX: 3, tileY: 4 },
    ]);
  });
});
