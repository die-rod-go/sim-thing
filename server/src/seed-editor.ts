import {
  findSeedFileProblems,
  hasSeedErrors,
  type ItemCatalog,
  type SeedFile,
  type SeedFileMessage,
  type SeedProblem,
} from "@village/shared";
import { describeError, writeFileAtomically } from "./atomic-write";
import { config } from "./config";
import { createLogger } from "./logger";
import { buildNewAgentTemplate, buildSeedRules, loadSeedFile } from "./seeds";
import type { WorldMap } from "./world/types";

const logger = createLogger("seed-editor");

export interface SeedSaveResult {
  isSaved: boolean;
  problems: SeedProblem[];
}

/** Reads and writes the seed file for the character editor. It never touches the live world. */
export interface SeedEditor {
  describeSeedFile(): SeedFileMessage;
  saveSeedFile(seedFile: SeedFile): SeedSaveResult;
}

export function createSeedEditor(options: {
  seedFilePath: string;
  map: WorldMap;
  items: ItemCatalog;
}): SeedEditor {
  const rules = buildSeedRules(options.map, options.items);
  const newAgentTemplate = buildNewAgentTemplate(rules);
  return {
    describeSeedFile() {
      try {
        const seedFile = loadSeedFile(options.seedFilePath);
        return { type: "seed_file", seedFile, loadError: null, rules, newAgentTemplate };
      } catch (error) {
        logger.warn("could not read the seed file for the editor", error);
        return {
          type: "seed_file",
          seedFile: null,
          loadError: describeError(error),
          rules,
          newAgentTemplate,
        };
      }
    },
    saveSeedFile(seedFile) {
      const problems = findSeedFileProblems(seedFile, rules);
      if (hasSeedErrors(problems)) return { isSaved: false, problems };
      const text = `${JSON.stringify(seedFile, null, config.seeds.jsonIndent)}\n`;
      try {
        writeFileAtomically(options.seedFilePath, text);
      } catch (error) {
        logger.error(`could not write ${options.seedFilePath}`, error);
        const writeProblem: SeedProblem = {
          severity: "error",
          agentIndex: null,
          field: "file",
          message: `Could not write the seed file: ${describeError(error)}`,
        };
        return { isSaved: false, problems: [...problems, writeProblem] };
      }
      logger.info(`saved ${seedFile.agents.length} characters to ${options.seedFilePath}`);
      return { isSaved: true, problems };
    },
  };
}
