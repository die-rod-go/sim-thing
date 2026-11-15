import {
  parseComponentPath,
  parseValuePath,
  type ComponentPath,
  type FieldBound,
  type ItemFile,
  type Matcher,
  type Step,
} from "@village/shared";
import { mapFileMatchers, mapFileSteps, mapFileValuePaths } from "./file-walk";
import { renameKey } from "./list-edits";

/* Renames that reach everything in the file naming the old name. */

interface ReferenceChange {
  mapComponent: (name: string) => string;
  mapPath: (path: ComponentPath) => ComponentPath;
}

function mapComponentPathText(text: string, change: ReferenceChange): string {
  const path = parseComponentPath(text);
  if (path === null) return text;
  const mapped = change.mapPath(path);
  return `${mapped.component}.${mapped.field}`;
}

function mapValuePathText(text: string, change: ReferenceChange): string {
  const path = parseValuePath(text);
  if (path?.kind !== "field") return text;
  const mapped = change.mapPath(path);
  return `${path.who}.${mapped.component}.${mapped.field}`;
}

function mapMatcherTerm(term: Matcher, change: ReferenceChange): Matcher {
  if ("has" in term) return { has: change.mapComponent(term.has) };
  if ("field" in term) return { ...term, field: mapComponentPathText(term.field, change) };
  return term;
}

function mapStepPaths(step: Step, change: ReferenceChange): Step {
  let mapped: Step = step;
  if ("component" in mapped)
    mapped = { ...mapped, component: change.mapComponent(mapped.component) };
  if ("field" in mapped) mapped = { ...mapped, field: mapComponentPathText(mapped.field, change) };
  if ("author" in mapped && mapped.author !== undefined) {
    mapped = { ...mapped, author: mapComponentPathText(mapped.author, change) };
  }
  if (mapped.step === "create" && mapped.fields !== undefined) {
    mapped = {
      ...mapped,
      fields: Object.fromEntries(
        Object.entries(mapped.fields).map(([path, value]) => [
          mapComponentPathText(path, change),
          value,
        ]),
      ),
    };
  }
  return mapped;
}

function mapOptionalWorldPath(
  file: ItemFile,
  setting: "creatureStrength" | "creatureAgility",
  change: ReferenceChange,
): Partial<ItemFile["world"]> {
  const text = file.world[setting];
  return text === undefined ? {} : { [setting]: mapComponentPathText(text, change) };
}

function mapReferences(file: ItemFile, change: ReferenceChange): ItemFile {
  const withMatchers = mapFileMatchers(file, (term) => mapMatcherTerm(term, change));
  const withSteps = mapFileSteps(withMatchers, (step) => mapStepPaths(step, change));
  const withReaches = mapFileValuePaths(withSteps, (path) => mapValuePathText(path, change));
  return {
    ...withReaches,
    world: {
      ...withReaches.world,
      agentHealth: mapComponentPathText(withReaches.world.agentHealth, change),
      ...mapOptionalWorldPath(withReaches, "creatureStrength", change),
      ...mapOptionalWorldPath(withReaches, "creatureAgility", change),
    },
  };
}

export function renameComponentEverywhere(
  file: ItemFile,
  oldName: string,
  newName: string,
): ItemFile {
  if (newName === "" || oldName === newName || Object.hasOwn(file.components, newName)) {
    return file;
  }
  const mapComponent = (name: string) => (name === oldName ? newName : name);
  const renamed = mapReferences(file, {
    mapComponent,
    mapPath: (path) => ({ ...path, component: mapComponent(path.component) }),
  });
  return {
    ...renamed,
    components: renameKey(renamed.components, oldName, newName),
    definitions: renamed.definitions.map((definition) => ({
      ...definition,
      components: renameKey(definition.components, oldName, newName),
    })),
  };
}

function renameBound(bound: FieldBound | undefined, oldField: string, newField: string) {
  return bound === oldField ? newField : bound;
}

function renameAddedFields(step: Step, component: string, oldField: string, newField: string) {
  if (step.step !== "add" || step.component !== component || step.fields === undefined) {
    return step;
  }
  return { ...step, fields: renameKey(step.fields, oldField, newField) };
}

export function renameFieldEverywhere(
  file: ItemFile,
  component: string,
  oldField: string,
  newField: string,
): ItemFile {
  const declaration = file.components[component];
  if (
    declaration === undefined ||
    newField === "" ||
    oldField === newField ||
    Object.hasOwn(declaration.fields, newField)
  ) {
    return file;
  }
  const renamed = mapReferences(file, {
    mapComponent: (name) => name,
    mapPath: (path) =>
      path.component === component && path.field === oldField ? { ...path, field: newField } : path,
  });
  const fields = Object.fromEntries(
    Object.entries(declaration.fields).map(([name, field]) => [
      name === oldField ? newField : name,
      {
        ...field,
        min: renameBound(field.min, oldField, newField),
        max: renameBound(field.max, oldField, newField),
      },
    ]),
  );
  const withSteps = mapFileSteps(renamed, (step) =>
    renameAddedFields(step, component, oldField, newField),
  );
  return {
    ...withSteps,
    components: { ...withSteps.components, [component]: { ...declaration, fields } },
    definitions: withSteps.definitions.map((definition) => {
      const values = definition.components[component];
      if (values === undefined) return definition;
      return {
        ...definition,
        components: {
          ...definition.components,
          [component]: renameKey(values, oldField, newField),
        },
      };
    }),
  };
}

export { renameDefinitionEverywhere } from "./rename-definition";
