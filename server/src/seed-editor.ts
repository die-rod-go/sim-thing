import { renameSync, writeFileSync } from "node:fs";
import {
  findSeedFileProblems,
  hasSeedErrors,
  type SeedFile,
  type SeedFileMessage,
  type SeedProblem,
} from "@village/shared";
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

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
}

function writeFileAtomically(filePath: string, text: string): void {
  const temporaryPath = `${filePath}.saving`;
  writeFileSync(temporaryPath, text, "utf8");
  renameSync(temporaryPath, filePath);
}

export function createSeedEditor(options: { seedFilePath: string; map: WorldMap }): SeedEditor {
  const rules = buildSeedRules(options.map);
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
