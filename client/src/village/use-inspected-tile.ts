import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { Position } from "@village/shared";
import { clientConfig } from "../client-config";
import { inspectTile, type TileInspection, type TileInspectionSources } from "./tile-inspection";
import type { TiledMap } from "./tiled-map";

/** Handlers for the camera-scaled map layer, which spans exactly the map. */
export interface MapPointerHandlers {
  onPointerMove: (event: MouseEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
  onClick: (event: MouseEvent<HTMLElement>) => void;
}

export interface InspectedTile {
  /** The pinned tile while there is one, otherwise the tile the pointer has rested on. */
  shownTile: Position | null;
  isPinned: boolean;
  /** What is on the shown tile, kept current as the world changes. */
  inspection: TileInspection | null;
  unpin: () => void;
  mapPointerHandlers: MapPointerHandlers;
}

function isSameTile(first: Position | null, second: Position | null): boolean {
  return first !== null && second !== null && first.x === second.x && first.y === second.y;
}

/** The tile under a pointer, from where it falls inside the scaled map layer's box. */
export function findPointedTile(
  pointer: Position,
  layerBox: { left: number; top: number; width: number; height: number },
  map: Pick<TiledMap, "width" | "height">,
): Position | null {
  if (layerBox.width <= 0 || layerBox.height <= 0) return null;
  const x = Math.floor(((pointer.x - layerBox.left) / layerBox.width) * map.width);
  const y = Math.floor(((pointer.y - layerBox.top) / layerBox.height) * map.height);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return { x, y };
}

function readPointedTile(event: MouseEvent<HTMLElement>, map: TiledMap): Position | null {
  const pointer = { x: event.clientX, y: event.clientY };
  return findPointedTile(pointer, event.currentTarget.getBoundingClientRect(), map);
}

/**
 * Which map tile's card to show. A card appears once the pointer rests on a tile, then follows
 * it tile by tile without waiting again; a click pins it until Escape or a second click.
 */
export function useInspectedTile(sources: TileInspectionSources): InspectedTile {
  const { map } = sources;
  const [hoveredTile, setHoveredTile] = useState<Position | null>(null);
  const [pinnedTile, setPinnedTile] = useState<Position | null>(null);
  const pointedTile = useRef<Position | null>(null);
  const pendingTimer = useRef<number | null>(null);
  const isCardShown = useRef(false);

  const cancelPending = useCallback(() => {
    if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
  }, []);

  const pointAt = useCallback(
    (tile: Position) => {
      if (isSameTile(pointedTile.current, tile)) return;
      pointedTile.current = tile;
      if (isCardShown.current) {
        setHoveredTile(tile);
        return;
      }
      cancelPending();
      pendingTimer.current = window.setTimeout(() => {
        pendingTimer.current = null;
        isCardShown.current = true;
        setHoveredTile(pointedTile.current);
      }, clientConfig.village.hoverCardDelayMs);
    },
    [cancelPending],
  );

  const leaveMap = useCallback(() => {
    cancelPending();
    pointedTile.current = null;
    isCardShown.current = false;
    setHoveredTile(null);
  }, [cancelPending]);

  const togglePin = useCallback((tile: Position) => {
    setPinnedTile((current) => (isSameTile(current, tile) ? null : tile));
  }, []);

  const unpin = useCallback(() => setPinnedTile(null), []);

  const isPinned = pinnedTile !== null;
  useEffect(() => {
    if (!isPinned) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinnedTile(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPinned]);

  useEffect(() => cancelPending, [cancelPending]);

  const mapPointerHandlers = useMemo<MapPointerHandlers>(
    () => ({
      onPointerMove: (event) => {
        const tile = readPointedTile(event, map);
        if (tile) pointAt(tile);
        else leaveMap();
      },
      onPointerLeave: leaveMap,
      onClick: (event) => {
        const tile = readPointedTile(event, map);
        if (tile) togglePin(tile);
      },
    }),
    [map, pointAt, leaveMap, togglePin],
  );
  const shownTile = pinnedTile ?? hoveredTile;
  const { agents, entities, definitions, currentTick, timeSettings } = sources;
  const inspection = useMemo(
    () =>
      shownTile &&
      inspectTile(shownTile, { map, agents, entities, definitions, currentTick, timeSettings }),
    [shownTile, map, agents, entities, definitions, currentTick, timeSettings],
  );
  return { shownTile, isPinned, inspection, unpin, mapPointerHandlers };
}
