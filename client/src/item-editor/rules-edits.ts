import { ruleSchema, type ItemFile, type Rule } from "@village/shared";
import { clientConfig } from "../client-config";
import { removeAt, replaceAt } from "./list-edits";
import { describeMatcher } from "./matcher-edits";

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
  return `if ${describeMatcher(rule.if)}: ${rule.steps.length} steps`;
}

export type RuleTrigger = Rule["trigger"];

export const RULE_TRIGGERS: readonly RuleTrigger[] = ["every", "stimulus", "becomes"];

/** The rule with another trigger: its matcher, steps and death phrase stay, the setting is reset. */
export function changeRuleTrigger(
  rule: Rule,
  trigger: RuleTrigger,
  stimuli: readonly string[],
): Rule {
  const { if: matcher, steps, killed } = rule;
  const shared = { if: matcher, steps, ...(killed === undefined ? {} : { killed }) };
  switch (trigger) {
    case "every":
      return { trigger, minutes: clientConfig.itemEditor.newRuleMinutes, ...shared };
    case "stimulus":
      return {
        trigger,
        stimulus: stimuli[0] ?? clientConfig.itemEditor.newStimulusName,
        ...shared,
      };
    case "becomes":
      return { trigger, ...shared };
  }
}
