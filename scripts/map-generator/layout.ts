import type { ObjectKind } from "@village/shared";
import type { TileName } from "./tileset";

/** A tile-space rectangle; `left`/`top` are the top-left tile. */
export interface TileRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DoorSpec {
  name: string;
  x: number;
  y: number;
}

/** An interior wall run inside a building; tiles listed in `gaps` stay open. */
export interface PartitionSpec {
  y: number;
  left: number;
  right: number;
  gaps: number[];
}

/** An indoor place: `area` includes its outer walls. */
export interface BuildingSpec {
  name: string;
  area: TileRect;
  floor: TileName;
  doors: DoorSpec[];
  partitions: PartitionSpec[];
}

export interface OutdoorPlaceSpec {
  name: string;
  area: TileRect;
  ground: TileName;
}

export interface ObjectSpec {
  name: string;
  kind: ObjectKind;
  place: string;
  x: number;
  y: number;
}

export interface PathSpec {
  area: TileRect;
}

export interface VillageLayout {
  buildings: BuildingSpec[];
  outdoorPlaces: OutdoorPlaceSpec[];
  objects: ObjectSpec[];
  paths: PathSpec[];
  spawns: Record<string, { x: number; y: number }>;
  decorTrees: { x: number; y: number }[];
}

const COTTAGE_NAMES = [
  "rose cottage",
  "ivy cottage",
  "stone cottage",
  "willow cottage",
  "hill cottage",
] as const;
const COTTAGE_FIRST_LEFT = 2;
const COTTAGE_SPACING = 7;
const COTTAGE_TOP = 2;
const COTTAGE_WIDTH = 6;
const COTTAGE_HEIGHT = 5;

function buildCottages(): {
  buildings: BuildingSpec[];
  objects: ObjectSpec[];
  paths: PathSpec[];
  spawns: VillageLayout["spawns"];
} {
  const buildings: BuildingSpec[] = [];
  const objects: ObjectSpec[] = [];
  const paths: PathSpec[] = [];
  const spawns: VillageLayout["spawns"] = {};
  COTTAGE_NAMES.forEach((name, index) => {
    const left = COTTAGE_FIRST_LEFT + index * COTTAGE_SPACING;
    const bottom = COTTAGE_TOP + COTTAGE_HEIGHT - 1;
    const doorX = left + 2;
    buildings.push({
      name,
      area: { left, top: COTTAGE_TOP, width: COTTAGE_WIDTH, height: COTTAGE_HEIGHT },
      floor: "wood_floor",
      doors: [{ name: `${name} door`, x: doorX, y: bottom }],
      partitions: [],
    });
    objects.push({
      name: `${name} bed`,
      kind: "bed",
      place: name,
      x: left + 1,
      y: COTTAGE_TOP + 1,
    });
    paths.push({ area: { left: doorX, top: bottom + 1, width: 1, height: 1 } });
    spawns[name] = { x: left + 3, y: COTTAGE_TOP + 2 };
  });
  return { buildings, objects, paths, spawns };
}

/**
 * The village plan, in tiles. The tavern has a front door, a back door and a back room behind a
 * partition, so sight and sound around corners have something to work with.
 */
export function buildVillageLayout(): VillageLayout {
  const cottages = buildCottages();
  const buildings: BuildingSpec[] = [
    ...cottages.buildings,
    {
      name: "bakery",
      area: { left: 2, top: 11, width: 9, height: 7 },
      floor: "stone_floor",
      doors: [{ name: "bakery door", x: 6, y: 11 }],
      partitions: [],
    },
    {
      name: "tavern",
      area: { left: 27, top: 11, width: 11, height: 10 },
      floor: "wood_floor",
      doors: [
        { name: "tavern front door", x: 31, y: 11 },
        { name: "tavern back door", x: 29, y: 20 },
      ],
      partitions: [{ y: 16, left: 28, right: 36, gaps: [35] }],
    },
  ];

  const outdoorPlaces: OutdoorPlaceSpec[] = [
    { name: "town square", area: { left: 13, top: 11, width: 12, height: 8 }, ground: "path" },
    { name: "farm", area: { left: 2, top: 21, width: 13, height: 7 }, ground: "grass" },
    { name: "woodlot", area: { left: 26, top: 23, width: 12, height: 5 }, ground: "grass" },
  ];

  const objects: ObjectSpec[] = [
    ...cottages.objects,
    { name: "oven", kind: "oven", place: "bakery", x: 3, y: 12 },
    { name: "brew kettle", kind: "brew_kettle", place: "tavern", x: 36, y: 12 },
    { name: "card table", kind: "card_table", place: "tavern", x: 31, y: 14 },
    { name: "spare bed", kind: "bed", place: "tavern", x: 36, y: 18 },
    { name: "notice board", kind: "notice_board", place: "town square", x: 18, y: 12 },
    { name: "bench", kind: "bench", place: "town square", x: 16, y: 16 },
    { name: "wheat field", kind: "wheat_field", place: "farm", x: 8, y: 24 },
    { name: "trees", kind: "trees", place: "woodlot", x: 31, y: 25 },
  ];
  for (const building of buildings) {
    for (const door of building.doors) {
      objects.push({ name: door.name, kind: "door", place: building.name, x: door.x, y: door.y });
    }
  }

  const paths: PathSpec[] = [
    ...cottages.paths,
    { area: { left: 1, top: 8, width: 38, height: 2 } },
    { area: { left: 6, top: 10, width: 1, height: 1 } },
    { area: { left: 31, top: 10, width: 1, height: 1 } },
    { area: { left: 25, top: 10, width: 1, height: 18 } },
    { area: { left: 1, top: 19, width: 25, height: 2 } },
    { area: { left: 25, top: 21, width: 5, height: 1 } },
    { area: { left: 29, top: 22, width: 1, height: 1 } },
  ];

  const spawns: VillageLayout["spawns"] = {
    ...cottages.spawns,
    bakery: { x: 6, y: 14 },
    tavern: { x: 32, y: 13 },
    "town square": { x: 19, y: 15 },
    farm: { x: 8, y: 22 },
    woodlot: { x: 29, y: 24 },
  };

  const decorTrees = [
    { x: 27, y: 24 },
    { x: 34, y: 24 },
    { x: 36, y: 26 },
    { x: 28, y: 27 },
    { x: 33, y: 27 },
    { x: 20, y: 24 },
    { x: 22, y: 26 },
    { x: 37, y: 3 },
    { x: 12, y: 13 },
  ];

  return { buildings, outdoorPlaces, objects, paths, spawns, decorTrees };
}

export function isInsideRect(rect: TileRect, x: number, y: number): boolean {
  return (
    x >= rect.left && y >= rect.top && x < rect.left + rect.width && y < rect.top + rect.height
  );
}
