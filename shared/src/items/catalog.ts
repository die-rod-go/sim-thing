import type { ConditionDefinition, ItemDefinition, ItemFile, Verb } from "./item-file";

/** A parsed `items.json` with lookups by id and name. */
export interface ItemCatalog {
  file: ItemFile;
  definitionsById: ReadonlyMap<string, ItemDefinition>;
  conditionsByName: ReadonlyMap<string, ConditionDefinition>;
  verbs: readonly Verb[];
  personProperties: readonly string[];
}

export function buildItemCatalog(file: ItemFile): ItemCatalog {
  return {
    file,
    definitionsById: new Map(file.definitions.map((definition) => [definition.id, definition])),
    conditionsByName: new Map(file.conditions.map((condition) => [condition.name, condition])),
    verbs: file.verbs,
    personProperties: file.person.properties,
  };
}

export function findDefinition(catalog: ItemCatalog, definitionId: string): ItemDefinition {
  const definition = catalog.definitionsById.get(definitionId);
  if (!definition) throw new Error(`No item definition "${definitionId}" in items.json`);
  return definition;
}

export function hasComponent(definition: ItemDefinition, component: string): boolean {
  return Object.hasOwn(definition.components, component);
}

/** A component field's value on a definition, or undefined when it doesn't have it. */
export function readComponentField(
  definition: ItemDefinition,
  component: string,
  field: string,
): unknown {
  return definition.components[component]?.[field];
}

function startsWithVowelSound(text: string): boolean {
  return /^[aeiou]/i.test(text);
}

/** "a knife", "3 knives", "30 coins"; things without a plural count as "1 bread", "3 bread". */
export function describeCount(definition: ItemDefinition, count: number): string {
  if (definition.plural === undefined) return `${count} ${definition.name}`;
  if (count === 1) {
    return `${startsWithVowelSound(definition.name) ? "an" : "a"} ${definition.name}`;
  }
  return `${count} ${definition.plural}`;
}

/** The names a reply may use for a definition: its name and its plural. */
export function listDefinitionNames(definition: ItemDefinition): string[] {
  return definition.plural === undefined ? [definition.name] : [definition.name, definition.plural];
}

/** The definition a reply names, by id, name or plural, ignoring case. */
export function findDefinitionByName(
  catalog: ItemCatalog,
  name: string,
): ItemDefinition | undefined {
  const wanted = name.trim().toLowerCase();
  return catalog.file.definitions.find(
    (definition) =>
      definition.id === wanted ||
      listDefinitionNames(definition).some((candidate) => candidate.toLowerCase() === wanted),
  );
}
