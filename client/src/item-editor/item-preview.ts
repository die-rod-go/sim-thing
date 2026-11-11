import {
  describeCount,
  listDefinitionViews,
  matchesAppliesTo,
  type ItemDefinition,
  type ItemFile,
} from "@village/shared";

/**
 * How a prompt lists one of these in the user's hands, or where it stands for a placeable:
 * "a knife (attack, throw)". The server's grouping code needs a live world, so this mirrors its
 * format for a single stateless entity.
 */
export function describeItemPreview(file: ItemFile, definition: ItemDefinition): string {
  const [view] = listDefinitionViews(file, definition);
  const verbNames =
    view === undefined
      ? []
      : file.verbs.filter((verb) => matchesAppliesTo(verb, view)).map((verb) => verb.name);
  const uniqueNames = [...new Set(verbNames)];
  const text = describeCount(definition, 1);
  return uniqueNames.length > 0 ? `${text} (${uniqueNames.join(", ")})` : text;
}
