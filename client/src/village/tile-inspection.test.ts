import { describe, expect, it } from "vitest";
import type { Entity, EntityState, ItemDefinition } from "@village/shared";
import { makeSampleAgent } from "../fixtures/sample-data";
import { findPlaceAt, inspectTile, type TileInspectionSources } from "./tile-inspection";
import type { TiledMap } from "./tiled-map";

const TILE_SIZE = 16;
const BOARD_TILE = { x: 1, y: 0 };

function makeDefinition(
  id: string,
  form: ItemDefinition["form"],
  components: ItemDefinition["components"] = {},
  plural?: string,
): ItemDefinition {
  return {
    id,
    name: id.replaceAll("_", " "),
    ...(plural === undefined ? {} : { plural }),
    form,
    glyph: { index: 1, color: "#ffffff" },
    isVisibleWhenCarried: false,
    properties: [],
    components,
  };
}

const definitions = [
  makeDefinition("notice_board", "placeable"),
  makeDefinition("wheat_field", "placeable", { stock: { capacity: 12 } }),
  makeDefinition("chest", "placeable"),
  makeDefinition("bread", "carriable"),
  makeDefinition("knife", "carriable", {}, "knives"),
];

function makeEntity(
  id: string,
  definitionId: string,
  location: Entity["location"],
  state: Partial<EntityState> = {},
): Entity {
  return { id, definitionId, label: null, location, state: { conditions: [], ...state } };
}

function onTile(x: number, y: number): Entity["location"] {
  return { kind: "tile", place: "square", pos: { x, y } };
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
    definitions,
    currentTick: 100,
    timeSettings: { minutesPerTick: 1, startHour: 6 },
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
    const notes = [
      { authorId: "ada", authorName: "Ada", text: "Bread for sale", tick: 10 },
      { authorId: "tom", authorName: "Tom", text: "Lost my knife", tick: 40 },
    ];
    const board = makeEntity("entity-1", "notice_board", onTile(1, 0), { notes });
    const [thing] = inspectTile(BOARD_TILE, makeSources([board])).things;
    expect(thing?.name).toBe("notice board");
    expect(thing?.notes.map((note) => note.text)).toEqual(["Lost my knife", "Bread for sale"]);
  });

  it("describes durability, stock against capacity, doors, users and conditions", () => {
    const field = makeEntity("entity-1", "wheat_field", onTile(1, 0), {
      durability: 0.8,
      stock: 7,
      isOpen: false,
      userIds: ["tom"],
      conditions: [{ name: "burning", endsAtTick: 112, sourceAgentId: null }],
    });
    const [thing] = inspectTile(BOARD_TILE, makeSources([field])).things;
    expect(thing?.details).toEqual([
      "durability 80%",
      "stock 7 of 12",
      "closed",
      "used by Tom",
      "burning 12m",
    ]);
  });

  it("counts what a container holds", () => {
    const chest = makeEntity("entity-1", "chest", onTile(1, 0));
    const insideChest = { kind: "inside", containerId: "entity-1" } as const;
    const entities = [
      chest,
      makeEntity("entity-2", "knife", insideChest),
      makeEntity("entity-3", "knife", insideChest),
    ];
    const [thing] = inspectTile(BOARD_TILE, makeSources(entities)).things;
    expect(thing?.contents).toEqual(["2 knives"]);
  });

  it("counts a pile of loose items together but keeps a lone item's state", () => {
    const entities = [
      makeEntity("entity-1", "bread", onTile(1, 0)),
      makeEntity("entity-2", "bread", onTile(1, 0)),
      makeEntity("entity-3", "knife", onTile(1, 0), { durability: 0.5 }),
      makeEntity("entity-4", "knife", onTile(0, 0)),
    ];
    const things = inspectTile(BOARD_TILE, makeSources(entities)).things;
    expect(things.map((thing) => [thing.name, thing.details])).toEqual([
      ["2 bread", []],
      ["a knife", ["durability 50%"]],
    ]);
  });
});
