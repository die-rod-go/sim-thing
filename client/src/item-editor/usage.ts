import { listMentionedComponents, type ItemFile } from "@village/shared";
import { describeRuleTrigger } from "./rules-edits";
import { listStepComponents } from "./step-edits";

/** Everything that uses a component: items that have it, verbs that name, read or need it, rules. */
export function listComponentUses(file: ItemFile, component: string): string[] {
  return [
    ...file.definitions
      .filter((definition) => Object.hasOwn(definition.components, component))
      .map((definition) => `item ${definition.id}`),
    ...file.verbs
      .filter(
        (verb) =>
          (verb.appliesTo !== undefined &&
            listMentionedComponents(verb.appliesTo).includes(component)) ||
          (verb.target !== undefined && listMentionedComponents(verb.target).includes(component)) ||
          verb.steps.some((step) => listStepComponents(step).includes(component)),
      )
      .map((verb) => `verb ${verb.name}`),
    ...file.rules
      .filter(
        (rule) =>
          listMentionedComponents(rule.if).includes(component) ||
          rule.steps.some((step) => listStepComponents(step).includes(component)),
      )
      .map((rule) => `rule ${describeRuleTrigger(rule)}`),
  ];
}
