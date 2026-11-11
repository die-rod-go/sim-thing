import { listAllVerbViews, matchesAppliesTo } from "./applies-to";
import type { ItemDefinition, Verb } from "./item-file";
import type { ValidationContext } from "./item-problems";
import { checkMatcher, couldMatchAnyView, listViewsAfterSteps } from "./matcher-validation";
import { checkSteps, isDamagingBodies } from "./step-validation";

function describeVerbPath(verb: Verb, index: number): string {
  return `verbs.${index} (${verb.name})`;
}

function checkReach(verb: Verb, path: string, context: ValidationContext) {
  const { appliesTo } = verb;
  if (appliesTo === undefined) return;
  const views = listAllVerbViews(context.file);
  const couldMatch = couldMatchAnyView(appliesTo, listViewsAfterSteps(context.file, views));
  if (!couldMatch) context.problems.warning(path, "appliesTo matches nothing.");
}

function checkPhrases(
  verb: Verb,
  path: string,
  isDamagingBody: boolean,
  context: ValidationContext,
) {
  const { problems } = context;
  if (verb.steps.some((step) => step.step === "roll_hit")) {
    if (verb.phrases.hit === undefined)
      problems.error(path, "A verb with a roll_hit needs a `hit` phrase.");
    if (verb.phrases.missed === undefined) {
      problems.error(path, "A verb with a roll_hit needs a `missed` phrase.");
    }
  }
  if (isDamagingBody && verb.phrases.killed === undefined) {
    problems.error(path, "A verb that could kill needs a `killed` phrase to name the death.");
  }
}

/** Warns when an earlier verb of the same name always wins, so this one never runs. */
function checkShadowing(verbs: readonly Verb[], context: ValidationContext) {
  const views = listAllVerbViews(context.file);
  verbs.forEach((verb, index) => {
    const shadow = verbs
      .slice(0, index)
      .find(
        (earlier) =>
          earlier.name.trim().toLowerCase() === verb.name.trim().toLowerCase() &&
          isShadowedBy(verb, earlier, views),
      );
    if (shadow === undefined) return;
    context.problems.warning(
      describeVerbPath(verb, index),
      `An earlier "${shadow.name}" verb always applies first, so this one never runs; narrow its appliesTo with \`not\`.`,
    );
  });
}

function isShadowedBy(
  verb: Verb,
  earlier: Verb,
  views: Parameters<typeof matchesAppliesTo>[1][],
): boolean {
  if (verb.appliesTo === undefined) return earlier.appliesTo === undefined;
  if (earlier.appliesTo === undefined) return false;
  const matched = views.filter((view) => matchesAppliesTo(verb, view));
  return matched.length > 0 && matched.every((view) => matchesAppliesTo(earlier, view));
}

export function checkVerbs(
  definitionsById: ReadonlyMap<string, ItemDefinition>,
  context: ValidationContext,
): void {
  const { file } = context;
  file.verbs.forEach((verb, index) => {
    const path = describeVerbPath(verb, index);
    if (verb.appliesTo !== undefined) {
      checkMatcher(verb.appliesTo, `${path}.appliesTo`, context, { isAppliesTo: true });
    }
    if (verb.target !== undefined) {
      checkMatcher(verb.target, `${path}.target`, context, { isTarget: true });
    }
    checkReach(verb, `${path}.appliesTo`, context);
    const scope = checkSteps({ kind: "verb", verb }, path, definitionsById, context);
    const isDamagingBody = verb.steps.some((step) => isDamagingBodies(step, scope));
    checkPhrases(verb, `${path}.phrases`, isDamagingBody, context);
  });
  checkShadowing(file.verbs, context);
}
