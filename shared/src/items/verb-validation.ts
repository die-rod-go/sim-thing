import { describeThingView, listAllVerbViews, matchesAppliesTo } from "./applies-to";
import { listVerbReads } from "./effect-reads";
import { checkEffect, type EffectCheckContext } from "./effect-validation";
import type { ItemDefinition, Verb } from "./item-file";
import { checkMatcher, couldMatchAnyView, listViewsAfterEffects } from "./matcher-validation";
import { listGuaranteedComponents, requiresWhere, type ThingView } from "./matchers";
import { checkComponentReads } from "./read-validation";

function describeVerbPath(verb: Verb, index: number): string {
  return `verbs.${index} (${verb.name})`;
}

function checkReach(verb: Verb, path: string, context: EffectCheckContext) {
  const { appliesTo } = verb;
  if (appliesTo === undefined) return;
  const views = listAllVerbViews(context.file);
  const couldMatch = couldMatchAnyView(appliesTo, listViewsAfterEffects(context.file, views));
  if (!couldMatch) context.problems.warning(path, "appliesTo matches nothing.");
}

function checkVerbReads(
  verb: Verb,
  path: string,
  definitionsById: ReadonlyMap<string, ItemDefinition>,
  context: EffectCheckContext,
) {
  const guaranteed =
    verb.appliesTo === undefined ? null : listGuaranteedComponents(verb.appliesTo, definitionsById);
  checkComponentReads(
    { reads: listVerbReads(verb), allowedWho: "item", guaranteed, source: "appliesTo", path },
    context,
  );
}

function checkEffects(
  verb: Verb,
  path: string,
  isBareHanded: boolean,
  context: EffectCheckContext,
) {
  const { problems } = context;
  verb.effects.forEach((effect, effectIndex) => {
    const effectPath = `${path}.effects.${effectIndex}`;
    checkEffect(effect, "verb", effectPath, context);
    if (effect.when === "start" && effect.requiresHit === true) {
      problems.error(effectPath, "A start effect can't require a hit: the roll comes at finish.");
    }
    if (effect.requiresHit === true && verb.hitRoll === undefined) {
      problems.warning(effectPath, "requiresHit does nothing in a verb without a hitRoll.");
    }
    if (effect.on === "item" && isBareHanded) {
      problems.error(
        effectPath,
        "`on: item` in a verb the user does bare-handed: there's no item.",
      );
    }
    if (effect.on === "target" && verb.target === "none") {
      problems.error(effectPath, "`on: target` in a verb with no target.");
    }
  });
}

function checkPhrases(verb: Verb, path: string, context: EffectCheckContext) {
  const { problems } = context;
  if (verb.hitRoll !== undefined) {
    if (verb.phrases.hit === undefined)
      problems.error(path, "A verb with a hitRoll needs a `hit` phrase.");
    if (verb.phrases.missed === undefined) {
      problems.error(path, "A verb with a hitRoll needs a `missed` phrase.");
    }
  }
  if (
    verb.effects.some((effect) => effect.type === "damage") &&
    verb.phrases.killed === undefined
  ) {
    problems.error(path, "A verb that does damage needs a `killed` phrase to name the death.");
  }
}

function checkItemNames(verb: Verb, path: string, context: EffectCheckContext) {
  const { file, definitionIds, problems } = context;
  for (const definitionId of Object.keys(verb.inputs)) {
    if (!definitionIds.has(definitionId))
      problems.error(`${path}.inputs`, `Unknown item "${definitionId}".`);
  }
  for (const definitionId of verb.tools?.definitions ?? []) {
    if (!definitionIds.has(definitionId))
      problems.error(`${path}.tools`, `Unknown item "${definitionId}".`);
  }
  for (const component of verb.tools?.components ?? []) {
    if (!Object.hasOwn(file.components, component)) {
      problems.error(`${path}.tools`, `Unknown component "${component}".`);
    }
  }
}

/** Same-named verbs must never both apply to the same kind of thing in the same place. */
function checkOverlaps(verbs: readonly Verb[], views: ThingView[], context: EffectCheckContext) {
  verbs.forEach((verb, index) => {
    verbs.slice(0, index).forEach((earlier) => {
      if (earlier.name.trim().toLowerCase() !== verb.name.trim().toLowerCase()) return;
      const isBothBareHanded = verb.appliesTo === undefined && earlier.appliesTo === undefined;
      const shared = views.find(
        (view) => matchesAppliesTo(verb, view) && matchesAppliesTo(earlier, view),
      );
      if (!isBothBareHanded && shared === undefined) return;
      const where = shared === undefined ? "bare hands" : describeThingView(shared);
      context.problems.error(
        describeVerbPath(verb, index),
        `Another "${verb.name}" verb also applies to ${where}; narrow one appliesTo with \`not\`.`,
      );
    });
  });
}

export function checkVerbs(
  definitionsById: ReadonlyMap<string, ItemDefinition>,
  context: EffectCheckContext,
): void {
  const { file } = context;
  file.verbs.forEach((verb, index) => {
    const path = describeVerbPath(verb, index);
    if (verb.appliesTo !== undefined) {
      checkMatcher(verb.appliesTo, `${path}.appliesTo`, context, { isAppliesTo: true });
    }
    checkReach(verb, `${path}.appliesTo`, context);
    const isAimedAtSomething = verb.target !== "none";
    const isHeldOrBareHanded =
      verb.appliesTo === undefined || requiresWhere(verb.appliesTo, "held");
    if (isAimedAtSomething && !isHeldOrBareHanded) {
      context.problems.error(
        `${path}.appliesTo`,
        "An aimed verb's appliesTo must require `where: held` (or be omitted), so `target` is free for what it's aimed at.",
      );
    }
    checkVerbReads(verb, path, definitionsById, context);
    checkEffects(verb, path, verb.appliesTo === undefined, context);
    checkPhrases(verb, `${path}.phrases`, context);
    checkItemNames(verb, path, context);
  });
  checkOverlaps(file.verbs, listAllVerbViews(file), context);
}
