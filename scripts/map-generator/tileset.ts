import { GLYPH_SHEET, findGlyphSourcePosition, type Glyph } from "@village/shared";
import { config } from "../../server/src/config";
import { createImage, encodePng, setPixel, type Rgba, type RgbaImage } from "./png";

/** Terrain tile ids within the tileset (Tiled gid = id + 1). Things are entities, not tiles. */
export const TILE_NAMES = [
  "grass",
  "path",
  "wood_floor",
  "stone_floor",
  "wall",
  "field",
  "tree",
  "fence",
  "water",
] as const;

export type TileName = (typeof TILE_NAMES)[number];

/** Tiles that block movement; the generator only ever puts these in the `walls` layer. */
export const COLLIDING_TILES: ReadonlySet<TileName> = new Set<TileName>(["wall", "fence", "water"]);

export const TILESET_COLUMNS = 8;
export const TILE_SIZE = config.map.tileSizePixels;

const GRASS_BACKGROUND = "#2c4f26";

/** How each terrain tile is drawn: a glyph index (CP437 code), its color and the tile's fill. */
export const TILE_GLYPHS: Record<TileName, Required<Glyph>> = {
  grass: { index: 44, color: "#5f9e4c", background: GRASS_BACKGROUND },
  path: { index: 176, color: "#9a7a50", background: "#6e5434" },
  wood_floor: { index: 250, color: "#8a6040", background: "#5a3c24" },
  stone_floor: { index: 249, color: "#8a8a94", background: "#4a4a52" },
  wall: { index: 178, color: "#8f7466", background: "#4a3a34" },
  field: { index: 61, color: "#9a7a3a", background: "#5a4420" },
  tree: { index: 6, color: "#3f9a48", background: GRASS_BACKGROUND },
  fence: { index: 35, color: "#a8743e", background: GRASS_BACKGROUND },
  water: { index: 247, color: "#7ab0e8", background: "#24508a" },
};

const OPAQUE = 255;
const HEX_DIGITS_PER_CHANNEL = 2;
const HEX_RADIX = 16;
const ALPHA_OFFSET = 3;

export function tileGid(tileName: TileName): number {
  return TILE_NAMES.indexOf(tileName) + 1;
}

function parseHexColor(hexColor: string): Rgba {
  const channel = (index: number) =>
    parseInt(
      hexColor.slice(1 + index * HEX_DIGITS_PER_CHANNEL, 1 + (index + 1) * HEX_DIGITS_PER_CHANNEL),
      HEX_RADIX,
    );
  return [channel(0), channel(1), channel(2), OPAQUE];
}

function isGlyphPixelLit(glyphSheet: RgbaImage, x: number, y: number): boolean {
  return (glyphSheet.pixels[(y * glyphSheet.width + x) * 4 + ALPHA_OFFSET] ?? 0) > 0;
}

/** Paints one tile: the background, then the glyph's lit pixels in its color, scaled to fit. */
function paintTile(
  image: RgbaImage,
  glyphSheet: RgbaImage,
  tileId: number,
  glyph: Required<Glyph>,
) {
  const originX = (tileId % TILESET_COLUMNS) * TILE_SIZE;
  const originY = Math.floor(tileId / TILESET_COLUMNS) * TILE_SIZE;
  const scale = TILE_SIZE / GLYPH_SHEET.glyphSizePixels;
  const source = findGlyphSourcePosition(glyph.index);
  const background = parseHexColor(glyph.background);
  const foreground = parseHexColor(glyph.color);
  for (let row = 0; row < TILE_SIZE; row++) {
    for (let column = 0; column < TILE_SIZE; column++) {
      const isLit = isGlyphPixelLit(
        glyphSheet,
        source.x + Math.floor(column / scale),
        source.y + Math.floor(row / scale),
      );
      setPixel(image, originX + column, originY + row, isLit ? foreground : background);
    }
  }
}

/**
 * The tileset image Tiled shows when the map is opened there. The village view doesn't read it: it
 * draws each tile from the glyph in the tileset's tile properties.
 */
export function drawTilesetImage(glyphSheet: RgbaImage): RgbaImage {
  const rows = Math.ceil(TILE_NAMES.length / TILESET_COLUMNS);
  const image = createImage(TILESET_COLUMNS * TILE_SIZE, rows * TILE_SIZE);
  TILE_NAMES.forEach((tileName, tileId) => {
    paintTile(image, glyphSheet, tileId, TILE_GLYPHS[tileName]);
  });
  return image;
}

export function generateTilesetPng(glyphSheet: RgbaImage): Buffer {
  return encodePng(drawTilesetImage(glyphSheet));
}
