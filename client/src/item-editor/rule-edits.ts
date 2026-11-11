import type { AppliesToRule, ItemFile } from "@village/shared";

export const RULE_KINDS = [
  "definition",
  "component",
  "form",
  "property",
  "location",
  "isUser",
  "isDeadAgent",
  "allOf",
  "anyOf",
  "not",
] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  definition: "is the item",
  component: "has component",
  form: "has form",
  property: "has property",
  location: "is",
  isUser: "is the user",
  isDeadAgent: "is a dead agent",
  allOf: "all of",
  anyOf: "any of",
  not: "not",
};

export function findRuleKind(rule: AppliesToRule): RuleKind {
  const kind = RULE_KINDS.find((candidate) => Object.hasOwn(rule, candidate));
  if (kind === undefined) throw new Error(`Unknown appliesTo rule: ${JSON.stringify(rule)}`);
  return kind;
}

export function isRuleGroup(
  rule: AppliesToRule,
): rule is { allOf: AppliesToRule[] } | { anyOf: AppliesToRule[] } {
  return "allOf" in rule || "anyOf" in rule;
}

/** A starting rule of the kind, naming the first thing of that kind in the file. */
export function buildRuleOfKind(kind: RuleKind, file: ItemFile): AppliesToRule {
  switch (kind) {
    case "definition":
      return { definition: file.definitions[0]?.id ?? "" };
    case "component":
      return { component: Object.keys(file.components)[0] ?? "" };
    case "form":
      return { form: "carriable" };
    case "property":
      return { property: Object.keys(file.properties)[0] ?? "" };
    case "location":
      return { location: "held" };
    case "isUser":
      return { isUser: true };
    case "isDeadAgent":
      return { isDeadAgent: true };
    case "allOf":
      return { allOf: [] };
    case "anyOf":
      return { anyOf: [] };
    case "not":
      return { not: { isUser: true } };
  }
}

/** Changes a rule's kind, keeping its parts when switching between `allOf` and `anyOf`. */
export function changeRuleKind(rule: AppliesToRule, kind: RuleKind, file: ItemFile): AppliesToRule {
  if (isRuleGroup(rule)) {
    const parts = "allOf" in rule ? rule.allOf : rule.anyOf;
    if (kind === "allOf") return { allOf: parts };
    if (kind === "anyOf") return { anyOf: parts };
  }
  return buildRuleOfKind(kind, file);
}

export function listRuleParts(rule: AppliesToRule): AppliesToRule[] {
  if ("allOf" in rule) return rule.allOf;
  if ("anyOf" in rule) return rule.anyOf;
  return [];
}

/** The same group with new parts; terms that aren't groups come back unchanged. */
export function withRuleParts(rule: AppliesToRule, parts: AppliesToRule[]): AppliesToRule {
  if ("allOf" in rule) return { allOf: parts };
  if ("anyOf" in rule) return { anyOf: parts };
  return rule;
}
