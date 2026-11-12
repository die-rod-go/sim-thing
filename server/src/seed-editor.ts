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
  /** The current map: it is reloaded on reset, and start tiles come from it. */
  getMap: () => WorldMap;
  items: ItemCatalog;
}): SeedEditor {
  const buildRules = () => buildSeedRules(options.getMap(), options.items);
  return {
    describeSeedFile() {
      const rules = buildRules();
      const newAgentTemplate = buildNewAgentTemplate();
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
      const problems = findSeedFileProblems(seedFile, buildRules());
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
