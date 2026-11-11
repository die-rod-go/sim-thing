import {
  ITEM_VALUE_PATH_PATTERN,
  type NumberRange,
  type NumberValue,
  type RangeValue,
  type ResolvedComponents,
  type TextValue,
} from "@village/shared";

/*
 * A verb's numbers are literals or read from components of the thing being used. Validation makes
 * sure a verb only reads components its rule guarantees, so a missing field here is a bug.
 */

function readField(path: string, used: ResolvedComponents | null): unknown {
  const match = ITEM_VALUE_PATH_PATTERN.exec(path);
  if (!match?.[1] || !match[2]) throw new Error(`Bad component path "${path}"`);
  if (used === null) throw new Error(`"${path}" read in a verb used with no item`);
  const value = used[match[1]]?.[match[2]];
  if (value === undefined) throw new Error(`The thing used has no ${path}`);
  return value;
}

function readNumberField(path: string, used: ResolvedComponents | null): number {
  const value = readField(path, used);
  if (typeof value !== "number") throw new Error(`"${path}" is not a number`);
  return value;
}

export function resolveNumber(value: NumberValue, used: ResolvedComponents | null): number {
  if (typeof value === "number") return value;
  if ("from" in value) return readNumberField(value.from, used);
  return value.value * readNumberField(value.times, used);
}

export function resolveRange(value: RangeValue, used: ResolvedComponents | null): NumberRange {
  if ("from" in value) {
    const range = readField(value.from, used);
    if (typeof range !== "object" || range === null || !("min" in range) || !("max" in range)) {
      throw new Error(`"${value.from}" is not a range`);
    }
    return { min: Number(range.min), max: Number(range.max) };
  }
  const factor = value.times === undefined ? 1 : readNumberField(value.times, used);
  return { min: value.min * factor, max: value.max * factor };
}

export function resolveText(value: TextValue, used: ResolvedComponents | null): string {
  if (typeof value === "string") return value;
  const text = readField(value.from, used);
  if (typeof text !== "string") throw new Error(`"${value.from}" is not text`);
  return text;
}
