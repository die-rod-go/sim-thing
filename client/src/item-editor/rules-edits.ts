import { ruleSchema, type ItemFile, type Rule } from "@village/shared";
import { clientConfig } from "../client-config";
import { removeAt, replaceAt } from "./list-edits";

export type ParsedRuleText = { rule: Rule; error: null } | { rule: null; error: string };

/** A rule that fires once a stimulus reaches anything with the first component, no steps yet. */
export function buildNewRule(file: ItemFile, stimuli: readonly string[]): Rule {
  const component = Object.keys(file.components)[0];
  return ruleSchema.parse({
    trigger: "stimulus",
    stimulus: stimuli[0] ?? clientConfig.itemEditor.newStimulusName,
    if: component === undefined ? { allOf: [] } : { has: component },
    steps: [],
  });
}

export function addRule(file: ItemFile, stimuli: readonly string[]): ItemFile {
  return { ...file, rules: [...file.rules, buildNewRule(file, stimuli)] };
}

export function updateRule(file: ItemFile, index: number, rule: Rule): ItemFile {
  return { ...file, rules: replaceAt(file.rules, index, rule) };
}

export function removeRule(file: ItemFile, index: number): ItemFile {
  return { ...file, rules: removeAt(file.rules, index) };
}

/** "every 60 minutes", "stimulus fire", "becomes": the trigger as the side list shows it. */
export function describeRuleTrigger(rule: Rule): string {
  switch (rule.trigger) {
    case "every":
      return `every ${rule.minutes} minutes`;
    case "stimulus":
      return `stimulus ${rule.stimulus}`;
    case "becomes":
      return "becomes";
  }
}

/** The matcher and how many steps the rule has, in one line. */
export function summarizeRule(rule: Rule): string {
  return `if ${JSON.stringify(rule.if)}: ${rule.steps.length} steps`;
}

/** The rule as editable JSON text. */
export function formatRuleText(rule: Rule): string {
  return JSON.stringify(rule, null, clientConfig.itemEditor.jsonIndent);
}

/** Text as a rule, or the reason it isn't one (a JSON syntax error or the schema's complaints). */
export function parseRuleText(text: string): ParsedRuleText {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { rule: null, error: error instanceof Error ? error.message : String(error) };
  }
  const parsed = ruleSchema.safeParse(json);
  if (parsed.success) return { rule: parsed.data, error: null };
  return {
    rule: null,
    error: parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "rule"}: ${issue.message}`)
      .join("; "),
  };
}
