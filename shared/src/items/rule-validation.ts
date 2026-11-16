import { resolveComponents } from "./components";
import type { ItemDefinition, Rule } from "./item-file";
import type { ValidationContext } from "./item-problems";
import { checkMatcher, couldMatchAfterSteps } from "./matcher-validation";
import type { ThingView } from "./matchers";
import { checkSteps, isDamagingBodies } from "./step-validation";

function describeRulePath(rule: Rule, index: number): string {
  const detail = rule.trigger === "stimulus" ? `stimulus ${rule.stimulus}` : rule.trigger;
  return `rules.${index} (${detail})`;
}

/** Every definition, the agent body included, with no `where`: what a rule's `if` could meet. */
function listRuleViews(context: ValidationContext): ThingView[] {
  const { file } = context;
  return file.definitions.map((definition) => ({
    definitionId: definition.id,
    components: resolveComponents(file.components, definition, {}),
  }));
}

function checkReach(rule: Rule, path: string, context: ValidationContext) {
  const couldMatch = couldMatchAfterSteps(context.file, rule.if, listRuleViews(context));
  if (!couldMatch) context.problems.warning(`${path}.if`, "`if` matches nothing.");
}

export function checkRules(
  definitionsById: ReadonlyMap<string, ItemDefinition>,
  context: ValidationContext,
): void {
  context.file.rules.forEach((rule, index) => {
    const path = describeRulePath(rule, index);
    checkMatcher(rule.if, `${path}.if`, context);
    checkReach(rule, path, context);
    const scope = checkSteps({ kind: "rule", rule }, path, definitionsById, context);
    const isDamagingBody = rule.steps.some((step) => isDamagingBodies(step, scope));
    if (isDamagingBody && rule.killed === undefined) {
      context.problems.error(path, "A rule that does damage to a body needs a `killed` phrase.");
    }
  });
}
