import type { NumberValue } from "@village/shared";

export type ValueMode = "literal" | "from" | "roll";

export const VALUE_MODE_LABELS: Record<ValueMode, string> = {
  literal: "number",
  from: "from a component",
  roll: "random between",
};

export function findNumberValueMode(value: NumberValue): ValueMode {
  if (typeof value === "number") return "literal";
  return "from" in value ? "from" : "roll";
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
  const times = typeof value === "object" ? value.times : undefined;
  const withTimes = times === undefined ? {} : { times };
  if (mode === "literal") return readLiteral(value);
  if (mode === "from") return { from: path, ...withTimes };
  const literal = readLiteral(value);
  return { min: literal, max: literal, ...withTimes };
}
