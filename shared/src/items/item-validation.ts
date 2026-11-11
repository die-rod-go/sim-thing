import {
  checkComponentDeclarations,
  checkComponentValues,
  checkUnusedComponents,
} from "./component-validation";
import type { ItemFile } from "./item-file";
import {
  ProblemList,
  type ItemProblem,
  type ItemReference,
  type ItemValidationOptions,
  type ValidationContext,
} from "./item-problems";
import { checkRules } from "./rule-validation";
import { checkClosedSupply } from "./supply-validation";
import { checkVerbs } from "./verb-validation";
import { checkWorldSettings } from "./world-validation";

function checkDefinitions(context: ValidationContext) {
  const { file, problems, definitionIds } = context;
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  file.definitions.forEach((definition, index) => {
    const path = `definitions.${index} (${definition.id})`;
    if (seenIds.has(definition.id)) problems.error(path, `Id "${definition.id}" is already used.`);
    seenIds.add(definition.id);
    const nameKey = definition.name.toLowerCase();
    if (seenNames.has(nameKey)) problems.error(path, `Name "${definition.name}" is already used.`);
    seenNames.add(nameKey);
    checkComponentValues(definition, path, file, definitionIds, problems);
  });
}

function checkReferences(references: readonly ItemReference[], context: ValidationContext) {
  const { file, definitionIds, problems } = context;
  for (const reference of references) {
    if (!definitionIds.has(reference.definitionId)) {
      problems.error(
        "definitions",
        `${reference.usedBy} uses "${reference.definitionId}", which has no definition.`,
      );
    } else if (reference.definitionId === file.world.agentBody) {
      problems.error(
        `definitions (${reference.definitionId})`,
        `${reference.usedBy} uses "${reference.definitionId}", the agents' body, which can't be placed or carried.`,
      );
    }
  }
}

/**
 * Everything wrong with an item file beyond its shape: unknown names, field values, the world
 * settings, verbs and rules with the steps and values they use, shadowed verbs, missing phrases, the closed
 * supply, and definitions the map or seeds use. Pure, so the item editor can run it live.
 */
export function findItemFileProblems(
  file: ItemFile,
  options: ItemValidationOptions = {},
): ItemProblem[] {
  const problems = new ProblemList();
  const definitionsById = new Map(
    file.definitions.map((definition) => [definition.id, definition]),
  );
  const context: ValidationContext = {
    file,
    definitionIds: new Set(definitionsById.keys()),
    problems,
  };
  checkWorldSettings(context);
  checkComponentDeclarations(file, problems);
  checkDefinitions(context);
  checkVerbs(definitionsById, context);
  checkRules(definitionsById, context);
  checkUnusedComponents(file, problems);
  checkReferences(options.references ?? [], context);
  checkClosedSupply(file, problems);
  return problems.problems;
}
