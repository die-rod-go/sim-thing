import { readFileSync } from "node:fs";
import {
  findItemFileProblems,
  hasItemErrors,
  itemFileSchema,
  type ItemFileMessage,
  type ItemProblem,
  type ItemReference,
} from "@village/shared";
import { describeError, writeFileAtomically } from "./atomic-write";
import { config } from "./config";
import { findUnbuiltFeatures, listItemReferences } from "./items/load-items";
import { createLogger } from "./logger";
import { loadSeedFile } from "./seeds";
import type { WorldMap } from "./world/types";

const logger = createLogger("item-editor");

export interface ItemSaveResult {
  isSaved: boolean;
  problems: ItemProblem[];
}

/**
 * Reads and writes `items.json` for the item editor. It never touches the live world: changes
 * apply on the next server start or reset.
 */
export interface ItemEditor {
  describeItemFile(): ItemFileMessage;
  saveItemFile(json: unknown): ItemSaveResult;
}

type ReferenceReading =
  | { kind: "read"; references: ItemReference[] }
  | { kind: "failed"; mapReferences: ItemReference[]; message: string };

function buildFileProblem(message: string): ItemProblem {
  return { severity: "error", path: "file", message };
}

export function createItemEditor(options: {
  itemFilePath: string;
  seedFilePath: string;
  /** The current map: it is reloaded on reset, and its placed items use definitions. */
  getMap: () => WorldMap;
}): ItemEditor {
  // Re-read on every request: the character editor may have changed the seed inventories since.
  const readReferences = (): ReferenceReading => {
    try {
      return {
        kind: "read",
        references: listItemReferences(options.getMap(), loadSeedFile(options.seedFilePath)),
      };
    } catch (error) {
      logger.warn("could not read the seed file to find the items it uses", error);
      return {
        kind: "failed",
        mapReferences: listItemReferences(options.getMap(), { agents: [] }),
        message: `Could not read the seed file to check its inventories: ${describeError(error)}`,
      };
    }
  };

  const findSaveProblems = (json: unknown): ItemProblem[] => {
    const parsed = itemFileSchema.safeParse(json);
    if (!parsed.success) {
      return parsed.error.issues.map((issue) => ({
        severity: "error",
        path: issue.path.join(".") || "file",
        message: issue.message,
      }));
    }
    const reading = readReferences();
    const references = reading.kind === "read" ? reading.references : reading.mapReferences;
    const problems = [
      ...findItemFileProblems(parsed.data, { references }),
      ...findUnbuiltFeatures(parsed.data),
    ];
    return reading.kind === "read" ? problems : [...problems, buildFileProblem(reading.message)];
  };

  return {
    describeItemFile() {
      const reading = readReferences();
      const references = reading.kind === "read" ? reading.references : reading.mapReferences;
      const base = { type: "item_file" as const, references };
      try {
        const json: unknown = JSON.parse(readFileSync(options.itemFilePath, "utf8"));
        return { ...base, itemFile: itemFileSchema.parse(json), loadError: null };
      } catch (error) {
        logger.warn("could not read items.json for the editor", error);
        return { ...base, itemFile: null, loadError: describeError(error) };
      }
    },
    saveItemFile(json) {
      const problems = findSaveProblems(json);
      if (hasItemErrors(problems)) return { isSaved: false, problems };
      const text = `${JSON.stringify(json, null, config.seeds.jsonIndent)}\n`;
      try {
        writeFileAtomically(options.itemFilePath, text);
      } catch (error) {
        logger.error(`could not write ${options.itemFilePath}`, error);
        const writeProblem = buildFileProblem(
          `Could not write items.json: ${describeError(error)}`,
        );
        return { isSaved: false, problems: [...problems, writeProblem] };
      }
      logger.info(`saved items to ${options.itemFilePath}`);
      return { isSaved: true, problems };
    },
  };
}
