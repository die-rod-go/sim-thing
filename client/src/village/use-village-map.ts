import { useEffect, useState } from "react";
import { clientConfig } from "../client-config";
import { parseTiledMap, type TiledMap } from "./tiled-map";

export type MapStatus =
  | { kind: "loading" }
  | { kind: "ready"; map: TiledMap; tilesetImage: HTMLImageElement }
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

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}

async function loadVillageMap(): Promise<MapStatus> {
  const { mapUrl, tilesetUrl, requiredLayers } = clientConfig.map;
  const [mapData, tilesetImage] = await Promise.all([fetchMapData(mapUrl), loadImage(tilesetUrl)]);
  const map = parseTiledMap(mapData, requiredLayers, clientConfig.village.placesLayerName);
  return { kind: "ready", map, tilesetImage };
}

/** Loads the Tiled map and its tileset image once, reporting failures as readable messages. */
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
