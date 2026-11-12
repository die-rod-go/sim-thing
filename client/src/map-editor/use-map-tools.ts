import { useCallback, useRef, useState } from "react";
import type { MapReferences, MapTileLayerName, Position } from "@village/shared";
import { clientConfig } from "../client-config";
import type { MapDocument } from "./map-document";
import {
  addItem,
  addPlace,
  fillRectangle,
  floodFill,
  listLineTiles,
  paintTiles,
  setStart,
  spanTiles,
  type TileRectangle,
} from "./map-edits";
import {
  findSelectedPlace,
  findSelectionAt,
  isPlaceResizeHandle,
  moveSelection,
  resizePlaceToCorner,
  type MapSelection,
} from "./map-selection";
import type { MapEditorClient } from "./use-map-editor";

export type MapTool =
  "select" | "paint" | "rectangle" | "fill" | "erase" | "place" | "item" | "start";

export const TILE_TOOLS: readonly MapTool[] = ["paint", "rectangle", "fill", "erase"];

export interface ToolSettings {
  tool: MapTool;
  tileLayer: MapTileLayerName;
  tileGid: number;
  definitionId: string | null;
  agentId: string | null;
}

type Drag =
  | { kind: "stroke"; last: Position; gid: number }
  | { kind: "rectangle"; start: Position; gid: number }
  | { kind: "new place"; start: Position }
  | { kind: "move"; selection: MapSelection; origin: Position }
  | { kind: "resize place"; id: number };

export interface MapToolsInput {
  editor: MapEditorClient;
  references: MapReferences;
}

export interface MapTools {
  settings: ToolSettings;
  changeSettings: (changes: Partial<ToolSettings>) => void;
  preview: TileRectangle | null;
  hoveredTile: Position | null;
  pressTile: (tile: Position, isSecondaryButton: boolean) => void;
  dragTo: (tile: Position | null) => void;
  release: () => void;
}

function findNextUnplacedCharacter(
  document: MapDocument,
  references: MapReferences,
  afterAgentId: string,
): string | null {
  const placedIds = new Set(document.starts.map((start) => start.agentId));
  const characters = references.characters;
  const startIndex = characters.findIndex((character) => character.id === afterAgentId);
  const ordered = [...characters.slice(startIndex + 1), ...characters.slice(0, startIndex + 1)];
  return ordered.find((character) => !placedIds.has(character.id))?.id ?? null;
}

/** The active tool and its settings, turning presses and drags on the map into edits. */
export function useMapTools({ editor, references }: MapToolsInput): MapTools {
  const [settings, setSettings] = useState<ToolSettings>({
    tool: "paint",
    tileLayer: "ground",
    tileGid: 1,
    definitionId: references.placeableItems[0]?.id ?? null,
    agentId: references.characters[0]?.id ?? null,
  });
  const [preview, setPreview] = useState<TileRectangle | null>(null);
  const [hoveredTile, setHoveredTile] = useState<Position | null>(null);
  const dragRef = useRef<Drag | null>(null);
  // The map when the press began, and the latest edit since: edits during one drag build on each
  // other before React re-renders, and fold into one undo step once the drag has changed the map.
  const pressedDocumentRef = useRef<MapDocument | null>(null);
  const workingDocumentRef = useRef<MapDocument | null>(null);
  const draft = editor.state.draft;

  const changeSettings = useCallback((changes: Partial<ToolSettings>) => {
    setSettings((current) => ({ ...current, ...changes }));
  }, []);

  const applyEdit = (document: MapDocument, selection?: MapSelection | null) => {
    const isContinuation = workingDocumentRef.current !== pressedDocumentRef.current;
    workingDocumentRef.current = document;
    editor.edit(document, { isContinuation, selection });
  };

  const pressSelectTool = (document: MapDocument, tile: Position) => {
    const selection = findSelectionAt(document, tile);
    editor.select(selection);
    if (!selection) return;
    const place = findSelectedPlace(document, selection);
    if (place && isPlaceResizeHandle(place, tile)) {
      dragRef.current = { kind: "resize place", id: place.id };
      return;
    }
    dragRef.current = { kind: "move", selection, origin: tile };
  };

  const pressItemTool = (document: MapDocument, tile: Position) => {
    const existing = findSelectionAt(document, tile);
    if (existing?.kind === "item") {
      editor.select(existing);
      return;
    }
    const definition = references.placeableItems.find(
      (candidate) => candidate.id === settings.definitionId,
    );
    if (!definition) return;
    const added = addItem(document, definition.id, definition.name, tile);
    applyEdit(added.document, { kind: "item", id: added.id });
  };

  const pressStartTool = (document: MapDocument, tile: Position) => {
    const { agentId } = settings;
    if (agentId === null) return;
    const placed = setStart(document, agentId, tile);
    applyEdit(placed, { kind: "start", agentId });
    const nextAgentId = findNextUnplacedCharacter(placed, references, agentId);
    if (nextAgentId !== null) changeSettings({ agentId: nextAgentId });
  };

  const pressTile = (tile: Position, isSecondaryButton: boolean) => {
    if (!draft) return;
    pressedDocumentRef.current = draft;
    workingDocumentRef.current = draft;
    const { tool, tileLayer } = settings;
    const gid = tool === "erase" || isSecondaryButton ? 0 : settings.tileGid;
    switch (tool) {
      case "paint":
      case "erase":
        applyEdit(paintTiles(draft, tileLayer, [tile], gid));
        dragRef.current = { kind: "stroke", last: tile, gid };
        return;
      case "rectangle":
        dragRef.current = { kind: "rectangle", start: tile, gid };
        setPreview(spanTiles(tile, tile));
        return;
      case "fill":
        applyEdit(floodFill(draft, tileLayer, tile, gid));
        return;
      case "place":
        dragRef.current = { kind: "new place", start: tile };
        setPreview(spanTiles(tile, tile));
        return;
      case "item":
        pressItemTool(draft, tile);
        return;
      case "start":
        pressStartTool(draft, tile);
        return;
      case "select":
        pressSelectTool(draft, tile);
        return;
    }
  };

  const dragTo = (tile: Position | null) => {
    setHoveredTile(tile);
    const drag = dragRef.current;
    const document = workingDocumentRef.current;
    if (!drag || !tile || !document) return;
    switch (drag.kind) {
      case "stroke": {
        const line = listLineTiles(drag.last, tile);
        applyEdit(paintTiles(document, settings.tileLayer, line, drag.gid));
        dragRef.current = { ...drag, last: tile };
        return;
      }
      case "rectangle":
      case "new place":
        setPreview(spanTiles(drag.start, tile));
        return;
      case "move": {
        const pressedDocument = pressedDocumentRef.current ?? document;
        const offset = { x: tile.x - drag.origin.x, y: tile.y - drag.origin.y };
        applyEdit(moveSelection(pressedDocument, drag.selection, offset));
        return;
      }
      case "resize place":
        applyEdit(resizePlaceToCorner(document, drag.id, tile));
        return;
    }
  };

  const release = () => {
    const drag = dragRef.current;
    const document = workingDocumentRef.current;
    dragRef.current = null;
    setPreview(null);
    if (!drag || !document || !preview) return;
    if (drag.kind === "rectangle") {
      applyEdit(fillRectangle(document, settings.tileLayer, preview, drag.gid));
    }
    if (drag.kind === "new place") {
      const added = addPlace(document, preview, clientConfig.mapEditor.newPlaceName);
      applyEdit(added.document, { kind: "place", id: added.id });
    }
  };

  return { settings, changeSettings, preview, hoveredTile, pressTile, dragTo, release };
}
