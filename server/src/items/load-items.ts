import { readFileSync } from "node:fs";
import {
  buildItemCatalog,
  describeItemProblems,
  findItemFileProblems,
  hasItemErrors,
  itemFileSchema,
  type ItemCatalog,
  type ItemFile,
  type ItemProblem,
  type ItemReference,
  type SeedFile,
} from "@village/shared";
import { config } from "../config";
import { createLogger } from "../logger";
import { isEffectBuilt } from "../sim/effects/effect-registry";
import type { WorldMap } from "../world/types";

const logger = createLogger("items");

/** Definition ids the map and seed inventories use, for `findItemFileProblems`. */
export function listItemReferences(map: WorldMap, seedFile: SeedFile): ItemReference[] {
  return [
    ...map.placements.map((placement) => ({
      definitionId: placement.definitionId,
      requiredForm: "placeable" as const,
      usedBy: `map object "${placement.label}"`,
    })),
    ...seedFile.agents.flatMap((agent) =>
      Object.keys(agent.inventory).map((definitionId) => ({
        definitionId,
        requiredForm: "carriable" as const,
        usedBy: `seed agent ${agent.id}'s inventory`,
      })),
    ),
  ];
}

/**
 * Parts of the format this build parses and validates but can't run yet: verb targets, hit rolls,
 * tools, effects with no implementation, conditions and reactions. Refused rather than ignored, so
 * content never silently does nothing.
 */
export function findUnbuiltFeatures(file: ItemFile): ItemProblem[] {
  const problems: ItemProblem[] = [];
  const add = (path: string, message: string) =>
    problems.push({ severity: "error", path, message });
  file.verbs.forEach((verb, index) => {
    const path = `verbs.${index} (${verb.name})`;
    if (verb.target !== "none") add(path, "Verb targets aren't built yet.");
    if (verb.hitRoll !== undefined) add(path, "Hit rolls aren't built yet.");
    if (verb.tools !== undefined) add(path, "Tools aren't built yet.");
    verb.effects.forEach((effect, effectIndex) => {
      if (!isEffectBuilt(effect.type)) {
        add(`${path}.effects.${effectIndex}`, `The ${effect.type} effect isn't built yet.`);
      }
    });
  });
  file.definitions.forEach((definition, index) => {
    if (definition.onBroken !== undefined) {
      add(`definitions.${index} (${definition.id})`, "Breaking (onBroken) isn't built yet.");
    }
  });
  if (file.conditions.length > 0) add("conditions", "Conditions aren't built yet.");
  if (file.reactions.length > 0) add("reactions", "Reactions aren't built yet.");
  return problems;
}

/** Parses and checks an item file; throws naming every problem. Warnings are logged. */
export function buildCheckedItemCatalog(
  json: unknown,
  references: readonly ItemReference[],
): ItemCatalog {
  const parsed = itemFileSchema.safeParse(json);
  if (!parsed.success) throw new Error(`items.json is malformed: ${parsed.error.message}`);
  const problems = [
    ...findItemFileProblems(parsed.data, {
      references,
      currencyDefinitionId: config.economy.currencyDefinitionId,
    }),
    ...findUnbuiltFeatures(parsed.data),
  ];
  if (hasItemErrors(problems)) {
    const errors = problems.filter((problem) => problem.severity === "error");
    throw new Error(`items.json has errors:\n${describeItemProblems(errors)}`);
  }
  const warnings = problems.filter((problem) => problem.severity === "warning");
  if (warnings.length > 0) logger.warn(`items.json warnings:\n${describeItemProblems(warnings)}`);
  return buildItemCatalog(parsed.data);
}

/** Loads `items.json` at start and on reset; the server refuses to start if it is wrong. */
export function loadItemCatalog(
  filePath: string,
  references: readonly ItemReference[],
): ItemCatalog {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${filePath}`, { cause: error });
  }
  return buildCheckedItemCatalog(json, references);
}
