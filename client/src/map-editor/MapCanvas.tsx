import { useEffect, useRef, type PointerEvent } from "react";
import type { Glyph, Position } from "@village/shared";
import type { GlyphPainter } from "../village/glyph-painter";
import type { MapDocument } from "./map-document";
import type { TileRectangle } from "./map-edits";
import { paintOverlay, paintTiles, type MapView } from "./map-painting";
import type { MapSelection } from "./map-selection";

const SECONDARY_MOUSE_BUTTON = 2;

interface MapCanvasProps {
  document: MapDocument;
  glyphPainter: GlyphPainter;
  glyphsByGid: ReadonlyMap<number, Glyph>;
  itemGlyphsByDefinition: ReadonlyMap<string, Glyph>;
  startGlyphsByAgent: ReadonlyMap<string, Glyph>;
  fallbackItemGlyph: Glyph;
  fallbackStartGlyph: Glyph;
  hiddenViews: ReadonlySet<MapView>;
  zoom: number;
  selection: MapSelection | null;
  hoveredTile: Position | null;
  preview: TileRectangle | null;
  cursor: string;
  onPressTile: (tile: Position, isSecondaryButton: boolean) => void;
  onDragTo: (tile: Position | null) => void;
  onRelease: () => void;
}

function getContext(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  const context = canvas?.getContext("2d") ?? null;
  if (context) context.imageSmoothingEnabled = false;
  return context;
}

/** The map drawn as tiles with places, items and start tiles over them; reports tile presses. */
export function MapCanvas(props: MapCanvasProps) {
  const { document, glyphPainter, glyphsByGid, hiddenViews, zoom } = props;
  const tileCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const cellSize = document.tileSize * zoom;
  const pixelWidth = document.width * cellSize;
  const pixelHeight = document.height * cellSize;

  useEffect(() => {
    const context = getContext(tileCanvasRef.current);
    if (!context) return;
    paintTiles(context, { document, glyphsByGid, glyphPainter, hiddenViews, cellSize });
    // Keyed on the tile layers rather than the whole map, so moving a place doesn't repaint tiles.
  }, [document.tileLayers, document.width, glyphsByGid, glyphPainter, hiddenViews, cellSize]);

  useEffect(() => {
    const context = getContext(overlayCanvasRef.current);
    if (!context) return;
    paintOverlay(context, { ...props, cellSize });
  });

  const findTile = (event: PointerEvent<HTMLCanvasElement>): Position | null => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const tile = {
      x: Math.floor((event.clientX - bounds.left) / cellSize),
      y: Math.floor((event.clientY - bounds.top) / cellSize),
    };
    const isInside =
      tile.x >= 0 && tile.y >= 0 && tile.x < document.width && tile.y < document.height;
    return isInside ? tile : null;
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const tile = findTile(event);
    if (!tile) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    props.onPressTile(tile, event.button === SECONDARY_MOUSE_BUTTON);
  };

  return (
    <div className="map-canvas-stack" style={{ width: pixelWidth, height: pixelHeight }}>
      <canvas ref={tileCanvasRef} width={pixelWidth} height={pixelHeight} />
      <canvas
        ref={overlayCanvasRef}
        width={pixelWidth}
        height={pixelHeight}
        style={{ cursor: props.cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={(event) => props.onDragTo(findTile(event))}
        onPointerUp={props.onRelease}
        onPointerCancel={props.onRelease}
        onPointerLeave={() => props.onDragTo(null)}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}
