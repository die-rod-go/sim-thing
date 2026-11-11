import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GLYPH_SHEET } from "@village/shared";
import { config } from "../server/src/config";
import { createLogger } from "../server/src/logger";
import { buildVillageLayout } from "./map-generator/layout";
import { decodePng } from "./map-generator/png-decode";
import { buildTiledMap, serializeTiledMap } from "./map-generator/tiled";
import { generateTilesetPng } from "./map-generator/tileset";

const logger = createLogger("generate-map");
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function writeVillageMap(): void {
  const mapPath = resolve(repositoryRoot, config.server.mapPath);
  const tilesetPath = resolve(dirname(mapPath), "tileset.png");
  const glyphSheet = decodePng(readFileSync(resolve(dirname(mapPath), GLYPH_SHEET.fileName)));
  mkdirSync(dirname(mapPath), { recursive: true });
  writeFileSync(mapPath, serializeTiledMap(buildTiledMap(buildVillageLayout())));
  writeFileSync(tilesetPath, generateTilesetPng(glyphSheet));
  logger.info(`wrote ${mapPath} and ${tilesetPath}`);
}

writeVillageMap();
