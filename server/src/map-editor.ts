import { readFileSync } from "node:fs";
import {
  findMapProblems,
  hasMapErrors,
  itemFileSchema,
  type MapFileMessage,
  type MapLayout,
  type MapProblem,
  type MapReferences,
} from "@village/shared";
import { describeError, writeFileAtomically } from "./atomic-write";
import { createLogger } from "./logger";
import { loadSeedFile } from "./seeds";
import { formatMapFileText } from "./world/map-file-text";
import { parseWorldMap } from "./world/map-loader";
import type { WorldMap } from "./world/types";

const logger = createLogger("map-editor");

export interface MapSaveResult {
  isSaved: boolean;
  problems: MapProblem[];
}

/**
 * Reads and writes the Tiled map for the map editor. It never touches the live world: a saved map
 * is used from the next reset or server start.
 */
export interface MapEditor {
  describeMapFile(): MapFileMessage;
  saveMapFile(json: unknown): MapSaveResult;
}

type ReferenceReading = { references: MapReferences; problems: MapProblem[] };

export function toMapLayout(map: WorldMap): MapLayout {
  return {
    width: map.grid.width,
    height: map.grid.height,
    isWall: map.grid.isWall,
    places: map.places,
    placements: map.placements,
    startTiles: map.startTiles,
  };
}

function buildFileProblem(message: string): MapProblem {
  return { severity: "error", message };
}

export function createMapEditor(options: {
  mapFilePath: string;
  itemFilePath: string;
  seedFilePath: string;
}): MapEditor {
  // Re-read on every request: the item and character editors may have changed them since.
  const readReferences = (): ReferenceReading => {
    const problems: MapProblem[] = [];
    let placeableItems: MapReferences["placeableItems"] = [];
    let characters: MapReferences["characters"] = [];
    try {
      const itemFile = itemFileSchema.parse(JSON.parse(readFileSync(options.itemFilePath, "utf8")));
      placeableItems = itemFile.definitions
        .filter((definition) => definition.id !== itemFile.world.agentBody)
        .map(({ id, name, glyph }) => ({ id, name, glyph }));
    } catch (error) {
      logger.warn("could not read items.json for the map editor", error);
      problems.push(buildFileProblem(`Could not read items.json: ${describeError(error)}`));
    }
    try {
      characters = loadSeedFile(options.seedFilePath).agents.map(({ id, name }) => ({ id, name }));
    } catch (error) {
      logger.warn("could not read the seed file for the map editor", error);
      problems.push(buildFileProblem(`Could not read the seed file: ${describeError(error)}`));
    }
    return { references: { placeableItems, characters }, problems };
  };

  const findSaveProblems = (json: unknown): MapProblem[] => {
    let map: WorldMap;
    try {
      map = parseWorldMap(json);
    } catch (error) {
      return [buildFileProblem(`The map is malformed: ${describeError(error)}`)];
    }
    const reading = readReferences();
    return [...reading.problems, ...findMapProblems(toMapLayout(map), reading.references)];
  };

  return {
    describeMapFile() {
      const { references } = readReferences();
      try {
        const mapFile: unknown = JSON.parse(readFileSync(options.mapFilePath, "utf8"));
        return { type: "map_file", mapFile, loadError: null, references };
      } catch (error) {
        logger.warn("could not read the map for the editor", error);
        return { type: "map_file", mapFile: null, loadError: describeError(error), references };
      }
    },
    saveMapFile(json) {
      const problems = findSaveProblems(json);
      if (hasMapErrors(problems)) return { isSaved: false, problems };
      try {
        writeFileAtomically(options.mapFilePath, formatMapFileText(json));
      } catch (error) {
        logger.error(`could not write ${options.mapFilePath}`, error);
        const writeProblem = buildFileProblem(`Could not write the map: ${describeError(error)}`);
        return { isSaved: false, problems: [...problems, writeProblem] };
      }
      logger.info(`saved the map to ${options.mapFilePath}`);
      return { isSaved: true, problems };
    },
  };
}
