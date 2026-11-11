import { listDefinitionSubjects, matchesRule } from "./applies-to";
import { parseComponentPath } from "./component-schema";
import { resolveComponents } from "./components";
import type { Effect } from "./effect-schema";
import type { ItemDefinition, ItemFile } from "./item-file";
import type { ProblemList } from "./item-problems";
import { matchesThing } from "./matchers";

function removesSomething(effect: Effect): boolean {
  return effect.type === "destroy" || effect.type === "transform";
}

function makesSupply(effect: Effect, suppliedId: string): boolean {
  return (
    (effect.type === "produce" && effect.item === suppliedId) ||
    (effect.type === "transform" && effect.into === suppliedId)
  );
}

function canVerbUse(file: ItemFile, verbIndex: number, supplied: ItemDefinition): boolean {
  const verb = file.verbs[verbIndex];
  if (!verb) return false;
  return listDefinitionSubjects(file, supplied).some((subject) =>
    matchesRule(verb.appliesTo, subject),
  );
}

/** Whether an effect in a verb could remove the thing it was used on, chose or aimed at. */
function couldRemoveInVerb(effect: Effect, isSuppliedUsed: boolean): boolean {
  if (!removesSomething(effect)) return false;
  return (
    (effect.on === "item" && isSuppliedUsed) || effect.on === "chosen" || effect.on === "target"
  );
}

function checkVerbSupply(file: ItemFile, supplied: ItemDefinition, problems: ProblemList) {
  file.verbs.forEach((verb, index) => {
    const path = `verbs.${index} (${verb.name})`;
    const isSuppliedUsed = canVerbUse(file, index, supplied);
    if (Object.hasOwn(verb.inputs, supplied.id)) {
      problems.warning(`${path}.inputs`, `Uses up ${supplied.id}, so the supply isn't closed.`);
    }
    verb.effects.forEach((effect, effectIndex) => {
      const effectPath = `${path}.effects.${effectIndex}`;
      if (makesSupply(effect, supplied.id)) {
        problems.warning(effectPath, `Makes ${supplied.id}, so the supply isn't closed.`);
      } else if (couldRemoveInVerb(effect, isSuppliedUsed)) {
        problems.warning(effectPath, `Could destroy ${supplied.id}, so the supply isn't closed.`);
      }
    });
  });
}

function checkReactionSupply(file: ItemFile, supplied: ItemDefinition, problems: ProblemList) {
  const view = {
    definitionId: supplied.id,
    components: resolveComponents(file.components, supplied, {}),
  };
  file.reactions.forEach((reaction, index) => {
    const reachesSupply = matchesThing(reaction.if, view);
    reaction.effects.forEach((effect, effectIndex) => {
      const path = `reactions.${index}.effects.${effectIndex}`;
      if (makesSupply(effect, supplied.id)) {
        problems.warning(path, `Makes ${supplied.id}, so the supply isn't closed.`);
      } else if (reachesSupply && removesSomething(effect)) {
        problems.warning(path, `Could destroy ${supplied.id}, so the supply isn't closed.`);
      }
    });
  });
}

function checkDefinitionSupply(file: ItemFile, supplied: ItemDefinition, problems: ProblemList) {
  file.definitions.forEach((definition, index) => {
    const path = `definitions.${index} (${definition.id})`;
    (definition.onBroken ?? []).forEach((effect, effectIndex) => {
      if (makesSupply(effect, supplied.id)) {
        problems.warning(`${path}.onBroken.${effectIndex}`, `Makes ${supplied.id} when it breaks.`);
      }
    });
  });
  const healthComponent = parseComponentPath(file.world.agentHealth)?.component;
  if (healthComponent !== undefined && Object.hasOwn(supplied.components, healthComponent)) {
    problems.warning(
      `definitions (${supplied.id}).components.${healthComponent}`,
      `${supplied.id} can break, so the supply isn't closed.`,
    );
  }
}

/**
 * Warns about anything that could make or destroy a thing the world setting `closedSupply`
 * matches. Coins are a closed supply: they only change hands.
 */
export function checkClosedSupply(file: ItemFile, problems: ProblemList): void {
  const matcher = file.world.closedSupply;
  if (matcher === undefined) return;
  const supplied = file.definitions.filter((definition) =>
    matchesThing(matcher, {
      definitionId: definition.id,
      components: resolveComponents(file.components, definition, {}),
    }),
  );
  for (const definition of supplied) {
    checkVerbSupply(file, definition, problems);
    checkReactionSupply(file, definition, problems);
    checkDefinitionSupply(file, definition, problems);
  }
}
