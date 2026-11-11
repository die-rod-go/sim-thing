import { useEffect, useRef } from "react";
import { NumberInput, TextInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import { findTileSourceRect } from "../village/tiled-map";
import { useVillageMap } from "../village/use-village-map";
import { InlineField } from "./widgets";

interface Sprite {
  tileset: string;
  tile: number;
}

/** Draws one tile of the map's tileset, scaled up so it can be told apart. */
function TilePreview({ tile }: { tile: number }) {
  const mapStatus = useVillageMap();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { spritePreviewScale } = clientConfig.itemEditor;
  const map = mapStatus.kind === "ready" ? mapStatus.map : null;

  useEffect(() => {
    if (mapStatus.kind !== "ready") return;
    const context = canvasRef.current?.getContext("2d");
    if (!context)
      throw new Error("The browser could not create a 2D canvas for the sprite preview");
    const { map: tiledMap, tilesetImage } = mapStatus;
    const { tileWidth, tileHeight } = tiledMap;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, tileWidth * spritePreviewScale, tileHeight * spritePreviewScale);
    const source = findTileSourceRect(tiledMap, tiledMap.tileset.firstGid + tile);
    if (!source) return;
    context.drawImage(
      tilesetImage,
      source.x,
      source.y,
      tileWidth,
      tileHeight,
      0,
      0,
      tileWidth * spritePreviewScale,
      tileHeight * spritePreviewScale,
    );
  }, [mapStatus, tile, spritePreviewScale]);

  if (mapStatus.kind === "error") return <span className="muted">{mapStatus.message}</span>;
  if (!map) return <span className="muted">Loading the tileset…</span>;
  return (
    <canvas
      className="sprite-preview"
      ref={canvasRef}
      width={map.tileWidth * spritePreviewScale}
      height={map.tileHeight * spritePreviewScale}
    />
  );
}

/** The tileset name, a tile index counted from 0, and a preview of that tile. */
export function SpritePicker({
  sprite,
  onChange,
}: {
  sprite: Sprite;
  onChange: (sprite: Sprite) => void;
}) {
  return (
    <span className="sprite-picker">
      <TilePreview tile={sprite.tile} />
      <InlineField label="tile">
        <NumberInput
          value={sprite.tile}
          min={0}
          onChange={(tile) => onChange({ ...sprite, tile })}
        />
      </InlineField>
      <InlineField label="tileset">
        <TextInput
          value={sprite.tileset}
          onChange={(tileset) => onChange({ ...sprite, tileset })}
        />
      </InlineField>
    </span>
  );
}
