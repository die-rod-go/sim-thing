import {
  describeCount,
  listComponentWords,
  listDefinitionViews,
  matchesAppliesTo,
  resolveComponents,
  type ItemDefinition,
  type ItemFile,
} from "@village/shared";

/** The names of the verbs that apply to the definition somewhere it can be, each once. */
export function listApplyingVerbNames(file: ItemFile, definition: ItemDefinition): string[] {
  const views = listDefinitionViews(file, definition);
  const names = file.verbs
    .filter((verb) => views.some((view) => matchesAppliesTo(verb, view)))
    .map((verb) => verb.name);
  return [...new Set(names)];
}

/**
 * How a prompt lists an untouched one to an agent who sees it: "a jar (take from; 6 left)", the
 * verbs first, then the visible component and number-field words, as the server writes them.
 * Grouping, contents and ground words need a live world and are left out.
 */
export function describeItemPreview(file: ItemFile, definition: ItemDefinition): string {
  const components = resolveComponents(file.components, definition, {});
  const words = listComponentWords(file.components, components, true).join(", ");
  const details = [listApplyingVerbNames(file, definition).join(", "), words].filter(Boolean);
  const text = describeCount(definition, 1);
  return details.length > 0 ? `${text} (${details.join("; ")})` : text;
}
