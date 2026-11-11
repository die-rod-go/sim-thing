import {
  conditionSchema,
  reactionSchema,
  type ConditionDefinition,
  type ItemFile,
  type Reaction,
} from "@village/shared";
import { clientConfig } from "../client-config";
import { createUniqueName, removeAt, replaceAt } from "./list-edits";

export function addCondition(file: ItemFile): ItemFile {
  const name = createUniqueName(
    clientConfig.itemEditor.newConditionName,
    file.conditions.map((condition) => condition.name),
  );
  const condition = conditionSchema.parse({
    name,
    words: name.replaceAll("_", " "),
    defaultMinutes: null,
  });
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

/** A reaction to the first known stimulus by the first declared property, with no effects yet. */
export function addReaction(file: ItemFile, stimuli: readonly string[]): ItemFile {
  const property = Object.keys(file.properties)[0];
  const condition = file.conditions[0]?.name;
  if (property === undefined && condition === undefined) return file;
  const reaction = reactionSchema.parse({
    stimulus: stimuli[0] ?? clientConfig.itemEditor.newStimulusName,
    ...(property !== undefined ? { property } : { condition }),
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
