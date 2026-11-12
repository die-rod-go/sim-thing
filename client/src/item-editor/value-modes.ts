import type { NumberValue } from "@village/shared";

export type ValueMode = "literal" | "roll" | "from";

export const VALUE_MODE_LABELS: Record<ValueMode, string> = {
  literal: "number",
  roll: "random between",
  from: "from a field",
};

export const SIMPLE_VALUE_MODE_LABELS: Record<"literal" | "from", string> = {
  literal: "value",
  from: "from a field",
};

export function findNumberValueMode(value: NumberValue): ValueMode {
  if (typeof value === "number") return "literal";
  return "from" in value ? "from" : "roll";
}

/** The factor a roll or read is multiplied by: a number, a value path, or none. */
export function findNumberValueTimes(value: NumberValue): number | string | undefined {
  return typeof value === "object" ? value.times : undefined;
}

function readLiteral(value: NumberValue): number {
  if (typeof value === "number") return value;
  return "min" in value ? value.min : 0;
}

/** Switches a number to another mode, keeping what carries over and reading `path` where it needs one. */
export function switchNumberValueMode(
  value: NumberValue,
  mode: ValueMode,
  path: string,
): NumberValue {
  const times = findNumberValueTimes(value);
  const withTimes = times === undefined ? {} : { times };
  if (mode === "literal") return readLiteral(value);
  if (mode === "from") return { from: path, ...withTimes };
  const literal = readLiteral(value);
  return { min: literal, max: literal, ...withTimes };
}

/** Sets or clears the factor; a literal has none and comes back unchanged. */
export function setNumberValueTimes(
  value: NumberValue,
  times: number | string | undefined,
): NumberValue {
  if (typeof value === "number") return value;
  const { times: previous, ...rest } = value;
  void previous;
  return times === undefined ? rest : { ...rest, times };
}

export function findSimpleValueMode(value: unknown): "literal" | "from" {
  return typeof value === "object" && value !== null && "from" in value ? "from" : "literal";
}

/** Text, definition and boolean values: a literal, or a read of `path`. */
export function switchSimpleValueMode<Literal>(
  mode: "literal" | "from",
  path: string,
  literal: Literal,
): Literal | { from: string } {
  return mode === "from" ? { from: path } : literal;
}
