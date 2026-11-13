import { parseComponentPath, type FieldDeclaration, type FieldType } from "./component-schema";
import type { ValidationContext } from "./item-problems";
import type { Step } from "./step-schema";
import type { DefinitionValue, FieldValueInput } from "./value-schema";

function findField(context: ValidationContext, componentPath: string): FieldDeclaration | null {
  const parsed = parseComponentPath(componentPath);
  if (parsed === null) return null;
  return context.file.components[parsed.component]?.fields[parsed.field] ?? null;
}

function checkNumberField(
  componentPath: string,
  stepName: string,
  path: string,
  context: ValidationContext,
) {
  const field = findField(context, componentPath);
  if (field === null) {
    context.problems.error(path, `Unknown field "${componentPath}".`);
  } else if (field.type !== "number") {
    context.problems.error(
      path,
      `\`${stepName}\` needs a number field, but ${componentPath} is a ${field.type}.`,
    );
  }
}

function checkTextField(
  componentPath: string,
  slot: string,
  path: string,
  context: ValidationContext,
) {
  const field = findField(context, componentPath);
  if (field === null) {
    context.problems.error(path, `Unknown field "${componentPath}".`);
  } else if (field.type !== "text") {
    context.problems.error(
      path,
      `\`${slot}\` needs a text field, but ${componentPath} is a ${field.type}.`,
    );
  }
}

function isRoll(value: FieldValueInput): boolean {
  return typeof value === "object" && "min" in value;
}

function isFittingLiteral(value: FieldValueInput, type: FieldType): boolean {
  if (typeof value === "number") return type === "number";
  if (typeof value === "boolean") return type === "boolean";
  if (typeof value === "string") return type === "text" || type === "item";
  if ("newId" in value) return type === "text";
  return isRoll(value) && (type === "number" || type === "range");
}

/**
 * A literal, roll or fresh id must fit the field's type (a fresh id only fits text), and an `item`
 * literal must name a definition.
 */
function checkFieldValue(
  value: FieldValueInput,
  componentPath: string,
  path: string,
  context: ValidationContext,
) {
  const field = findField(context, componentPath);
  if (field === null) return;
  const isRead = typeof value === "object" && "from" in value;
  if (isRead) return;
  if (!isFittingLiteral(value, field.type)) {
    context.problems.error(path, `The value must be a ${field.type} to fit ${componentPath}.`);
  } else if (
    field.type === "item" &&
    typeof value === "string" &&
    !context.definitionIds.has(value)
  ) {
    context.problems.error(path, `Unknown item "${value}".`);
  }
}

function checkDefinition(value: DefinitionValue, path: string, context: ValidationContext) {
  if (typeof value === "string" && !context.definitionIds.has(value)) {
    context.problems.error(path, `Unknown item "${value}".`);
  }
}

function checkComponentName(name: string, path: string, context: ValidationContext): boolean {
  const isKnown = Object.hasOwn(context.file.components, name);
  if (!isKnown) context.problems.error(path, `Unknown component "${name}".`);
  return isKnown;
}

function checkAddedFields(
  step: Extract<Step, { step: "add" }>,
  path: string,
  context: ValidationContext,
) {
  for (const [key, value] of Object.entries(step.fields ?? {})) {
    const componentPath = `${step.component}.${key}`;
    if (findField(context, componentPath) === null) {
      context.problems.error(`${path}.fields`, `Unknown field "${componentPath}".`);
    } else {
      checkFieldValue(value, componentPath, `${path}.fields.${key}`, context);
    }
  }
}

function checkCreatedFields(
  step: Extract<Step, { step: "create" }>,
  path: string,
  context: ValidationContext,
) {
  for (const [componentPath, value] of Object.entries(step.fields ?? {})) {
    if (findField(context, componentPath) === null) {
      context.problems.error(`${path}.fields`, `Unknown field "${componentPath}".`);
    } else {
      checkFieldValue(value, componentPath, `${path}.fields.${componentPath}`, context);
    }
  }
}

/** Unknown components, fields and definitions in a step, and values that don't fit their field. */
export function checkStepNames(step: Step, path: string, context: ValidationContext): void {
  switch (step.step) {
    case "change":
      checkNumberField(step.field, "change", path, context);
      break;
    case "damage":
      checkNumberField(step.field, "damage", path, context);
      break;
    case "set":
      if (findField(context, step.field) === null) {
        context.problems.error(path, `Unknown field "${step.field}".`);
      } else {
        checkFieldValue(step.to, step.field, `${path}.to`, context);
      }
      break;
    case "add":
      if (checkComponentName(step.component, path, context)) checkAddedFields(step, path, context);
      break;
    case "remove":
      checkComponentName(step.component, path, context);
      break;
    case "create":
      checkDefinition(step.item, `${path}.item`, context);
      checkCreatedFields(step, path, context);
      break;
    case "transform":
      checkDefinition(step.into, `${path}.into`, context);
      break;
    case "read":
      checkTextField(step.field, "field", path, context);
      if (step.author !== undefined) checkTextField(step.author, "author", path, context);
      break;
    default:
      break;
  }
}
