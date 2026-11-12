import { MAP_TILE_LAYER_NAMES, type Glyph, type MapTileLayerName } from "@village/shared";
import { clientConfig } from "../client-config";
import type { GlyphPainter } from "../village/glyph-painter";
import type { MapDocument, PlaceDraft } from "./map-document";
import type { TileRectangle } from "./map-edits";
import {
  findSelectedItem,
  findSelectedPlace,
  findSelectedStart,
  type MapSelection,
} from "./map-selection";

/** What the editor shows; each can be hidden while editing the others. */
export type MapView = MapTileLayerName | "places" | "items" | "starts" | "grid";

export const MAP_VIEWS: readonly MapView[] = [
  ...MAP_TILE_LAYER_NAMES,
  "places",
  "items",
  "starts",
  "grid",
];

export interface TilePaintingInput {
  document: MapDocument;
  glyphsByGid: ReadonlyMap<number, Glyph>;
  glyphPainter: GlyphPainter;
  hiddenViews: ReadonlySet<MapView>;
  cellSize: number;
}

/** Draws the visible tile layers, ground first. */
export function paintTiles(context: CanvasRenderingContext2D, input: TilePaintingInput): void {
  const { document, glyphsByGid, glyphPainter, hiddenViews, cellSize } = input;
  context.fillStyle = clientConfig.mapEditor.emptyTileColor;
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  for (const layerName of MAP_TILE_LAYER_NAMES) {
    if (hiddenViews.has(layerName)) continue;
    const data = document.tileLayers[layerName];
    for (let cellIndex = 0; cellIndex < data.length; cellIndex++) {
      const glyph = glyphsByGid.get(data[cellIndex] ?? 0);
      if (!glyph) continue;
      const cell = {
        x: (cellIndex % document.width) * cellSize,
        y: Math.floor(cellIndex / document.width) * cellSize,
        width: cellSize,
        height: cellSize,
      };
      glyphPainter.drawGlyph(context, glyph, cell);
    }
  }
}

export interface OverlayPaintingInput {
  document: MapDocument;
  glyphPainter: GlyphPainter;
  hiddenViews: ReadonlySet<MapView>;
  cellSize: number;
  itemGlyphsByDefinition: ReadonlyMap<string, Glyph>;
  startGlyphsByAgent: ReadonlyMap<string, Glyph>;
  fallbackItemGlyph: Glyph;
  fallbackStartGlyph: Glyph;
  selection: MapSelection | null;
  hoveredTile: { x: number; y: number } | null;
  preview: TileRectangle | null;
}

function toPixels(rectangle: TileRectangle, cellSize: number) {
  return {
    x: rectangle.x * cellSize,
    y: rectangle.y * cellSize,
    width: rectangle.width * cellSize,
    height: rectangle.height * cellSize,
  };
}

function paintGrid(context: CanvasRenderingContext2D, document: MapDocument, cellSize: number) {
  context.strokeStyle = clientConfig.mapEditor.gridColor;
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 1; x < document.width; x++) {
    context.moveTo(x * cellSize + 0.5, 0);
    context.lineTo(x * cellSize + 0.5, document.height * cellSize);
  }
  for (let y = 1; y < document.height; y++) {
    context.moveTo(0, y * cellSize + 0.5);
    context.lineTo(document.width * cellSize, y * cellSize + 0.5);
  }
  context.stroke();
}

function paintPlace(context: CanvasRenderingContext2D, place: PlaceDraft, cellSize: number) {
  const settings = clientConfig.mapEditor;
  const area = toPixels(place, cellSize);
  context.fillStyle = place.isIndoor ? settings.indoorPlaceFillColor : settings.placeFillColor;
  context.fillRect(area.x, area.y, area.width, area.height);
  context.strokeStyle = place.isIndoor
    ? settings.indoorPlaceOutlineColor
    : settings.placeOutlineColor;
  context.lineWidth = 1;
  context.strokeRect(area.x + 0.5, area.y + 0.5, area.width - 1, area.height - 1);
  const handleSize = cellSize * settings.resizeHandleFraction;
  context.fillRect(
    area.x + area.width - handleSize,
    area.y + area.height - handleSize,
    handleSize,
    handleSize,
  );
  const label = place.name.trim() || "unnamed";
  context.font = settings.placeLabelFont;
  const labelWidth = context.measureText(label).width + settings.placeLabelPadding * 2;
  context.fillStyle = settings.placeLabelBackground;
  context.fillRect(area.x, area.y, labelWidth, settings.placeLabelHeight);
  context.fillStyle = settings.placeLabelColor;
  context.textBaseline = "middle";
  context.fillText(
    label,
    area.x + settings.placeLabelPadding,
    area.y + settings.placeLabelHeight / 2,
  );
}

function findSelectionArea(
  document: MapDocument,
  selection: MapSelection | null,
): TileRectangle | null {
  const place = findSelectedPlace(document, selection);
  if (place) return place;
  const thing = findSelectedItem(document, selection) ?? findSelectedStart(document, selection);
  return thing ? { x: thing.x, y: thing.y, width: 1, height: 1 } : null;
}

/** Draws places, items, start tiles, the selection, the hovered tile and any drag preview. */
export function paintOverlay(context: CanvasRenderingContext2D, input: OverlayPaintingInput) {
  const { document, glyphPainter, hiddenViews, cellSize } = input;
  const settings = clientConfig.mapEditor;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (!hiddenViews.has("grid")) paintGrid(context, document, cellSize);
  if (!hiddenViews.has("places")) {
    for (const place of document.places) paintPlace(context, place, cellSize);
  }
  const cellAt = (position: { x: number; y: number }) => ({
    x: position.x * cellSize,
    y: position.y * cellSize,
    width: cellSize,
    height: cellSize,
  });
  if (!hiddenViews.has("items")) {
    for (const item of document.items) {
      const glyph = input.itemGlyphsByDefinition.get(item.definitionId) ?? input.fallbackItemGlyph;
      glyphPainter.drawGlyph(context, glyph, cellAt(item));
    }
  }
  if (!hiddenViews.has("starts")) {
    for (const start of document.starts) {
      const glyph = input.startGlyphsByAgent.get(start.agentId) ?? input.fallbackStartGlyph;
      glyphPainter.drawGlyph(context, glyph, cellAt(start));
    }
  }
  if (input.preview) {
    const area = toPixels(input.preview, cellSize);
    context.fillStyle = settings.previewColor;
    context.fillRect(area.x, area.y, area.width, area.height);
  }
  if (input.hoveredTile) {
    const area = cellAt(input.hoveredTile);
    context.strokeStyle = settings.hoverColor;
    context.lineWidth = 1;
    context.strokeRect(area.x + 0.5, area.y + 0.5, area.width - 1, area.height - 1);
  }
  const selectionArea = findSelectionArea(document, input.selection);
  if (selectionArea) {
    const area = toPixels(selectionArea, cellSize);
    const inset = settings.selectionLineWidth / 2;
    context.strokeStyle = settings.selectionColor;
    context.lineWidth = settings.selectionLineWidth;
    context.strokeRect(
      area.x + inset,
      area.y + inset,
      area.width - settings.selectionLineWidth,
      area.height - settings.selectionLineWidth,
    );
  }
}
