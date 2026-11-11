import {
  CARRIABLE_WEIGHT_COMPONENT,
  itemDefinitionSchema,
  type ComponentDeclaration,
  type FieldType,
  type FieldValue,
  type ItemDefinition,
  type ItemFile,
} from "@village/shared";
import { clientConfig } from "../client-config";
import { createUniqueName, removeAt, replaceAt, withoutKey } from "./list-edits";

export function buildDefaultFieldValue(type: FieldType): FieldValue {
  if (type === "number") return 0;
  if (type === "range") return { min: 0, max: 0 };
  if (type === "boolean") return false;
  return "";
}

/** A value for every declared field, ready to edit. */
export function buildDefaultComponentValues(
  declaration: ComponentDeclaration,
): Record<string, FieldValue> {
  return Object.fromEntries(
    Object.entries(declaration.fields).map(([field, { type }]) => [
      field,
      buildDefaultFieldValue(type),
    ]),
  );
}

export function addComponentToDefinition(
  file: ItemFile,
  definition: ItemDefinition,
  componentName: string,
): ItemDefinition {
  const declaration = file.components[componentName];
  if (!declaration || Object.hasOwn(definition.components, componentName)) return definition;
  return {
    ...definition,
    components: {
      ...definition.components,
      [componentName]: buildDefaultComponentValues(declaration),
    },
  };
}

export function removeComponentFromDefinition(
  definition: ItemDefinition,
  componentName: string,
): ItemDefinition {
  return { ...definition, components: withoutKey(definition.components, componentName) };
}

export function setComponentField(
  definition: ItemDefinition,
  componentName: string,
  fieldName: string,
  value: FieldValue,
): ItemDefinition {
  const values = definition.components[componentName] ?? {};
  return {
    ...definition,
    components: { ...definition.components, [componentName]: { ...values, [fieldName]: value } },
  };
}

function pickSpriteTileset(file: ItemFile): string {
  return file.definitions[0]?.sprite.tileset ?? clientConfig.itemEditor.defaultSpriteTileset;
}

/** A carriable with a unique id and, when it is declared, the weight every carriable needs. */
export function buildNewDefinition(file: ItemFile): ItemDefinition {
  const id = createUniqueName(
    clientConfig.itemEditor.newDefinitionId,
    file.definitions.map((definition) => definition.id),
  );
  const definition = itemDefinitionSchema.parse({
    id,
    name: id.replaceAll("_", " "),
    form: "carriable",
    sprite: { tileset: pickSpriteTileset(file), tile: 0 },
  });
  return addComponentToDefinition(file, definition, CARRIABLE_WEIGHT_COMPONENT);
}

export function addDefinition(file: ItemFile): ItemFile {
  return { ...file, definitions: [...file.definitions, buildNewDefinition(file)] };
}

export function duplicateDefinition(file: ItemFile, index: number): ItemFile {
  const original = file.definitions[index];
  if (!original) return file;
  const id = createUniqueName(
    original.id,
    file.definitions.map((definition) => definition.id),
  );
  const copy = { ...structuredClone(original), id };
  const definitions = [...file.definitions];
  definitions.splice(index + 1, 0, copy);
  return { ...file, definitions };
}

export function updateDefinition(
  file: ItemFile,
  index: number,
  definition: ItemDefinition,
): ItemFile {
  return { ...file, definitions: replaceAt(file.definitions, index, definition) };
}

export function removeDefinition(file: ItemFile, index: number): ItemFile {
  return { ...file, definitions: removeAt(file.definitions, index) };
}
