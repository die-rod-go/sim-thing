import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../server/src/config";
import { createLogger } from "../server/src/logger";
import { buildVillageLayout } from "./map-generator/layout";
import { buildTiledMap, serializeTiledMap } from "./map-generator/tiled";
import { generateTilesetPng } from "./map-generator/tileset";

const logger = createLogger("generate-map");
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function writeVillageMap(): void {
  const mapPath = resolve(repositoryRoot, config.server.mapPath);
  const tilesetPath = resolve(dirname(mapPath), "tileset.png");
  mkdirSync(dirname(mapPath), { recursive: true });
  writeFileSync(mapPath, serializeTiledMap(buildTiledMap(buildVillageLayout())));
  writeFileSync(tilesetPath, generateTilesetPng());
  logger.info(`wrote ${mapPath} and ${tilesetPath}`);
}

writeVillageMap();
