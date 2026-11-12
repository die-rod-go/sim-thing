import type { Glyph } from "./glyph";
import type { Position } from "./types";

/** Layer names in `maps/village.json`, shared by the sim, the village view and the map editor. */
export const MAP_LAYER_NAMES = {
  ground: "ground",
  walls: "walls",
  decor: "decor",
  places: "places",
  objects: "objects",
  starts: "starts",
} as const;

export const MAP_TILE_LAYER_NAMES = [
  MAP_LAYER_NAMES.ground,
  MAP_LAYER_NAMES.walls,
  MAP_LAYER_NAMES.decor,
] as const;

export type MapTileLayerName = (typeof MAP_TILE_LAYER_NAMES)[number];

/** A named rectangle of the map, in tiles. */
export interface MapPlaceArea {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the map checks look at, in tiles: walls, places, placed items and start tiles. */
export interface MapLayout {
  width: number;
  height: number;
  /** Row-major: index = y * width + x. */
  isWall: readonly boolean[];
  places: readonly MapPlaceArea[];
  placements: readonly { label: string; definitionId: string; pos: Position }[];
  /** Each character's start tile, by seed agent id. */
  startTiles: Readonly<Record<string, Position>>;
}

/** What else the map names: item definitions it may place and the characters it starts. */
export interface MapReferences {
  placeableItems: { id: string; name: string; glyph: Glyph }[];
  characters: { id: string; name: string }[];
}

export type MapProblemSeverity = "error" | "warning";

export interface MapProblem {
  severity: MapProblemSeverity;
  message: string;
}

export function hasMapErrors(problems: readonly MapProblem[]): boolean {
  return problems.some((problem) => problem.severity === "error");
}

function isInsideLayout(layout: MapLayout, position: Position): boolean {
  return (
    position.x >= 0 && position.y >= 0 && position.x < layout.width && position.y < layout.height
  );
}

function isWallAt(layout: MapLayout, position: Position): boolean {
  return layout.isWall[position.y * layout.width + position.x] === true;
}

function doPlacesOverlap(first: MapPlaceArea, second: MapPlaceArea): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

function findPlaceProblems(layout: MapLayout): MapProblem[] {
  const problems: MapProblem[] = [];
  const error = (message: string) => problems.push({ severity: "error", message });
  const seenNames = new Set<string>();
  layout.places.forEach((place, placeIndex) => {
    const name = place.name.trim();
    if (name === "") error(`Place #${placeIndex + 1} needs a name.`);
    else if (seenNames.has(name)) error(`Two places are called "${name}".`);
    seenNames.add(name);
    if (place.width < 1 || place.height < 1) error(`Place "${name}" has no area.`);
    const isInside =
      isInsideLayout(layout, place) &&
      place.x + place.width <= layout.width &&
      place.y + place.height <= layout.height;
    if (!isInside) error(`Place "${name}" reaches past the edge of the map.`);
    for (const laterPlace of layout.places.slice(placeIndex + 1)) {
      if (!doPlacesOverlap(place, laterPlace)) continue;
      problems.push({
        severity: "warning",
        message: `"${name}" and "${laterPlace.name}" overlap; the shared tiles belong to "${name}".`,
      });
    }
  });
  return problems;
}

function findPlacementProblems(layout: MapLayout, references: MapReferences): MapProblem[] {
  const problems: MapProblem[] = [];
  const placeableIds = new Set(references.placeableItems.map((item) => item.id));
  const seenLabels = new Set<string>();
  for (const placement of layout.placements) {
    const label = placement.label.trim();
    const add = (severity: MapProblemSeverity, message: string) =>
      problems.push({ severity, message });
    if (label === "") add("error", `A ${placement.definitionId} on the map needs a name.`);
    else if (seenLabels.has(label.toLowerCase())) add("error", `Two items are called "${label}".`);
    seenLabels.add(label.toLowerCase());
    if (!placeableIds.has(placement.definitionId)) {
      add("error", `"${label}" is a "${placement.definitionId}", which items.json doesn't define.`);
    }
    if (!isInsideLayout(layout, placement.pos)) add("error", `"${label}" is off the map.`);
    else if (isWallAt(layout, placement.pos)) add("warning", `"${label}" sits on a wall.`);
  }
  return problems;
}

function findStartProblems(layout: MapLayout, references: MapReferences): MapProblem[] {
  const problems: MapProblem[] = [];
  const characterIds = new Set(references.characters.map((character) => character.id));
  for (const character of references.characters) {
    if (layout.startTiles[character.id]) continue;
    problems.push({
      severity: "error",
      message: `${character.name || character.id} has no start tile.`,
    });
  }
  for (const [agentId, position] of Object.entries(layout.startTiles)) {
    if (!characterIds.has(agentId)) {
      problems.push({
        severity: "warning",
        message: `A start tile is for "${agentId}", who isn't in agents.json; it's ignored.`,
      });
    }
    if (!isInsideLayout(layout, position)) {
      problems.push({ severity: "error", message: `${agentId}'s start tile is off the map.` });
    } else if (isWallAt(layout, position)) {
      problems.push({
        severity: "warning",
        message: `${agentId} starts on a wall, so they'll start on the nearest open tile.`,
      });
    }
  }
  return problems;
}

/** Everything wrong with a map. Errors stop it from being saved; warnings are allowed. */
export function findMapProblems(layout: MapLayout, references: MapReferences): MapProblem[] {
  return [
    ...findPlaceProblems(layout),
    ...findPlacementProblems(layout, references),
    ...findStartProblems(layout, references),
  ];
}
