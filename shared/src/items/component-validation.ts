import type {
  ComponentDeclaration,
  FieldBound,
  FieldDeclaration,
  FieldType,
  FieldValue,
} from "./component-schema";
import type { ItemDefinition, ItemFile } from "./item-file";
import type { ProblemList } from "./item-problems";

function isFieldValueOfType(value: FieldValue, type: FieldType): boolean {
  if (type === "number") return typeof value === "number";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "text" || type === "item") return typeof value === "string";
  return typeof value === "object" && value.min <= value.max;
}

function checkBound(
  bound: FieldBound | undefined,
  boundName: "min" | "max",
  declaration: ComponentDeclaration,
  path: string,
  problems: ProblemList,
) {
  if (typeof bound !== "string") return;
  if (declaration.fields[bound]?.type !== "number") {
    problems.error(path, `\`${boundName}\` names "${bound}", which isn't a number field here.`);
  }
}

function checkFieldDeclaration(
  field: FieldDeclaration,
  declaration: ComponentDeclaration,
  path: string,
  problems: ProblemList,
) {
  const hasNumberOptions =
    field.min !== undefined || field.max !== undefined || field.words !== undefined;
  if (field.type !== "number" && hasNumberOptions) {
    problems.error(path, "`min`, `max` and `words` only work on number fields.");
  }
  checkBound(field.min, "min", declaration, path, problems);
  checkBound(field.max, "max", declaration, path, problems);
  if (field.default !== undefined && !isFieldValueOfType(field.default, field.type)) {
    problems.error(path, `The default must be a ${field.type}.`);
  }
}

export function checkComponentDeclarations(file: ItemFile, problems: ProblemList): void {
  for (const [name, declaration] of Object.entries(file.components)) {
    for (const [fieldName, field] of Object.entries(declaration.fields)) {
      checkFieldDeclaration(field, declaration, `components.${name}.${fieldName}`, problems);
    }
  }
}

function isOutsideLiteralBounds(field: FieldDeclaration, value: FieldValue): boolean {
  if (typeof value !== "number") return false;
  const isBelow = typeof field.min === "number" && value < field.min;
  const isAbove = typeof field.max === "number" && value > field.max;
  return isBelow || isAbove;
}

function checkFieldValue(
  field: FieldDeclaration,
  value: FieldValue,
  path: string,
  definitionIds: ReadonlySet<string>,
  problems: ProblemList,
) {
  if (!isFieldValueOfType(value, field.type)) {
    problems.error(path, `Must be a ${field.type}.`);
  } else if (isOutsideLiteralBounds(field, value)) {
    problems.error(path, "Is outside the field's `min` and `max`.");
  } else if (field.type === "item" && typeof value === "string" && !definitionIds.has(value)) {
    problems.error(path, `Unknown item "${value}".`);
  }
}

/** A definition's component values against their declarations: names, types, bounds, gaps. */
export function checkComponentValues(
  definition: ItemDefinition,
  path: string,
  file: ItemFile,
  definitionIds: ReadonlySet<string>,
  problems: ProblemList,
): void {
  for (const [componentName, values] of Object.entries(definition.components)) {
    const declaration = file.components[componentName];
    const componentPath = `${path}.components.${componentName}`;
    if (!declaration) {
      problems.error(componentPath, `Unknown component "${componentName}".`);
      continue;
    }
    for (const [fieldName, field] of Object.entries(declaration.fields)) {
      const value = values[fieldName];
      if (value !== undefined) {
        checkFieldValue(field, value, `${componentPath}.${fieldName}`, definitionIds, problems);
      } else if (field.default === undefined) {
        problems.error(componentPath, `Missing field "${fieldName}".`);
      }
    }
    for (const fieldName of Object.keys(values)) {
      if (!Object.hasOwn(declaration.fields, fieldName)) {
        problems.error(componentPath, `${componentName} has no field "${fieldName}".`);
      }
    }
  }
}
