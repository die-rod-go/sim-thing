import { resolveComponents } from "./components";
import type { Instinct, InstinctOfKind } from "./item-file";
import type { ValidationContext } from "./item-problems";
import { checkMatcher, couldMatchAnyView, listViewsAfterSteps } from "./matcher-validation";

function describeInstinctPath(instinct: Instinct, index: number): string {
  const what = instinct.do === "verb" ? `verb ${instinct.verb}` : instinct.do;
  return `instincts.${index} (${what})`;
}

function checkVerbInstinct(
  instinct: InstinctOfKind<"verb">,
  path: string,
  context: ValidationContext,
) {
  const wanted = instinct.verb.trim().toLowerCase();
  const verbs = context.file.verbs.filter((verb) => verb.name.trim().toLowerCase() === wanted);
  if (verbs.length === 0) {
    context.problems.error(`${path}.verb`, `There is no verb "${instinct.verb}".`);
  }
  if (instinct.target !== undefined) {
    checkMatcher(instinct.target, `${path}.target`, context, { isTarget: true });
  }
  if (instinct.isRetaliation && verbs.every((verb) => verb.target === undefined)) {
    context.problems.error(path, "A retaliation needs a verb with a target to strike back at.");
  }
}

/** Warns when no definition, as the sim could leave it, is something this instinct applies to. */
function checkAppliesToSomething(instinct: Instinct, path: string, context: ValidationContext) {
  const { file } = context;
  const views = file.definitions
    .filter((definition) => definition.id !== file.world.agentBody)
    .map((definition) => ({
      definitionId: definition.id,
      components: resolveComponents(file.components, definition, {}),
      where: "self" as const,
    }));
  if (!couldMatchAnyView(instinct.appliesTo, listViewsAfterSteps(file, views))) {
    context.problems.warning(`${path}.appliesTo`, "appliesTo matches nothing.");
  }
}

/** The instincts: their matchers, and the verbs they name. */
export function checkInstincts(context: ValidationContext): void {
  context.file.instincts.forEach((instinct, index) => {
    const path = describeInstinctPath(instinct, index);
    checkMatcher(instinct.appliesTo, `${path}.appliesTo`, context, { isAppliesTo: true });
    checkAppliesToSomething(instinct, path, context);
    if (instinct.do === "verb") checkVerbInstinct(instinct, path, context);
    if (instinct.do === "flee") checkMatcher(instinct.from, `${path}.from`, context);
  });
}
