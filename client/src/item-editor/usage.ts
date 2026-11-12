import {
  listMentionedComponents,
  listRuleReads,
  listVerbReads,
  type ItemFile,
  type StepRead,
  type Step,
} from "@village/shared";
import { describeRuleTrigger } from "./rules-edits";
import { listStepComponents } from "./step-edits";

export interface ComponentUse {
  kind: "item" | "verb" | "rule";
  index: number;
  label: string;
}

function readsComponent(reads: readonly StepRead[], component: string): boolean {
  return reads.some((read) => read.path.kind === "field" && read.path.component === component);
}

function stepsMention(steps: readonly Step[], component: string): boolean {
  return steps.some((step) => listStepComponents(step).includes(component));
}

/** Items that have the component, then verbs and rules that name, read or need it. */
export function listComponentUses(file: ItemFile, component: string): ComponentUse[] {
  const items = file.definitions.flatMap((definition, index) =>
    Object.hasOwn(definition.components, component)
      ? [{ kind: "item" as const, index, label: definition.name }]
      : [],
  );
  const verbs = file.verbs.flatMap((verb, index) => {
    const isMentioned =
      [verb.appliesTo, verb.target].some(
        (matcher) => matcher !== undefined && listMentionedComponents(matcher).includes(component),
      ) ||
      stepsMention(verb.steps, component) ||
      readsComponent(listVerbReads(verb), component);
    return isMentioned ? [{ kind: "verb" as const, index, label: verb.name }] : [];
  });
  const rules = file.rules.flatMap((rule, index) => {
    const isMentioned =
      listMentionedComponents(rule.if).includes(component) ||
      stepsMention(rule.steps, component) ||
      readsComponent(listRuleReads(rule), component);
    return isMentioned ? [{ kind: "rule" as const, index, label: describeRuleTrigger(rule) }] : [];
  });
  return [...items, ...verbs, ...rules];
}
