import type { ComponentDeclaration, FieldType, ItemDefinition, ItemFile } from "@village/shared";
import { clientConfig } from "../client-config";
import { buildDefaultFieldValue } from "./definition-edits";
import { createUniqueName, renameKey, withoutKey } from "./list-edits";

/* Component declarations. Renames carry over to the items that use them. */

function mapDefinitionsWithComponent(
  file: ItemFile,
  component: string,
  change: (values: ItemDefinition["components"][string]) => ItemDefinition["components"][string],
): ItemDefinition[] {
  return file.definitions.map((definition) => {
    const values = definition.components[component];
    if (values === undefined) return definition;
    return { ...definition, components: { ...definition.components, [component]: change(values) } };
  });
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

export function renameComponentDeclaration(
  file: ItemFile,
  oldName: string,
  newName: string,
): ItemFile {
  if (oldName === newName || Object.hasOwn(file.components, newName)) return file;
  return {
    ...file,
    components: renameKey(file.components, oldName, newName),
    definitions: file.definitions.map((definition) => ({
      ...definition,
      components: renameKey(definition.components, oldName, newName),
    })),
  };
}

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
    ...updateComponentDeclaration(file, component, {
      ...declaration,
      fields: { ...declaration.fields, [field]: { type, description: "" } },
    }),
    definitions: mapDefinitionsWithComponent(file, component, (values) => ({
      ...values,
      [field]: buildDefaultFieldValue(type),
    })),
  };
}

export function renameComponentField(
  file: ItemFile,
  component: string,
  oldField: string,
  newField: string,
): ItemFile {
  const declaration = file.components[component];
  if (!declaration || oldField === newField || Object.hasOwn(declaration.fields, newField)) {
    return file;
  }
  return {
    ...updateComponentDeclaration(file, component, {
      ...declaration,
      fields: renameKey(declaration.fields, oldField, newField),
    }),
    definitions: mapDefinitionsWithComponent(file, component, (values) =>
      renameKey(values, oldField, newField),
    ),
  };
}

/** Changes a field's type; items with the component get the new type's starting value. */
export function setComponentFieldType(
  file: ItemFile,
  component: string,
  field: string,
  type: FieldType,
): ItemFile {
  const declaration = file.components[component];
  const fieldDeclaration = declaration?.fields[field];
  if (!declaration || !fieldDeclaration) return file;
  return {
    ...updateComponentDeclaration(file, component, {
      ...declaration,
      fields: { ...declaration.fields, [field]: { ...fieldDeclaration, type } },
    }),
    definitions: mapDefinitionsWithComponent(file, component, (values) => ({
      ...values,
      [field]: buildDefaultFieldValue(type),
    })),
  };
}

export function removeComponentField(file: ItemFile, component: string, field: string): ItemFile {
  const declaration = file.components[component];
  if (!declaration) return file;
  return {
    ...updateComponentDeclaration(file, component, {
      ...declaration,
      fields: withoutKey(declaration.fields, field),
    }),
    definitions: mapDefinitionsWithComponent(file, component, (values) =>
      withoutKey(values, field),
    ),
  };
}
