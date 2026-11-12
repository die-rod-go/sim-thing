import {
  parseComponentPath,
  type FieldDeclaration,
  type ItemFile,
  type Step,
} from "@village/shared";
import { mapFileMatchers, mapFileSteps } from "./file-walk";

function isItemField(file: ItemFile, component: string, field: string): boolean {
  return file.components[component]?.fields[field]?.type === "item";
}

function isItemFieldPath(file: ItemFile, path: string): boolean {
  const parsed = parseComponentPath(path);
  return parsed !== null && isItemField(file, parsed.component, parsed.field);
}

function mapDefinitionId(value: string, oldId: string, newId: string): string {
  return value === oldId ? newId : value;
}

function mapItemFieldValue<Value>(value: Value, oldId: string, newId: string): Value {
  return value === oldId ? (newId as Value) : value;
}

function mapFieldValues<Value>(
  fields: Record<string, Value>,
  isItemKey: (key: string) => boolean,
  oldId: string,
  newId: string,
): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      isItemKey(key) ? mapItemFieldValue(value, oldId, newId) : value,
    ]),
  );
}

function mapStepDefinitions(file: ItemFile, step: Step, oldId: string, newId: string): Step {
  if (step.step === "create") {
    return {
      ...step,
      item: mapItemFieldValue(step.item, oldId, newId),
      fields:
        step.fields &&
        mapFieldValues(step.fields, (path) => isItemFieldPath(file, path), oldId, newId),
    };
  }
  if (step.step === "transform")
    return { ...step, into: mapItemFieldValue(step.into, oldId, newId) };
  if (step.step === "set" && isItemFieldPath(file, step.field)) {
    return { ...step, to: mapItemFieldValue(step.to, oldId, newId) };
  }
  if (step.step === "add" && step.fields !== undefined) {
    const { component } = step;
    return {
      ...step,
      fields: mapFieldValues(step.fields, (key) => isItemField(file, component, key), oldId, newId),
    };
  }
  return step;
}

function mapItemDefault(field: FieldDeclaration, oldId: string, newId: string): FieldDeclaration {
  if (field.type !== "item") return field;
  return { ...field, default: mapItemFieldValue(field.default, oldId, newId) };
}

/** Renames a definition and everything that names it: matchers, steps, item fields, the body. */
export function renameDefinitionEverywhere(file: ItemFile, oldId: string, newId: string): ItemFile {
  const isTaken = file.definitions.some((definition) => definition.id === newId);
  if (newId === "" || oldId === newId || isTaken) return file;
  const withMatchers = mapFileMatchers(file, (term) =>
    "definition" in term ? { definition: mapDefinitionId(term.definition, oldId, newId) } : term,
  );
  const withSteps = mapFileSteps(withMatchers, (step) =>
    mapStepDefinitions(file, step, oldId, newId),
  );
  return {
    ...withSteps,
    world: {
      ...withSteps.world,
      agentBody: mapDefinitionId(withSteps.world.agentBody, oldId, newId),
    },
    components: Object.fromEntries(
      Object.entries(withSteps.components).map(([name, declaration]) => [
        name,
        {
          ...declaration,
          fields: Object.fromEntries(
            Object.entries(declaration.fields).map(([fieldName, field]) => [
              fieldName,
              mapItemDefault(field, oldId, newId),
            ]),
          ),
        },
      ]),
    ),
    definitions: withSteps.definitions.map((definition) => ({
      ...definition,
      id: mapDefinitionId(definition.id, oldId, newId),
      components: Object.fromEntries(
        Object.entries(definition.components).map(([name, values]) => [
          name,
          mapFieldValues(values, (key) => isItemField(file, name, key), oldId, newId),
        ]),
      ),
    })),
  };
}
