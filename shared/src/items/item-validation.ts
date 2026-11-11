import { damagesSelf, checkEffect, type EffectCheckContext } from "./effect-validation";
import {
  ENGINE_COMPONENT_FIELDS,
  isEngineComponent,
  type FieldType,
  type FieldValue,
  type ItemDefinition,
  type ItemFile,
} from "./item-file";
import {
  ProblemList,
  type ItemProblem,
  type ItemReference,
  type ItemValidationOptions,
} from "./item-problems";
import { checkCurrencySupply } from "./supply-validation";
import { checkVerbs } from "./verb-validation";

/** The component every carriable needs, so anything held can be thrown. */
export const CARRIABLE_WEIGHT_COMPONENT = "weight";

function isFieldValueOfType(value: FieldValue, type: FieldType): boolean {
  if (type === "number") return typeof value === "number";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "text") return typeof value === "string";
  return typeof value === "object" && value.min <= value.max;
}

function checkComponentDeclarations(file: ItemFile, problems: ProblemList) {
  for (const [name, declaration] of Object.entries(file.components)) {
    if (!isEngineComponent(name)) continue;
    const engineFields: Record<string, FieldType> = ENGINE_COMPONENT_FIELDS[name];
    const declared = Object.entries(declaration.fields).map(
      ([field, { type }]) => `${field}:${type}`,
    );
    const expected = Object.entries(engineFields).map(([field, type]) => `${field}:${type}`);
    if (declared.sort().join(",") !== expected.sort().join(",")) {
      problems.error(
        `components.${name}`,
        `The engine reads ${name}; its fields must be exactly: ${expected.join(", ") || "none"}.`,
      );
    }
  }
}

function checkComponentValues(
  definition: ItemDefinition,
  path: string,
  file: ItemFile,
  problems: ProblemList,
) {
  for (const [componentName, values] of Object.entries(definition.components)) {
    const declaration = file.components[componentName];
    const componentPath = `${path}.components.${componentName}`;
    if (!declaration) {
      problems.error(componentPath, `Unknown component "${componentName}".`);
      continue;
    }
    for (const [fieldName, field] of Object.entries(declaration.fields)) {
      const value = values[fieldName];
      if (value === undefined) problems.error(componentPath, `Missing field "${fieldName}".`);
      else if (!isFieldValueOfType(value, field.type)) {
        problems.error(`${componentPath}.${fieldName}`, `Must be a ${field.type}.`);
      }
    }
    for (const fieldName of Object.keys(values)) {
      if (!Object.hasOwn(declaration.fields, fieldName)) {
        problems.error(componentPath, `${componentName} has no field "${fieldName}".`);
      }
    }
  }
}

function checkDefinitions(context: EffectCheckContext) {
  const { file, problems } = context;
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  file.definitions.forEach((definition, index) => {
    const path = `definitions.${index} (${definition.id})`;
    if (seenIds.has(definition.id)) problems.error(path, `Id "${definition.id}" is already used.`);
    seenIds.add(definition.id);
    const nameKey = definition.name.toLowerCase();
    if (seenNames.has(nameKey)) problems.error(path, `Name "${definition.name}" is already used.`);
    seenNames.add(nameKey);
    for (const property of definition.properties) {
      if (!Object.hasOwn(file.properties, property)) {
        problems.error(`${path}.properties`, `Unknown property "${property}".`);
      }
    }
    checkComponentValues(definition, path, file, problems);
    if (definition.glyphWhenClosed && !Object.hasOwn(definition.components, "openable")) {
      problems.warning(
        `${path}.glyphWhenClosed`,
        "Only something with the openable component is ever closed, so this glyph is never drawn.",
      );
    }
    if (
      definition.form === "carriable" &&
      !Object.hasOwn(definition.components, CARRIABLE_WEIGHT_COMPONENT)
    ) {
      problems.error(path, `Every carriable needs a ${CARRIABLE_WEIGHT_COMPONENT} component.`);
    }
    (definition.onBroken ?? []).forEach((effect, effectIndex) =>
      checkEffect(effect, "on_broken", `${path}.onBroken.${effectIndex}`, context),
    );
  });
}

function checkConditions(context: EffectCheckContext) {
  const { file, problems } = context;
  const seen = new Set<string>();
  file.conditions.forEach((condition, index) => {
    const path = `conditions.${index} (${condition.name})`;
    if (seen.has(condition.name)) problems.error(path, `"${condition.name}" is defined twice.`);
    seen.add(condition.name);
    const effects = [...condition.everyMinute, ...condition.onEnd];
    condition.everyMinute.forEach((effect, effectIndex) =>
      checkEffect(effect, "condition", `${path}.everyMinute.${effectIndex}`, context),
    );
    condition.onEnd.forEach((effect, effectIndex) =>
      checkEffect(effect, "condition", `${path}.onEnd.${effectIndex}`, context),
    );
    if (effects.some(damagesSelf) && condition.phrases.killed === undefined) {
      problems.error(path, "A condition that does damage needs a `killed` phrase.");
    }
  });
}

function listPropertiesInUse(file: ItemFile): Set<string> {
  return new Set([
    ...file.person.properties,
    ...file.definitions.flatMap((definition) => definition.properties),
  ]);
}

function checkReactions(context: EffectCheckContext) {
  const { file, problems, conditionNames } = context;
  const propertiesInUse = listPropertiesInUse(file);
  file.reactions.forEach((reaction, index) => {
    const path = `reactions.${index} (${reaction.stimulus})`;
    if (reaction.property !== undefined) {
      if (!Object.hasOwn(file.properties, reaction.property)) {
        problems.error(path, `Unknown property "${reaction.property}".`);
      } else if (!propertiesInUse.has(reaction.property)) {
        problems.warning(path, `Nothing has the property "${reaction.property}".`);
      }
    }
    if (reaction.condition !== undefined && !conditionNames.has(reaction.condition)) {
      problems.error(path, `Unknown condition "${reaction.condition}".`);
    }
    if (
      reaction.unless !== undefined &&
      !conditionNames.has(reaction.unless) &&
      !Object.hasOwn(file.properties, reaction.unless)
    ) {
      problems.error(path, `"unless" names no known property or condition: "${reaction.unless}".`);
    }
    reaction.effects.forEach((effect, effectIndex) =>
      checkEffect(effect, "reaction", `${path}.effects.${effectIndex}`, context),
    );
    if (reaction.effects.some(damagesSelf) && reaction.phrases.killed === undefined) {
      problems.error(path, "A reaction that damages what it reached needs a `killed` phrase.");
    }
  });
}

function checkPerson(file: ItemFile, problems: ProblemList) {
  for (const property of file.person.properties) {
    if (!Object.hasOwn(file.properties, property)) {
      problems.error("person.properties", `Unknown property "${property}".`);
    }
  }
}

function checkReferences(
  references: readonly ItemReference[],
  definitionsById: ReadonlyMap<string, ItemDefinition>,
  problems: ProblemList,
) {
  for (const reference of references) {
    const definition = definitionsById.get(reference.definitionId);
    if (!definition) {
      problems.error(
        "definitions",
        `${reference.usedBy} uses "${reference.definitionId}", which has no definition.`,
      );
    } else if (reference.requiredForm !== null && definition.form !== reference.requiredForm) {
      problems.error(
        `definitions (${definition.id})`,
        `${reference.usedBy} needs a ${reference.requiredForm} item, but ${definition.id} is ${definition.form}.`,
      );
    }
  }
}

/**
 * Everything wrong with an item file beyond its shape: unknown names, verb rules and the numbers
 * they read, overlapping verbs, missing phrases, the closed coin supply, and definitions the map
 * or seeds use. Pure, so the item editor can run it live.
 */
export function findItemFileProblems(
  file: ItemFile,
  options: ItemValidationOptions = {},
): ItemProblem[] {
  const problems = new ProblemList();
  const definitionsById = new Map(
    file.definitions.map((definition) => [definition.id, definition]),
  );
  const context: EffectCheckContext = {
    file,
    definitionIds: new Set(definitionsById.keys()),
    conditionNames: new Set(file.conditions.map((condition) => condition.name)),
    problems,
  };
  checkComponentDeclarations(file, problems);
  checkPerson(file, problems);
  checkDefinitions(context);
  checkVerbs(definitionsById, context);
  checkConditions(context);
  checkReactions(context);
  checkReferences(options.references ?? [], definitionsById, problems);
  if (options.currencyDefinitionId !== undefined) {
    checkCurrencySupply(file, options.currencyDefinitionId, problems);
  }
  return problems.problems;
}
