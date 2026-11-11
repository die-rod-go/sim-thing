import {
  conditionSchema,
  reactionSchema,
  type ConditionDefinition,
  type ItemFile,
  type Reaction,
} from "@village/shared";
import { clientConfig } from "../client-config";
import { removeAt, replaceAt } from "./list-edits";

/** A condition for the first component that has none yet; unchanged when every one has one. */
export function addCondition(file: ItemFile): ItemFile {
  const taken = new Set(file.conditions.map((condition) => condition.name));
  const name = Object.keys(file.components).find((component) => !taken.has(component));
  if (name === undefined) return file;
  const condition = conditionSchema.parse({ name, defaultMinutes: null });
  return { ...file, conditions: [...file.conditions, condition] };
}

export function updateCondition(
  file: ItemFile,
  index: number,
  condition: ConditionDefinition,
): ItemFile {
  return { ...file, conditions: replaceAt(file.conditions, index, condition) };
}

export function removeCondition(file: ItemFile, index: number): ItemFile {
  return { ...file, conditions: removeAt(file.conditions, index) };
}

/** A reaction to the first known stimulus by anything with the first component, no effects yet. */
export function addReaction(file: ItemFile, stimuli: readonly string[]): ItemFile {
  const component = Object.keys(file.components)[0];
  if (component === undefined) return file;
  const reaction = reactionSchema.parse({
    stimulus: stimuli[0] ?? clientConfig.itemEditor.newStimulusName,
    if: { has: component },
    effects: [],
  });
  return { ...file, reactions: [...file.reactions, reaction] };
}

export function updateReaction(file: ItemFile, index: number, reaction: Reaction): ItemFile {
  return { ...file, reactions: replaceAt(file.reactions, index, reaction) };
}

export function removeReaction(file: ItemFile, index: number): ItemFile {
  return { ...file, reactions: removeAt(file.reactions, index) };
}
