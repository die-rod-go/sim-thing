import { config } from "../../server/src/config";
import { SeededRandom } from "../../server/src/random";
import { createImage, encodePng, setPixel, type Rgba, type RgbaImage } from "./png";

/** Tile ids within the tileset (Tiled gid = id + 1). Order matches the drawn image. */
export const TILE_NAMES = [
  "grass",
  "path",
  "wood_floor",
  "stone_floor",
  "wall",
  "door",
  "field",
  "tree",
  "fence",
  "water",
  "bed",
  "oven",
  "kettle",
  "card_table",
  "bench",
  "notice_board",
] as const;

export type TileName = (typeof TILE_NAMES)[number];

/** Tiles that block movement; the generator only ever puts these in the `walls` layer. */
export const COLLIDING_TILES: ReadonlySet<TileName> = new Set<TileName>(["wall", "fence", "water"]);

export const TILESET_COLUMNS = 8;
export const TILE_SIZE = config.map.tileSizePixels;
const TILESET_SEED = 7;
const SPECKLES_PER_TILE = 14;

export function tileGid(tileName: TileName): number {
  return TILE_NAMES.indexOf(tileName) + 1;
}

interface Painter {
  image: RgbaImage;
  originX: number;
  originY: number;
  random: SeededRandom;
}

const colors = {
  grass: [86, 152, 72, 255],
  grassLight: [112, 178, 90, 255],
  path: [176, 142, 96, 255],
  pathDark: [150, 118, 78, 255],
  wood: [158, 108, 64, 255],
  woodDark: [120, 80, 46, 255],
  stone: [150, 150, 156, 255],
  stoneDark: [116, 116, 124, 255],
  wall: [92, 72, 64, 255],
  mortar: [64, 50, 44, 255],
  door: [132, 84, 40, 255],
  doorKnob: [230, 196, 90, 255],
  field: [214, 184, 80, 255],
  fieldDark: [178, 146, 56, 255],
  leaves: [44, 108, 52, 255],
  leavesLight: [70, 136, 66, 255],
  trunk: [96, 64, 36, 255],
  water: [64, 120, 196, 255],
  waterLight: [120, 170, 226, 255],
  blanket: [176, 60, 64, 255],
  pillow: [236, 232, 220, 255],
  ovenBrick: [168, 84, 60, 255],
  fire: [250, 160, 40, 255],
  iron: [60, 60, 66, 255],
  ironLight: [104, 104, 112, 255],
  feltGreen: [40, 120, 72, 255],
  card: [244, 244, 236, 255],
  paper: [236, 228, 200, 255],
} satisfies Record<string, Rgba>;

function fillRect(
  painter: Painter,
  left: number,
  top: number,
  width: number,
  height: number,
  color: Rgba,
): void {
  for (let row = top; row < top + height; row++) {
    for (let column = left; column < left + width; column++) {
      setPixel(painter.image, painter.originX + column, painter.originY + row, color);
    }
  }
}

function speckle(painter: Painter, color: Rgba, count = SPECKLES_PER_TILE): void {
  for (let index = 0; index < count; index++) {
    const column = painter.random.nextInt(0, TILE_SIZE - 1);
    const row = painter.random.nextInt(0, TILE_SIZE - 1);
    fillRect(painter, column, row, 1, 1, color);
  }
}

function paintPlanks(painter: Painter, base: Rgba, seam: Rgba): void {
  fillRect(painter, 0, 0, TILE_SIZE, TILE_SIZE, base);
  for (let row = 3; row < TILE_SIZE; row += 4) fillRect(painter, 0, row, TILE_SIZE, 1, seam);
}

function paintTree(painter: Painter): void {
  fillRect(painter, 0, 0, TILE_SIZE, TILE_SIZE, colors.grass);
  fillRect(painter, 7, 10, 2, 6, colors.trunk);
  fillRect(painter, 2, 1, 12, 10, colors.leaves);
  speckle(painter, colors.leavesLight, 10);
}

const tilePainters: Record<TileName, (painter: Painter) => void> = {
  grass: (painter) => {
    fillRect(painter, 0, 0, TILE_SIZE, TILE_SIZE, colors.grass);
    speckle(painter, colors.grassLight);
  },
  path: (painter) => {
    fillRect(painter, 0, 0, TILE_SIZE, TILE_SIZE, colors.path);
    speckle(painter, colors.pathDark);
  },
  wood_floor: (painter) => paintPlanks(painter, colors.wood, colors.woodDark),
  stone_floor: (painter) => {
    fillRect(painter, 0, 0, TILE_SIZE, TILE_SIZE, colors.stone);
    fillRect(painter, 0, 7, TILE_SIZE, 1, colors.stoneDark);
    fillRect(painter, 7, 0, 1, 7, colors.stoneDark);
    fillRect(painter, 3, 8, 1, 8, colors.stoneDark);
  },
  wall: (painter) => {
    fillRect(painter, 0, 0, TILE_SIZE, TILE_SIZE, colors.wall);
    for (let row = 3; row < TILE_SIZE; row += 4)
      fillRect(painter, 0, row, TILE_SIZE, 1, colors.mortar);
  },
  door: (painter) => {
    paintPlanks(painter, colors.door, colors.woodDark);
    fillRect(painter, 11, 7, 2, 2, colors.doorKnob);
  },
  field: (painter) => {
    fillRect(painter, 0, 0, TILE_SIZE, TILE_SIZE, colors.field);
    for (let column = 1; column < TILE_SIZE; column += 3) {
      fillRect(painter, column, 0, 1, TILE_SIZE, colors.fieldDark);
    }
  },
  tree: paintTree,
  fence: (painter) => {
    fillRect(painter, 0, 0, TILE_SIZE, TILE_SIZE, colors.grass);
    fillRect(painter, 0, 5, TILE_SIZE, 2, colors.wood);
    fillRect(painter, 0, 10, TILE_SIZE, 2, colors.wood);
    fillRect(painter, 2, 3, 2, 11, colors.woodDark);
    fillRect(painter, 12, 3, 2, 11, colors.woodDark);
  },
  water: (painter) => {
    fillRect(painter, 0, 0, TILE_SIZE, TILE_SIZE, colors.water);
    speckle(painter, colors.waterLight);
  },
  bed: (painter) => {
    fillRect(painter, 2, 1, 12, 14, colors.woodDark);
    fillRect(painter, 3, 2, 10, 4, colors.pillow);
    fillRect(painter, 3, 6, 10, 8, colors.blanket);
  },
  oven: (painter) => {
    fillRect(painter, 1, 1, 14, 14, colors.ovenBrick);
    fillRect(painter, 4, 7, 8, 6, colors.iron);
    fillRect(painter, 5, 9, 6, 3, colors.fire);
  },
  kettle: (painter) => {
    fillRect(painter, 3, 4, 10, 10, colors.iron);
    fillRect(painter, 4, 3, 8, 1, colors.ironLight);
    fillRect(painter, 5, 6, 2, 6, colors.ironLight);
  },
  card_table: (painter) => {
    fillRect(painter, 1, 2, 14, 12, colors.woodDark);
    fillRect(painter, 2, 3, 12, 10, colors.feltGreen);
    fillRect(painter, 4, 5, 3, 4, colors.card);
    fillRect(painter, 9, 7, 3, 4, colors.card);
  },
  bench: (painter) => {
    fillRect(painter, 1, 6, 14, 4, colors.wood);
    fillRect(painter, 2, 10, 2, 4, colors.woodDark);
    fillRect(painter, 12, 10, 2, 4, colors.woodDark);
  },
  notice_board: (painter) => {
    fillRect(painter, 7, 11, 2, 5, colors.woodDark);
    fillRect(painter, 1, 1, 14, 10, colors.wood);
    fillRect(painter, 3, 3, 4, 5, colors.paper);
    fillRect(painter, 9, 2, 4, 6, colors.paper);
  },
};

export function drawTilesetImage(): RgbaImage {
  const rows = Math.ceil(TILE_NAMES.length / TILESET_COLUMNS);
  const image = createImage(TILESET_COLUMNS * TILE_SIZE, rows * TILE_SIZE);
  const random = new SeededRandom(TILESET_SEED);
  TILE_NAMES.forEach((tileName, tileId) => {
    const painter: Painter = {
      image,
      originX: (tileId % TILESET_COLUMNS) * TILE_SIZE,
      originY: Math.floor(tileId / TILESET_COLUMNS) * TILE_SIZE,
      random,
    };
    tilePainters[tileName](painter);
  });
  return image;
}

export function generateTilesetPng(): Buffer {
  return encodePng(drawTilesetImage());
}
