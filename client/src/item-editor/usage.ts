import { listVerbReads, type AppliesToRule, type ItemFile, type Matcher } from "@village/shared";

function listRuleTerms(rule: AppliesToRule): AppliesToRule[] {
  if ("allOf" in rule) return rule.allOf.flatMap(listRuleTerms);
  if ("anyOf" in rule) return rule.anyOf.flatMap(listRuleTerms);
  if ("not" in rule) return listRuleTerms(rule.not);
  return [rule];
}

function doesRuleMentionComponent(rule: AppliesToRule, component: string): boolean {
  return listRuleTerms(rule).some((term) => "component" in term && term.component === component);
}

function doesMatcherMentionComponent(matcher: Matcher, component: string): boolean {
  if ("has" in matcher) return matcher.has === component;
  if ("field" in matcher) return matcher.field.startsWith(`${component}.`);
  if ("allOf" in matcher) {
    return matcher.allOf.some((part) => doesMatcherMentionComponent(part, component));
  }
  if ("anyOf" in matcher) {
    return matcher.anyOf.some((part) => doesMatcherMentionComponent(part, component));
  }
  if ("not" in matcher) return doesMatcherMentionComponent(matcher.not, component);
  return false;
}

/** Everything that uses a component: items that have it, verbs that name, read or need it, reactions. */
export function listComponentUses(file: ItemFile, component: string): string[] {
  return [
    ...file.definitions
      .filter((definition) => Object.hasOwn(definition.components, component))
      .map((definition) => `item ${definition.id}`),
    ...file.verbs
      .filter(
        (verb) =>
          doesRuleMentionComponent(verb.appliesTo, component) ||
          (verb.tools?.components ?? []).includes(component) ||
          listVerbReads(verb).some((read) => read.component === component),
      )
      .map((verb) => `verb ${verb.name}`),
    ...file.reactions
      .filter((reaction) => doesMatcherMentionComponent(reaction.if, component))
      .map((reaction) => `reaction to ${reaction.stimulus}`),
  ];
}

/** Everything that adds or removes a condition. */
export function listConditionUses(file: ItemFile, condition: string): string[] {
  const usesCondition = (effects: ItemFile["verbs"][number]["effects"]) =>
    effects.some(
      (effect) =>
        (effect.type === "add_condition" || effect.type === "remove_condition") &&
        effect.condition === condition,
    );
  return [
    ...file.verbs.filter((verb) => usesCondition(verb.effects)).map((verb) => `verb ${verb.name}`),
    ...file.reactions
      .filter((reaction) => usesCondition(reaction.effects))
      .map((reaction) => `reaction to ${reaction.stimulus}`),
  ];
}
