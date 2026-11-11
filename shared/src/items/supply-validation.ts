import { listDefinitionViews, matchesAppliesTo } from "./applies-to";
import { resolveComponents } from "./components";
import { parseValuePath, type Effect } from "./effect-schema";
import type { ItemDefinition, ItemFile, Verb } from "./item-file";
import type { ProblemList } from "./item-problems";
import { matchesThing } from "./matchers";

function removesSomething(effect: Effect): boolean {
  return effect.type === "destroy" || effect.type === "transform";
}

function listFieldValues(file: ItemFile, path: string): unknown[] {
  const fieldPath = parseValuePath(path);
  if (fieldPath === null) return [];
  return file.definitions.map(
    (definition) =>
      resolveComponents(file.components, definition, {})[fieldPath.component]?.[fieldPath.field],
  );
}

function makesSupply(file: ItemFile, effect: Effect, suppliedId: string): boolean {
  if (effect.type === "produce") return effect.item === suppliedId;
  if (effect.type !== "transform") return false;
  if (typeof effect.into === "string") return effect.into === suppliedId;
  return listFieldValues(file, effect.into.from).includes(suppliedId);
}

function canVerbUse(verb: Verb, supplied: ItemFile, definition: ItemDefinition): boolean {
  return listDefinitionViews(supplied, definition).some((view) => matchesAppliesTo(verb, view));
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
    const isSuppliedUsed = canVerbUse(verb, file, supplied);
    if (Object.hasOwn(verb.inputs, supplied.id)) {
      problems.warning(`${path}.inputs`, `Uses up ${supplied.id}, so the supply isn't closed.`);
    }
    verb.effects.forEach((effect, effectIndex) => {
      const effectPath = `${path}.effects.${effectIndex}`;
      if (makesSupply(file, effect, supplied.id)) {
        problems.warning(effectPath, `Makes ${supplied.id}, so the supply isn't closed.`);
      } else if (couldRemoveInVerb(effect, isSuppliedUsed)) {
        problems.warning(effectPath, `Could destroy ${supplied.id}, so the supply isn't closed.`);
      }
    });
  });
}

function checkRuleSupply(file: ItemFile, supplied: ItemDefinition, problems: ProblemList) {
  const view = {
    definitionId: supplied.id,
    components: resolveComponents(file.components, supplied, {}),
  };
  file.rules.forEach((rule, index) => {
    const reachesSupply = matchesThing(rule.if, view);
    rule.effects.forEach((effect, effectIndex) => {
      const path = `rules.${index}.effects.${effectIndex}`;
      if (makesSupply(file, effect, supplied.id)) {
        problems.warning(path, `Makes ${supplied.id}, so the supply isn't closed.`);
      } else if ((reachesSupply || effect.on === "nearby") && removesSomething(effect)) {
        problems.warning(path, `Could destroy ${supplied.id}, so the supply isn't closed.`);
      }
    });
  });
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
    checkRuleSupply(file, definition, problems);
  }
}
