import { describe, expect, it } from "vitest";
import { buildThingCatalog, type Entity, type ItemDefinition } from "@village/shared";
import { makeSampleAgent } from "../fixtures/sample-data";
import { findPlaceAt, inspectTile, type TileInspectionSources } from "./tile-inspection";
import type { TiledMap } from "./tiled-map";

const TILE_SIZE = 16;
const BOARD_TILE = { x: 1, y: 0 };

function makeDefinition(
  id: string,
  components: ItemDefinition["components"] = {},
  plural?: string,
): ItemDefinition {
  return {
    id,
    name: id.replaceAll("_", " "),
    ...(plural === undefined ? {} : { plural }),
    glyph: { index: 1, color: "#ffffff" },
    components,
  };
}

const LOOSE = { holdable: {} };

const catalog = buildThingCatalog(
  {
    holdable: { description: "Can be carried.", isVisible: false, fields: {} },
    closed: { description: "Shut.", fields: {}, words: "closed", isVisible: true },
    burning: { description: "On fire.", fields: {}, words: "on fire", isVisible: true },
    health: {
      description: "How much it can take.",
      isVisible: false,
      fields: {
        max: { type: "number", description: "Most.", min: 0 },
        current: { type: "number", description: "Now.", min: 0, max: "max" },
      },
    },
    stock: {
      description: "Runs out.",
      isVisible: false,
      fields: {
        capacity: { type: "number", description: "Most.", min: 0 },
        amount: {
          type: "number",
          description: "Left.",
          min: 0,
          max: "capacity",
          words: [{ text: "{value} left" }],
        },
      },
    },
    writing: {
      description: "Written.",
      isVisible: false,
      fields: {
        text: { type: "text", description: "Words.", default: "" },
        author: { type: "text", description: "Who.", default: "" },
      },
    },
  },
  { agentBody: "person", agentHealth: "health.current", lyingWhenOnTile: { has: "holdable" } },
  [
    makeDefinition("notice_board"),
    makeDefinition("wheat_field", { stock: { capacity: 12, amount: 12 } }),
    makeDefinition("chest"),
    makeDefinition("note", { ...LOOSE, writing: {} }),
    makeDefinition("bread", LOOSE),
    makeDefinition("knife", { ...LOOSE, health: { max: 1, current: 1 } }, "knives"),
  ],
);

function makeEntity(
  id: string,
  definitionId: string,
  location: Entity["location"],
  changes: Entity["changes"] = {},
): Entity {
  return { id, definitionId, label: null, location, changes };
}

function onTile(x: number, y: number): Entity["location"] {
  return { kind: "tile", place: "square", pos: { x, y } };
}

function instance(fields: Record<string, number | string> = {}) {
  return { fields, endsAtTick: null, sourceAgentId: null };
}

const map: TiledMap = {
  width: 2,
  height: 1,
  tileWidth: TILE_SIZE,
  tileHeight: TILE_SIZE,
  tileset: {
    firstGid: 1,
    glyphsByTileId: new Map(),
    terrainsByTileId: new Map([[0, "stone_floor"]]),
  },
  tileLayers: [{ name: "ground", opacity: 1, isVisible: true, gids: [1, 1] }],
  places: [
    { name: "village", x: 0, y: 0, width: 32, height: 16 },
    { name: "square", x: 16, y: 0, width: 16, height: 16 },
  ],
};

function makeSources(entities: Entity[]): TileInspectionSources {
  return {
    map,
    agents: [makeSampleAgent("ada", "Ada", 1, 0), makeSampleAgent("tom", "Tom", 0, 0)],
    entities,
    catalog,
  };
}

describe("findPlaceAt", () => {
  it("picks the smallest named place covering the tile", () => {
    expect(findPlaceAt(map.places, BOARD_TILE, TILE_SIZE)?.name).toBe("square");
    expect(findPlaceAt(map.places, { x: 0, y: 0 }, TILE_SIZE)?.name).toBe("village");
    expect(findPlaceAt(map.places, { x: 5, y: 5 }, TILE_SIZE)).toBeNull();
  });
});

describe("inspectTile", () => {
  it("names the place, the terrain and who stands on the tile", () => {
    const inspection = inspectTile(BOARD_TILE, makeSources([]));
    expect(inspection.placeName).toBe("square");
    expect(inspection.terrains).toEqual(["stone floor"]);
    expect(inspection.agentNames).toEqual(["Ada"]);
    expect(inspection.things).toEqual([]);
  });

  it("lists a notice board's notes newest first", () => {
    const board = makeEntity("entity-1", "notice_board", onTile(1, 0));
    const inBoard = { kind: "inside", holderId: "entity-1" } as const;
    const entities = [
      board,
      makeEntity("entity-2", "note", inBoard, {
        writing: instance({ author: "Ada", text: "Bread for sale" }),
      }),
      makeEntity("entity-3", "note", inBoard, {
        writing: instance({ author: "Tom", text: "Lost my knife" }),
      }),
    ];
    const [thing] = inspectTile(BOARD_TILE, makeSources(entities)).things;
    expect(thing?.name).toBe("notice board");
    expect(thing?.notes.map((note) => note.text)).toEqual(["Lost my knife", "Bread for sale"]);
    expect(thing?.contents).toEqual([]);
  });

  it("describes stock and visible components in words", () => {
    const field = makeEntity("entity-1", "wheat_field", onTile(1, 0), {
      stock: instance({ amount: 7 }),
      closed: instance(),
      burning: instance(),
    });
    const [thing] = inspectTile(BOARD_TILE, makeSources([field])).things;
    expect(thing?.details).toEqual(["closed", "on fire", "7 left"]);
  });

  it("counts what a container holds", () => {
    const chest = makeEntity("entity-1", "chest", onTile(1, 0));
    const insideChest = { kind: "inside", holderId: "entity-1" } as const;
    const entities = [
      chest,
      makeEntity("entity-2", "knife", insideChest),
      makeEntity("entity-3", "knife", insideChest),
    ];
    const [thing] = inspectTile(BOARD_TILE, makeSources(entities)).things;
    expect(thing?.contents).toEqual(["2 knives"]);
  });

  it("counts a pile of loose items together but keeps a lone item's health", () => {
    const entities = [
      makeEntity("entity-1", "bread", onTile(1, 0)),
      makeEntity("entity-2", "bread", onTile(1, 0)),
      makeEntity("entity-3", "knife", onTile(1, 0), { health: instance({ current: 0.5 }) }),
      makeEntity("entity-4", "knife", onTile(0, 0)),
    ];
    const things = inspectTile(BOARD_TILE, makeSources(entities)).things;
    expect(things.map((thing) => [thing.name, thing.details])).toEqual([
      ["2 bread", []],
      ["a knife", ["health 50%"]],
    ]);
  });
});
