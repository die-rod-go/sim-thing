import type { Position } from "@village/shared";
import type { MapDocument, PlaceDraft } from "./map-document";
import {
  removeItem,
  removePlace,
  removeStart,
  updateItem,
  updatePlace,
  setStart,
} from "./map-edits";

export type MapSelection =
  { kind: "place"; id: number } | { kind: "item"; id: number } | { kind: "start"; agentId: string };

function isInPlace(place: PlaceDraft, position: Position): boolean {
  return (
    position.x >= place.x &&
    position.y >= place.y &&
    position.x < place.x + place.width &&
    position.y < place.y + place.height
  );
}

/** What a click on this tile picks: a start tile, then an item, then the smallest place there. */
export function findSelectionAt(document: MapDocument, position: Position): MapSelection | null {
  const isHere = (thing: Position) => thing.x === position.x && thing.y === position.y;
  const start = document.starts.findLast(isHere);
  if (start) return { kind: "start", agentId: start.agentId };
  const item = document.items.findLast(isHere);
  if (item) return { kind: "item", id: item.id };
  const places = document.places
    .filter((place) => isInPlace(place, position))
    .sort((first, second) => first.width * first.height - second.width * second.height);
  const place = places[0];
  return place ? { kind: "place", id: place.id } : null;
}

export function isSameSelection(first: MapSelection | null, second: MapSelection | null): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function findSelectedPlace(document: MapDocument, selection: MapSelection | null) {
  return selection?.kind === "place"
    ? document.places.find((place) => place.id === selection.id)
    : undefined;
}

export function findSelectedItem(document: MapDocument, selection: MapSelection | null) {
  return selection?.kind === "item"
    ? document.items.find((item) => item.id === selection.id)
    : undefined;
}

export function findSelectedStart(document: MapDocument, selection: MapSelection | null) {
  return selection?.kind === "start"
    ? document.starts.find((start) => start.agentId === selection.agentId)
    : undefined;
}

/** Whether the selection still names something on the map (undo may have removed it). */
export function isSelectionOnMap(document: MapDocument, selection: MapSelection): boolean {
  return (
    findSelectedPlace(document, selection) !== undefined ||
    findSelectedItem(document, selection) !== undefined ||
    findSelectedStart(document, selection) !== undefined
  );
}

/** The bottom-right tile of a place bigger than one tile: dragging it resizes the place. */
export function isPlaceResizeHandle(place: PlaceDraft, position: Position): boolean {
  const isBiggerThanOneTile = place.width > 1 || place.height > 1;
  return (
    isBiggerThanOneTile &&
    position.x === place.x + place.width - 1 &&
    position.y === place.y + place.height - 1
  );
}

/** Moves the bottom-right corner of a place to this tile, keeping it at least one tile big. */
export function resizePlaceToCorner(
  document: MapDocument,
  id: number,
  corner: Position,
): MapDocument {
  const place = document.places.find((candidate) => candidate.id === id);
  if (!place) return document;
  return updatePlace(document, id, {
    width: Math.max(1, Math.min(corner.x, document.width - 1) - place.x + 1),
    height: Math.max(1, Math.min(corner.y, document.height - 1) - place.y + 1),
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Moves the selected thing by `offset` tiles, keeping it on the map. */
export function moveSelection(
  document: MapDocument,
  selection: MapSelection,
  offset: Position,
): MapDocument {
  const place = findSelectedPlace(document, selection);
  if (place) {
    return updatePlace(document, place.id, {
      x: clamp(place.x + offset.x, 0, document.width - place.width),
      y: clamp(place.y + offset.y, 0, document.height - place.height),
    });
  }
  const moveTile = (position: Position) => ({
    x: clamp(position.x + offset.x, 0, document.width - 1),
    y: clamp(position.y + offset.y, 0, document.height - 1),
  });
  const item = findSelectedItem(document, selection);
  if (item) return updateItem(document, item.id, moveTile(item));
  const start = findSelectedStart(document, selection);
  if (start) return setStart(document, start.agentId, moveTile(start));
  return document;
}

export function removeSelection(document: MapDocument, selection: MapSelection): MapDocument {
  switch (selection.kind) {
    case "place":
      return removePlace(document, selection.id);
    case "item":
      return removeItem(document, selection.id);
    case "start":
      return removeStart(document, selection.agentId);
  }
}
