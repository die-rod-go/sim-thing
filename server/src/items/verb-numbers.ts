import {
  parseValuePath,
  type DefinitionValue,
  type NumberRange,
  type NumberValue,
  type RangeValue,
  type ResolvedComponents,
  type TextValue,
} from "@village/shared";

/*
 * A value is a literal or read from the components of the thing a verb is used with (`item.`) or
 * of the thing a rule fired on (`self.`). Validation makes sure a value only reads components its
 * matcher guarantees, so a missing field here is a bug.
 */

export interface ValueSources {
  item: ResolvedComponents | null;
  self: ResolvedComponents | null;
}

function readField(path: string, sources: ValueSources): unknown {
  const parsed = parseValuePath(path);
  if (parsed === null) throw new Error(`Bad component path "${path}"`);
  const components = sources[parsed.who];
  if (components === null) throw new Error(`"${path}" read where there is no ${parsed.who}`);
  const value = components[parsed.component]?.[parsed.field];
  if (value === undefined) throw new Error(`The ${parsed.who} has no ${path}`);
  return value;
}

function readNumberField(path: string, sources: ValueSources): number {
  const value = readField(path, sources);
  if (typeof value !== "number") throw new Error(`"${path}" is not a number`);
  return value;
}

export function resolveNumber(value: NumberValue, sources: ValueSources): number {
  if (typeof value === "number") return value;
  if ("from" in value) return readNumberField(value.from, sources);
  return value.value * readNumberField(value.times, sources);
}

export function resolveRange(value: RangeValue, sources: ValueSources): NumberRange {
  if ("from" in value) {
    const range = readField(value.from, sources);
    if (typeof range !== "object" || range === null || !("min" in range) || !("max" in range)) {
      throw new Error(`"${value.from}" is not a range`);
    }
    return { min: Number(range.min), max: Number(range.max) };
  }
  const factor = value.times === undefined ? 1 : readNumberField(value.times, sources);
  return { min: value.min * factor, max: value.max * factor };
}

function resolveTextRead(from: string, sources: ValueSources): string {
  const text = readField(from, sources);
  if (typeof text !== "string") throw new Error(`"${from}" is not text`);
  return text;
}

export function resolveText(value: TextValue, sources: ValueSources): string {
  return typeof value === "string" ? value : resolveTextRead(value.from, sources);
}

export function resolveDefinitionId(value: DefinitionValue, sources: ValueSources): string {
  return typeof value === "string" ? value : resolveTextRead(value.from, sources);
}
