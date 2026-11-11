import {
  describeRuleSubject,
  listAllRuleSubjects,
  listGuaranteedComponents,
  listDefinitionSubjects,
  listPossibleLocations,
  matchesRule,
  verbSchema,
  type AppliesToRule,
  type Effect,
  type FieldType,
  type ItemDefinition,
  type ItemFile,
  type Verb,
} from "@village/shared";
import { clientConfig } from "../client-config";
import { createUniqueName, removeAt, replaceAt } from "./list-edits";

/** Whether the rule matches the definition anywhere it can be (held, on the ground, placed). */
export function doesRuleMatchDefinition(
  file: ItemFile,
  rule: AppliesToRule,
  definition: ItemDefinition,
): boolean {
  return listDefinitionSubjects(file, definition).some((subject) => matchesRule(rule, subject));
}

/** Indexes of the verbs whose rule matches the definition, in file order. */
export function listVerbIndexesForDefinition(file: ItemFile, definition: ItemDefinition): number[] {
  return file.verbs.flatMap((verb, index) =>
    doesRuleMatchDefinition(file, verb.appliesTo, definition) ? [index] : [],
  );
}

/** How many definitions besides this one the verb also applies to. */
export function countOtherDefinitionsMatched(
  file: ItemFile,
  verb: Verb,
  definitionId: string,
): number {
  return file.definitions.filter(
    (definition) =>
      definition.id !== definitionId && doesRuleMatchDefinition(file, verb.appliesTo, definition),
  ).length;
}

/** "knife (held)", "the user", ...: everything the rule matches, for the live match list. */
export function listRuleMatches(file: ItemFile, rule: AppliesToRule): string[] {
  return listAllRuleSubjects(file)
    .filter((subject) => matchesRule(rule, subject))
    .map(describeRuleSubject);
}

/** A verb applying to just this definition, held in the hand when it can be held. */
export function buildVerbForDefinition(file: ItemFile, definition: ItemDefinition): Verb {
  const appliesTo: AppliesToRule = listPossibleLocations(file, definition).includes("held")
    ? { allOf: [{ definition: definition.id }, { location: "held" }] }
    : { definition: definition.id };
  return verbSchema.parse({ name: createNewVerbName(file), appliesTo, effects: [] });
}

/** A verb that applies to the user, ready for its rule to be built in the Verbs tab. */
export function buildNewVerb(file: ItemFile): Verb {
  return verbSchema.parse({
    name: createNewVerbName(file),
    appliesTo: { isUser: true },
    effects: [],
  });
}

function createNewVerbName(file: ItemFile): string {
  return createUniqueName(
    clientConfig.itemEditor.newVerbName,
    file.verbs.map((verb) => verb.name),
    " ",
  );
}

export function addVerb(file: ItemFile, verb: Verb): ItemFile {
  return { ...file, verbs: [...file.verbs, verb] };
}

export function updateVerb(file: ItemFile, index: number, verb: Verb): ItemFile {
  return { ...file, verbs: replaceAt(file.verbs, index, verb) };
}

export function removeVerb(file: ItemFile, index: number): ItemFile {
  return { ...file, verbs: removeAt(file.verbs, index) };
}

/**
 * Component reads a verb with this rule may use, as "item.<component>.<field>" paths: the fields
 * of the given type in every component the rule guarantees.
 */
export function listReadablePaths(
  file: ItemFile,
  rule: AppliesToRule,
  fieldType: FieldType,
): string[] {
  const definitionsById = new Map(
    file.definitions.map((definition) => [definition.id, definition]),
  );
  return [...listGuaranteedComponents(rule, definitionsById)].flatMap((component) =>
    Object.entries(file.components[component]?.fields ?? {})
      .filter(([, field]) => field.type === fieldType)
      .map(([field]) => `item.${component}.${field}`),
  );
}

function listEffectStimuli(effect: Effect): string[] {
  if (effect.type !== "damage" && effect.type !== "emit") return [];
  return typeof effect.stimulus === "string" ? [effect.stimulus] : [];
}

function listAllEffects(file: ItemFile): Effect[] {
  return [
    ...file.verbs.flatMap((verb) => verb.effects),
    ...file.conditions.flatMap((condition) => [...condition.everyMinute, ...condition.onEnd]),
    ...file.reactions.flatMap((reaction) => reaction.effects),
    ...file.definitions.flatMap((definition) => definition.onBroken ?? []),
  ];
}

/** Every stimulus the file emits or reacts to, sorted, for stimulus pickers. */
export function listStimuli(file: ItemFile): string[] {
  const stimuli = new Set([
    ...listAllEffects(file).flatMap(listEffectStimuli),
    ...file.reactions.map((reaction) => reaction.stimulus),
  ]);
  stimuli.delete("");
  return [...stimuli].sort();
}
