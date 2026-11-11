import { listVerbReads, type AppliesToRule, type ItemFile } from "@village/shared";

function listRuleTerms(rule: AppliesToRule): AppliesToRule[] {
  if ("allOf" in rule) return rule.allOf.flatMap(listRuleTerms);
  if ("anyOf" in rule) return rule.anyOf.flatMap(listRuleTerms);
  if ("not" in rule) return listRuleTerms(rule.not);
  return [rule];
}

function doesRuleMention(rule: AppliesToRule, key: "property" | "component", name: string) {
  return listRuleTerms(rule).some((term) => key in term && Object.values(term)[0] === name);
}

/** Everything that uses a property: items, people, verb rules and tools, reactions. */
export function listPropertyUses(file: ItemFile, property: string): string[] {
  return [
    ...file.definitions
      .filter((definition) => definition.properties.includes(property))
      .map((definition) => `item ${definition.id}`),
    ...(file.person.properties.includes(property) ? ["people"] : []),
    ...file.verbs
      .filter(
        (verb) =>
          doesRuleMention(verb.appliesTo, "property", property) ||
          (verb.tools?.properties ?? []).includes(property),
      )
      .map((verb) => `verb ${verb.name}`),
    ...file.reactions
      .filter((reaction) => reaction.property === property || reaction.unless === property)
      .map((reaction) => `reaction to ${reaction.stimulus}`),
  ];
}

/** Everything that uses a component: items that have it, verbs whose rule names or reads it. */
export function listComponentUses(file: ItemFile, component: string): string[] {
  return [
    ...file.definitions
      .filter((definition) => Object.hasOwn(definition.components, component))
      .map((definition) => `item ${definition.id}`),
    ...file.verbs
      .filter(
        (verb) =>
          doesRuleMention(verb.appliesTo, "component", component) ||
          listVerbReads(verb).some((read) => read.component === component),
      )
      .map((verb) => `verb ${verb.name}`),
  ];
}

/** Everything that adds, removes or reacts to a condition. */
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
      .filter(
        (reaction) =>
          reaction.condition === condition ||
          reaction.unless === condition ||
          usesCondition(reaction.effects),
      )
      .map((reaction) => `reaction to ${reaction.stimulus}`),
  ];
}
