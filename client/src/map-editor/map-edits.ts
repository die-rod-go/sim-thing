import type { MapLayout, MapTileLayerName, Position } from "@village/shared";
import {
  findCellIndex,
  isInsideMap,
  type ItemDraft,
  type MapDocument,
  type PlaceDraft,
  type StartDraft,
} from "./map-document";

/** A rectangle of tiles. */
export interface TileRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The rectangle two corner tiles span, whichever way round they are. */
export function spanTiles(first: Position, second: Position): TileRectangle {
  return {
    x: Math.min(first.x, second.x),
    y: Math.min(first.y, second.y),
    width: Math.abs(first.x - second.x) + 1,
    height: Math.abs(first.y - second.y) + 1,
  };
}

/** Every tile on the straight line between two tiles, so a fast drag paints without gaps. */
export function listLineTiles(from: Position, to: Position): Position[] {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  if (steps === 0) return [{ ...from }];
  return Array.from({ length: steps + 1 }, (_, step) => ({
    x: Math.round(from.x + ((to.x - from.x) * step) / steps),
    y: Math.round(from.y + ((to.y - from.y) * step) / steps),
  }));
}

function withLayer(document: MapDocument, layer: MapTileLayerName, data: number[]): MapDocument {
  return { ...document, tileLayers: { ...document.tileLayers, [layer]: data } };
}

/** Sets these tiles of one layer to `gid` (0 clears them). Tiles off the map are skipped. */
export function paintTiles(
  document: MapDocument,
  layer: MapTileLayerName,
  positions: readonly Position[],
  gid: number,
): MapDocument {
  const current = document.tileLayers[layer];
  const cellIndexes = positions
    .filter((position) => isInsideMap(document, position))
    .map((position) => findCellIndex(document, position))
    .filter((cellIndex) => current[cellIndex] !== gid);
  if (cellIndexes.length === 0) return document;
  const data = [...current];
  for (const cellIndex of cellIndexes) data[cellIndex] = gid;
  return withLayer(document, layer, data);
}

export function fillRectangle(
  document: MapDocument,
  layer: MapTileLayerName,
  rectangle: TileRectangle,
  gid: number,
): MapDocument {
  const positions: Position[] = [];
  for (let y = rectangle.y; y < rectangle.y + rectangle.height; y++) {
    for (let x = rectangle.x; x < rectangle.x + rectangle.width; x++) positions.push({ x, y });
  }
  return paintTiles(document, layer, positions, gid);
}

const NEIGHBOR_OFFSETS: readonly Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Paints the connected run of same tiles around `start` on one layer, like a paint bucket. */
export function floodFill(
  document: MapDocument,
  layer: MapTileLayerName,
  start: Position,
  gid: number,
): MapDocument {
  if (!isInsideMap(document, start)) return document;
  const data = document.tileLayers[layer];
  const targetGid = data[findCellIndex(document, start)];
  if (targetGid === gid) return document;
  const queue: Position[] = [start];
  const seen = new Set<number>([findCellIndex(document, start)]);
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
    const current = queue[queueIndex]!;
    for (const offset of NEIGHBOR_OFFSETS) {
      const neighbor = { x: current.x + offset.x, y: current.y + offset.y };
      if (!isInsideMap(document, neighbor)) continue;
      const cellIndex = findCellIndex(document, neighbor);
      if (seen.has(cellIndex) || data[cellIndex] !== targetGid) continue;
      seen.add(cellIndex);
      queue.push(neighbor);
    }
  }
  return paintTiles(document, layer, queue, gid);
}

function clipRectangle(rectangle: TileRectangle, width: number, height: number): TileRectangle {
  const x = Math.max(0, rectangle.x);
  const y = Math.max(0, rectangle.y);
  return {
    x,
    y,
    width: Math.min(rectangle.x + rectangle.width, width) - x,
    height: Math.min(rectangle.y + rectangle.height, height) - y,
  };
}

function resizeLayer(
  data: readonly number[],
  from: { width: number; height: number },
  to: { width: number; height: number },
  fillGid: number,
): number[] {
  const resized = new Array<number>(to.width * to.height).fill(fillGid);
  for (let y = 0; y < Math.min(from.height, to.height); y++) {
    for (let x = 0; x < Math.min(from.width, to.width); x++) {
      resized[y * to.width + x] = data[y * from.width + x] ?? fillGid;
    }
  }
  return resized;
}

/** What shrinking the map to this size would remove, by name, so the editor can warn first. */
export function listLostByResize(document: MapDocument, width: number, height: number): string[] {
  const resized = { ...document, width, height };
  const lostPlaces = document.places
    .filter((place) => {
      const clipped = clipRectangle(place, width, height);
      return clipped.width < 1 || clipped.height < 1;
    })
    .map((place) => `place "${place.name}"`);
  const lostItems = document.items
    .filter((item) => !isInsideMap(resized, item))
    .map((item) => `"${item.label}"`);
  const lostStarts = document.starts
    .filter((start) => !isInsideMap(resized, start))
    .map((start) => `${start.agentId}'s start tile`);
  return [...lostPlaces, ...lostItems, ...lostStarts];
}

/**
 * Grows or shrinks the map from its bottom-right corner. New ground takes `groundFillGid`; new
 * walls and decor are empty. Places are clipped to the new edge; anything left outside is removed.
 */
export function resizeMap(
  document: MapDocument,
  width: number,
  height: number,
  groundFillGid: number,
): MapDocument {
  const from = { width: document.width, height: document.height };
  const to = { width, height };
  const resized = { ...document, width, height };
  return {
    ...resized,
    tileLayers: {
      ground: resizeLayer(document.tileLayers.ground, from, to, groundFillGid),
      walls: resizeLayer(document.tileLayers.walls, from, to, 0),
      decor: resizeLayer(document.tileLayers.decor, from, to, 0),
    },
    places: document.places
      .map((place) => ({ ...place, ...clipRectangle(place, width, height) }))
      .filter((place) => place.width > 0 && place.height > 0),
    items: document.items.filter((item) => isInsideMap(resized, item)),
    starts: document.starts.filter((start) => isInsideMap(resized, start)),
  };
}

/** The first of `base`, `base 2`, `base 3`… that `isTaken` says is free. */
export function findUnusedName(base: string, isTaken: (name: string) => boolean): string {
  if (!isTaken(base)) return base;
  let suffix = 2;
  while (isTaken(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

export function addPlace(
  document: MapDocument,
  rectangle: TileRectangle,
  baseName: string,
): { document: MapDocument; id: number } {
  const usedNames = new Set(document.places.map((place) => place.name));
  const place: PlaceDraft = {
    id: document.nextObjectId,
    name: findUnusedName(baseName, (name) => usedNames.has(name)),
    isIndoor: false,
    ...clipRectangle(rectangle, document.width, document.height),
  };
  return {
    document: {
      ...document,
      places: [...document.places, place],
      nextObjectId: document.nextObjectId + 1,
    },
    id: place.id,
  };
}

export function updatePlace(
  document: MapDocument,
  id: number,
  changes: Partial<Omit<PlaceDraft, "id">>,
): MapDocument {
  return {
    ...document,
    places: document.places.map((place) => (place.id === id ? { ...place, ...changes } : place)),
  };
}

export function removePlace(document: MapDocument, id: number): MapDocument {
  return { ...document, places: document.places.filter((place) => place.id !== id) };
}

export function addItem(
  document: MapDocument,
  definitionId: string,
  baseLabel: string,
  position: Position,
): { document: MapDocument; id: number } {
  const usedLabels = new Set(document.items.map((item) => item.label.toLowerCase()));
  const item: ItemDraft = {
    id: document.nextObjectId,
    label: findUnusedName(baseLabel, (label) => usedLabels.has(label.toLowerCase())),
    definitionId,
    ...position,
  };
  return {
    document: {
      ...document,
      items: [...document.items, item],
      nextObjectId: document.nextObjectId + 1,
    },
    id: item.id,
  };
}

export function updateItem(
  document: MapDocument,
  id: number,
  changes: Partial<Omit<ItemDraft, "id">>,
): MapDocument {
  return {
    ...document,
    items: document.items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
  };
}

export function removeItem(document: MapDocument, id: number): MapDocument {
  return { ...document, items: document.items.filter((item) => item.id !== id) };
}

/** Puts a character's start tile here, moving it if they already had one. */
export function setStart(document: MapDocument, agentId: string, position: Position): MapDocument {
  const existing = document.starts.find((start) => start.agentId === agentId);
  if (existing) {
    return {
      ...document,
      starts: document.starts.map((start) =>
        start.agentId === agentId ? { ...start, ...position } : start,
      ),
    };
  }
  const start: StartDraft = { id: document.nextObjectId, agentId, ...position };
  return {
    ...document,
    starts: [...document.starts, start],
    nextObjectId: document.nextObjectId + 1,
  };
}

export function removeStart(document: MapDocument, agentId: string): MapDocument {
  return { ...document, starts: document.starts.filter((start) => start.agentId !== agentId) };
}

/** The map as the shared checks see it: only the walls layer blocks. */
export function buildMapLayout(document: MapDocument): MapLayout {
  return {
    width: document.width,
    height: document.height,
    isWall: document.tileLayers.walls.map((gid) => gid !== 0),
    places: document.places,
    placements: document.items.map((item) => ({
      label: item.label,
      definitionId: item.definitionId,
      pos: { x: item.x, y: item.y },
    })),
    startTiles: Object.fromEntries(
      document.starts.map((start) => [start.agentId, { x: start.x, y: start.y }]),
    ),
  };
}
