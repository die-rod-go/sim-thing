import { checkComponentDeclarations, checkComponentValues } from "./component-validation";
import { damagesSelf, checkEffect, type EffectCheckContext } from "./effect-validation";
import type { ItemFile } from "./item-file";
import {
  ProblemList,
  type ItemProblem,
  type ItemReference,
  type ItemValidationOptions,
} from "./item-problems";
import { listMatcherTerms } from "./matchers";
import { checkClosedSupply } from "./supply-validation";
import { checkVerbs } from "./verb-validation";
import { checkMatcher, checkWorldSettings } from "./world-validation";

function checkDefinitions(context: EffectCheckContext) {
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
    (definition.onBroken ?? []).forEach((effect, effectIndex) =>
      checkEffect(effect, "on_broken", `${path}.onBroken.${effectIndex}`, context),
    );
  });
}

function checkConditions(context: EffectCheckContext) {
  const { file, problems } = context;
  const seen = new Set<string>();
  file.conditions.forEach((condition, index) => {
    const path = `conditions.${index} (${condition.name})`;
    if (seen.has(condition.name)) problems.error(path, `"${condition.name}" is defined twice.`);
    seen.add(condition.name);
    if (!Object.hasOwn(file.components, condition.name)) {
      problems.error(path, `Unknown component "${condition.name}".`);
    }
    const effects = [...condition.everyMinute, ...condition.onEnd];
    condition.everyMinute.forEach((effect, effectIndex) =>
      checkEffect(effect, "condition", `${path}.everyMinute.${effectIndex}`, context),
    );
    condition.onEnd.forEach((effect, effectIndex) =>
      checkEffect(effect, "condition", `${path}.onEnd.${effectIndex}`, context),
    );
    if (effects.some(damagesSelf) && condition.phrases.killed === undefined) {
      problems.error(path, "A condition that does damage needs a `killed` phrase.");
    }
  });
}

/** Components something can have: on a definition, or added while the sim runs as a condition. */
function listComponentsInUse(file: ItemFile): Set<string> {
  return new Set([
    ...file.definitions.flatMap((definition) => Object.keys(definition.components)),
    ...file.conditions.map((condition) => condition.name),
  ]);
}

function checkReactions(context: EffectCheckContext) {
  const { file, problems } = context;
  const componentsInUse = listComponentsInUse(file);
  file.reactions.forEach((reaction, index) => {
    const path = `reactions.${index} (${reaction.stimulus})`;
    checkMatcher(reaction.if, `${path}.if`, context);
    for (const term of listMatcherTerms(reaction.if)) {
      const isUnused =
        "has" in term && Object.hasOwn(file.components, term.has) && !componentsInUse.has(term.has);
      if (isUnused) problems.warning(path, `Nothing has the component "${term.has}".`);
    }
    reaction.effects.forEach((effect, effectIndex) =>
      checkEffect(effect, "reaction", `${path}.effects.${effectIndex}`, context),
    );
    if (reaction.effects.some(damagesSelf) && reaction.phrases.killed === undefined) {
      problems.error(path, "A reaction that damages what it reached needs a `killed` phrase.");
    }
  });
}

function checkReferences(references: readonly ItemReference[], context: EffectCheckContext) {
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
 * settings, verb rules and the numbers they read, overlapping verbs, missing phrases, the closed
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
  const context: EffectCheckContext = {
    file,
    definitionIds: new Set(definitionsById.keys()),
    conditionNames: new Set(file.conditions.map((condition) => condition.name)),
    problems,
  };
  checkWorldSettings(context);
  checkComponentDeclarations(file, problems);
  checkDefinitions(context);
  checkVerbs(definitionsById, context);
  checkConditions(context);
  checkReactions(context);
  checkReferences(options.references ?? [], context);
  checkClosedSupply(file, problems);
  return problems.problems;
}
