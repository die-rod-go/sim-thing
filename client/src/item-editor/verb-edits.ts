import {
  describeThingView,
  listAllSteps,
  listAllVerbViews,
  listDefinitionViews,
  matchesAppliesTo,
  matchesThing,
  verbSchema,
  type ItemDefinition,
  type ItemFile,
  type Matcher,
  type Verb,
} from "@village/shared";
import { clientConfig } from "../client-config";
import { listStepStimuli } from "./step-edits";
import { createUniqueName, removeAt, replaceAt } from "./list-edits";

/** Whether the verb applies to the definition anywhere it can be (held, here, inside). */
export function doesVerbApplyToDefinition(
  file: ItemFile,
  verb: Verb,
  definition: ItemDefinition,
): boolean {
  return listDefinitionViews(file, definition).some((view) => matchesAppliesTo(verb, view));
}

/** Indexes of the verbs that apply to the definition, in file order. */
export function listVerbIndexesForDefinition(file: ItemFile, definition: ItemDefinition): number[] {
  return file.verbs.flatMap((verb, index) =>
    doesVerbApplyToDefinition(file, verb, definition) ? [index] : [],
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
      definition.id !== definitionId && doesVerbApplyToDefinition(file, verb, definition),
  ).length;
}

/** "knife (held)", "person (here)", ...: everything the matcher matches, for the live match list. */
export function listAppliesToMatches(file: ItemFile, matcher: Matcher): string[] {
  return listAllVerbViews(file)
    .filter((view) => matchesThing(matcher, view))
    .map(describeThingView);
}

/** A verb applying to just this definition, held in the hand when it can be held. */
export function buildVerbForDefinition(file: ItemFile, definition: ItemDefinition): Verb {
  const isHoldable = listDefinitionViews(file, definition).some((view) => view.where === "held");
  const appliesTo: Matcher = isHoldable
    ? { allOf: [{ definition: definition.id }, { where: "held" }] }
    : { definition: definition.id };
  return verbSchema.parse({ name: createNewVerbName(file), appliesTo, steps: [] });
}

/** A bare-handed verb, ready to be given an `appliesTo` in the Verbs tab. */
export function buildNewVerb(file: ItemFile): Verb {
  return verbSchema.parse({ name: createNewVerbName(file), steps: [] });
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

/** Every stimulus the file sends or reacts to, sorted, for stimulus pickers. */
export function listStimuli(file: ItemFile): string[] {
  const stimuli = new Set([
    ...listAllSteps(file).flatMap(listStepStimuli),
    ...file.rules.flatMap((rule) => (rule.trigger === "stimulus" ? [rule.stimulus] : [])),
  ]);
  stimuli.delete("");
  return [...stimuli].sort();
}
