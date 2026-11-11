import { readFileSync } from "node:fs";
import {
  buildItemCatalog,
  describeItemProblems,
  findItemFileProblems,
  hasItemErrors,
  itemFileSchema,
  type Effect,
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

function findUnbuiltEffectProblem(effect: Effect): string | null {
  return isEffectBuilt(effect.type) ? null : `The ${effect.type} effect isn't built yet.`;
}

/**
 * Parts of the format this build parses and validates but can't run yet: effects with no
 * implementation, wherever they sit. Refused rather than ignored, so content never silently does
 * nothing.
 */
export function findUnbuiltFeatures(file: ItemFile): ItemProblem[] {
  const problems: ItemProblem[] = [];
  const add = (path: string, message: string) =>
    problems.push({ severity: "error", path, message });
  const checkEffects = (effects: readonly Effect[], path: string) =>
    effects.forEach((effect, effectIndex) => {
      const problem = findUnbuiltEffectProblem(effect);
      if (problem !== null) add(`${path}.${effectIndex}`, problem);
    });
  file.verbs.forEach((verb, index) => {
    checkEffects(verb.effects, `verbs.${index} (${verb.name}).effects`);
  });
  file.definitions.forEach((definition, index) => {
    checkEffects(definition.onBroken ?? [], `definitions.${index} (${definition.id}).onBroken`);
  });
  file.conditions.forEach((condition, index) => {
    const path = `conditions.${index} (${condition.name})`;
    checkEffects(condition.everyMinute, `${path}.everyMinute`);
    checkEffects(condition.onEnd, `${path}.onEnd`);
  });
  file.reactions.forEach((reaction, index) => {
    checkEffects(reaction.effects, `reactions.${index} (${reaction.stimulus}).effects`);
  });
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
