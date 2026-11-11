import { listMentionedComponents, listVerbReads, type ItemFile } from "@village/shared";
import { describeRuleTrigger } from "./rules-edits";

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
          (verb.tools?.components ?? []).includes(component) ||
          listVerbReads(verb).some((read) => read.component === component),
      )
      .map((verb) => `verb ${verb.name}`),
    ...file.rules
      .filter((rule) => listMentionedComponents(rule.if).includes(component))
      .map((rule) => `rule ${describeRuleTrigger(rule)}`),
  ];
}
