import { useEffect, useState } from "react";
import { clientConfig } from "../client-config";
import { createGlyphPainter, loadImage, type GlyphPainter } from "./glyph-painter";
import { parseTiledMap, type TiledMap } from "./tiled-map";

export type MapStatus =
  | { kind: "loading" }
  | { kind: "ready"; map: TiledMap; glyphPainter: GlyphPainter }
  | { kind: "error"; message: string };

async function fetchMapData(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new Error(`${url} is not JSON (is village.json missing?)`, { cause: error });
  }
}

async function loadVillageMap(): Promise<MapStatus> {
  const { mapUrl, glyphSheetUrl, requiredLayers } = clientConfig.map;
  const [mapData, glyphSheet] = await Promise.all([fetchMapData(mapUrl), loadImage(glyphSheetUrl)]);
  const map = parseTiledMap(mapData, requiredLayers, clientConfig.village.placesLayerName);
  return { kind: "ready", map, glyphPainter: createGlyphPainter(glyphSheet) };
}

/** Loads the Tiled map and the glyph sheet once, reporting failures as readable messages. */
export function useVillageMap(): MapStatus {
  const [mapStatus, setMapStatus] = useState<MapStatus>({ kind: "loading" });

  useEffect(() => {
    let isCurrent = true;
    loadVillageMap().then(
      (status) => {
        if (isCurrent) setMapStatus(status);
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (isCurrent) setMapStatus({ kind: "error", message });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, []);

  return mapStatus;
}
