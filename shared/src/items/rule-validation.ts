import { resolveBodyDefaults } from "./applies-to";
import { resolveComponents } from "./components";
import { listRuleReads } from "./effect-reads";
import { checkEffect, type EffectCheckContext } from "./effect-validation";
import type { ItemDefinition, Rule } from "./item-file";
import { checkMatcher, couldMatchAnyView, listViewsAfterEffects } from "./matcher-validation";
import { listGuaranteedComponents, type ThingView } from "./matchers";
import { checkComponentReads } from "./read-validation";

function describeRulePath(rule: Rule, index: number): string {
  const detail = rule.trigger === "stimulus" ? `stimulus ${rule.stimulus}` : rule.trigger;
  return `rules.${index} (${detail})`;
}

/** Every definition, the agent body included, with no `where`: what a rule's `if` could meet. */
function listRuleViews(context: EffectCheckContext): ThingView[] {
  const { file } = context;
  return listViewsAfterEffects(
    file,
    file.definitions.map((definition) => ({
      definitionId: definition.id,
      components: resolveComponents(file.components, definition, {}),
    })),
  );
}

function checkReach(rule: Rule, path: string, context: EffectCheckContext) {
  const couldMatch = couldMatchAnyView(rule.if, listRuleViews(context));
  if (!couldMatch) context.problems.warning(`${path}.if`, "`if` matches nothing.");
}

function couldReachBody(rule: Rule, context: EffectCheckContext): boolean {
  const { file } = context;
  const bodyViews = listViewsAfterEffects(file, [
    { definitionId: file.world.agentBody, components: resolveBodyDefaults(file) },
  ]);
  return couldMatchAnyView(rule.if, bodyViews);
}

function checkKilledPhrase(rule: Rule, path: string, context: EffectCheckContext) {
  if (rule.killed !== undefined) return;
  const isDamagingBodies = rule.effects.some(
    (effect) =>
      effect.type === "damage" && (effect.on === "nearby" || couldReachBody(rule, context)),
  );
  if (isDamagingBodies) {
    context.problems.error(path, "A rule that does damage to a body needs a `killed` phrase.");
  }
}

export function checkRules(
  definitionsById: ReadonlyMap<string, ItemDefinition>,
  context: EffectCheckContext,
): void {
  context.file.rules.forEach((rule, index) => {
    const path = describeRulePath(rule, index);
    checkMatcher(rule.if, `${path}.if`, context);
    checkReach(rule, path, context);
    rule.effects.forEach((effect, effectIndex) =>
      checkEffect(effect, "rule", `${path}.effects.${effectIndex}`, context),
    );
    checkComponentReads(
      {
        reads: listRuleReads(rule),
        allowedWho: "self",
        guaranteed: listGuaranteedComponents(rule.if, definitionsById),
        source: "`if`",
        path,
      },
      context,
    );
    checkKilledPhrase(rule, path, context);
  });
}
