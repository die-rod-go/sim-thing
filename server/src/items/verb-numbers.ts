import {
  COMPONENT_PATH_PATTERN,
  readComponentField,
  type ItemDefinition,
  type NumberRange,
  type NumberValue,
  type RangeValue,
  type TextValue,
} from "@village/shared";

/*
 * A verb's numbers are literals or read from components of the thing being used. Validation makes
 * sure a verb only reads components its rule guarantees, so a missing field here is a bug.
 */

function readField(path: string, definition: ItemDefinition | null): unknown {
  const match = COMPONENT_PATH_PATTERN.exec(path);
  if (!match?.[1] || !match[2]) throw new Error(`Bad component path "${path}"`);
  if (definition === null) throw new Error(`"${path}" read in a verb used with no item`);
  const value = readComponentField(definition, match[1], match[2]);
  if (value === undefined) throw new Error(`${definition.id} has no ${match[1]}.${match[2]}`);
  return value;
}

function readNumberField(path: string, definition: ItemDefinition | null): number {
  const value = readField(path, definition);
  if (typeof value !== "number") throw new Error(`"${path}" is not a number`);
  return value;
}

export function resolveNumber(value: NumberValue, definition: ItemDefinition | null): number {
  if (typeof value === "number") return value;
  if ("from" in value) return readNumberField(value.from, definition);
  return value.value * readNumberField(value.times, definition);
}

export function resolveRange(value: RangeValue, definition: ItemDefinition | null): NumberRange {
  if ("from" in value) {
    const range = readField(value.from, definition);
    if (typeof range !== "object" || range === null || !("min" in range) || !("max" in range)) {
      throw new Error(`"${value.from}" is not a range`);
    }
    return { min: Number(range.min), max: Number(range.max) };
  }
  const factor = value.times === undefined ? 1 : readNumberField(value.times, definition);
  return { min: value.min * factor, max: value.max * factor };
}

export function resolveText(value: TextValue, definition: ItemDefinition | null): string {
  if (typeof value === "string") return value;
  const text = readField(value.from, definition);
  if (typeof text !== "string") throw new Error(`"${value.from}" is not text`);
  return text;
}
