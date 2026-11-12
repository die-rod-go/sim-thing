import type {
  ComponentDeclaration,
  FieldBound,
  FieldDeclaration,
  FieldType,
  FieldValue,
  FieldWord,
  ItemDefinition,
  ItemFile,
} from "@village/shared";
import { clientConfig } from "../client-config";
import { buildDefaultFieldValue } from "./definition-edits";
import { createUniqueName, moveWithin, removeAt, replaceAt, withoutKey } from "./list-edits";

/* Component declarations and their fields. Renames live in rename-edits.ts. */

type DefinitionValues = ItemDefinition["components"][string];

function mapDefinitionsWithComponent(
  file: ItemFile,
  component: string,
  change: (values: DefinitionValues) => DefinitionValues,
): ItemDefinition[] {
  return file.definitions.map((definition) => {
    const values = definition.components[component];
    if (values === undefined) return definition;
    return { ...definition, components: { ...definition.components, [component]: change(values) } };
  });
}

function isValueOfType(value: FieldValue, type: FieldType): boolean {
  if (type === "number") return typeof value === "number";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "text" || type === "item") return typeof value === "string";
  return typeof value === "object";
}

function setComponentFields(
  file: ItemFile,
  component: string,
  fields: ComponentDeclaration["fields"],
): ItemFile {
  const declaration = file.components[component];
  if (!declaration) return file;
  return updateComponentDeclaration(file, component, { ...declaration, fields });
}

export function addComponentDeclaration(file: ItemFile): ItemFile {
  const name = createUniqueName(
    clientConfig.itemEditor.newComponentName,
    Object.keys(file.components),
  );
  return {
    ...file,
    components: { ...file.components, [name]: { description: "", fields: {}, isVisible: false } },
  };
}

export function updateComponentDeclaration(
  file: ItemFile,
  name: string,
  declaration: ComponentDeclaration,
): ItemFile {
  return { ...file, components: { ...file.components, [name]: declaration } };
}

/** Only the declaration: whatever still mentions the component shows validation problems. */
export function removeComponentDeclaration(file: ItemFile, name: string): ItemFile {
  return { ...file, components: withoutKey(file.components, name) };
}

/** Adds a number field to the declaration and a value for it to every item with the component. */
export function addComponentField(file: ItemFile, component: string): ItemFile {
  const declaration = file.components[component];
  if (!declaration) return file;
  const field = createUniqueName(
    clientConfig.itemEditor.newFieldName,
    Object.keys(declaration.fields),
    "",
  );
  const type: FieldType = "number";
  return {
    ...setComponentFields(file, component, {
      ...declaration.fields,
      [field]: { type, description: "" },
    }),
    definitions: mapDefinitionsWithComponent(file, component, (values) => ({
      ...values,
      [field]: buildDefaultFieldValue(type),
    })),
  };
}

/** Keeps the bounds that still name a number field of the component. */
function clearBoundsNaming(
  fields: ComponentDeclaration["fields"],
  names: ReadonlySet<string>,
): ComponentDeclaration["fields"] {
  const clearBound = (bound: FieldBound | undefined) =>
    typeof bound === "string" && names.has(bound) ? undefined : bound;
  return Object.fromEntries(
    Object.entries(fields).map(([name, field]) => [
      name,
      withOptions(field, { min: clearBound(field.min), max: clearBound(field.max) }),
    ]),
  );
}

function withOptions(field: FieldDeclaration, options: Partial<FieldDeclaration>) {
  const merged: Partial<FieldDeclaration> = { ...field, ...options };
  return Object.fromEntries(
    Object.entries(merged).filter(([, value]) => value !== undefined),
  ) as unknown as FieldDeclaration;
}

/** Changes a field's type, dropping options the type can't have; items get the new starting value. */
export function setComponentFieldType(
  file: ItemFile,
  component: string,
  field: string,
  type: FieldType,
): ItemFile {
  const declaration = file.components[component];
  const fieldDeclaration = declaration?.fields[field];
  if (!declaration || !fieldDeclaration) return file;
  const isNumber = type === "number";
  const keepsDefault =
    fieldDeclaration.default !== undefined && isValueOfType(fieldDeclaration.default, type);
  const changed = withOptions(fieldDeclaration, {
    type,
    default: keepsDefault ? fieldDeclaration.default : undefined,
    min: isNumber ? fieldDeclaration.min : undefined,
    max: isNumber ? fieldDeclaration.max : undefined,
    words: isNumber ? fieldDeclaration.words : undefined,
  });
  const fields = { ...declaration.fields, [field]: changed };
  const namesNoLongerNumber = isNumber ? new Set<string>() : new Set([field]);
  return {
    ...setComponentFields(file, component, clearBoundsNaming(fields, namesNoLongerNumber)),
    definitions: mapDefinitionsWithComponent(file, component, (values) => ({
      ...values,
      [field]: changed.default ?? buildDefaultFieldValue(type),
    })),
  };
}

/** Removes the field; items lose its value and a bound naming it is cleared. */
export function removeComponentField(file: ItemFile, component: string, field: string): ItemFile {
  const declaration = file.components[component];
  if (!declaration) return file;
  const fields = clearBoundsNaming(withoutKey(declaration.fields, field), new Set([field]));
  return {
    ...setComponentFields(file, component, fields),
    definitions: mapDefinitionsWithComponent(file, component, (values) =>
      withoutKey(values, field),
    ),
  };
}

function updateField(
  file: ItemFile,
  component: string,
  field: string,
  options: Partial<FieldDeclaration>,
): ItemFile {
  const declaration = file.components[component];
  const fieldDeclaration = declaration?.fields[field];
  if (!declaration || !fieldDeclaration) return file;
  return setComponentFields(file, component, {
    ...declaration.fields,
    [field]: withOptions(fieldDeclaration, options),
  });
}

export function setFieldDescription(
  file: ItemFile,
  component: string,
  field: string,
  description: string,
): ItemFile {
  return updateField(file, component, field, { description });
}

export function setFieldDefault(
  file: ItemFile,
  component: string,
  field: string,
  value: FieldValue | undefined,
): ItemFile {
  return updateField(file, component, field, { default: value });
}

/** A literal number or the name of a sibling number field; undefined clears it. */
export function setFieldBound(
  file: ItemFile,
  component: string,
  field: string,
  bound: "min" | "max",
  value: FieldBound | undefined,
): ItemFile {
  return updateField(file, component, field, { [bound]: value });
}

/** An empty list is stored as none. */
export function setFieldWords(
  file: ItemFile,
  component: string,
  field: string,
  words: FieldWord[] | undefined,
): ItemFile {
  return updateField(file, component, field, {
    words: words === undefined || words.length === 0 ? undefined : words,
  });
}

/** The other number fields of the same component, for the min and max pickers. */
export function listSiblingNumberFields(
  declaration: ComponentDeclaration,
  field: string,
): string[] {
  return Object.entries(declaration.fields)
    .filter(([name, sibling]) => name !== field && sibling.type === "number")
    .map(([name]) => name);
}

export function addFieldWord(words: readonly FieldWord[] | undefined): FieldWord[] {
  return [...(words ?? []), { text: clientConfig.itemEditor.newFieldWordText }];
}

/** Changes one entry; `below: undefined` makes it match always. */
export function changeFieldWord(
  words: readonly FieldWord[],
  index: number,
  change: Partial<FieldWord>,
): FieldWord[] {
  const word = words[index];
  if (!word) return [...words];
  const changed = { ...word, ...change };
  return replaceAt(words, index, {
    text: changed.text,
    ...(changed.below === undefined ? {} : { below: changed.below }),
  });
}

export function removeFieldWord(words: readonly FieldWord[], index: number): FieldWord[] {
  return removeAt(words, index);
}

export function moveFieldWord(
  words: readonly FieldWord[],
  index: number,
  direction: -1 | 1,
): FieldWord[] {
  return moveWithin(words, index, index + direction);
}
