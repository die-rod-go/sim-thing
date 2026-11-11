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
  type Step,
} from "@village/shared";
import { createLogger } from "../logger";
import { isStepBuilt } from "../sim/steps/step-registry";
import type { WorldMap } from "../world/types";

const logger = createLogger("items");

/** Definition ids the map and seed inventories use, for `findItemFileProblems`. */
export function listItemReferences(map: WorldMap, seedFile: SeedFile): ItemReference[] {
  return [
    ...map.placements.map((placement) => ({
      definitionId: placement.definitionId,
      usedBy: `map object "${placement.label}"`,
    })),
    ...seedFile.agents.flatMap((agent) =>
      Object.keys(agent.inventory).map((definitionId) => ({
        definitionId,
        usedBy: `seed agent ${agent.id}'s inventory`,
      })),
    ),
  ];
}

function findUnbuiltStepProblem(step: Step): string | null {
  return isStepBuilt(step.step) ? null : `The ${step.step} step isn't built yet.`;
}

/**
 * Parts of the format this build parses and validates but can't run yet: steps with no
 * implementation, wherever they sit. Refused rather than ignored, so content never silently does
 * nothing.
 */
export function findUnbuiltFeatures(file: ItemFile): ItemProblem[] {
  const problems: ItemProblem[] = [];
  const add = (path: string, message: string) =>
    problems.push({ severity: "error", path, message });
  const checkSteps = (steps: readonly Step[], path: string) =>
    steps.forEach((step, stepIndex) => {
      const problem = findUnbuiltStepProblem(step);
      if (problem !== null) add(`${path}.${stepIndex}`, problem);
    });
  file.verbs.forEach((verb, index) => {
    checkSteps(verb.steps, `verbs.${index} (${verb.name}).steps`);
  });
  file.rules.forEach((rule, index) => {
    checkSteps(rule.steps, `rules.${index} (${rule.trigger}).steps`);
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
    ...findItemFileProblems(parsed.data, { references }),
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
