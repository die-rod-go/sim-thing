import type { NumberValue, RangeValue, TextValue } from "@village/shared";

/** A literal, read from a component field, or a literal multiplied by a component field. */
export type ValueMode = "literal" | "from" | "times";

export const VALUE_MODE_LABELS: Record<ValueMode, string> = {
  literal: "number",
  from: "from a component",
  times: "times a component",
};

export function findNumberValueMode(value: NumberValue): ValueMode {
  if (typeof value === "number") return "literal";
  return "from" in value ? "from" : "times";
}

function readLiteral(value: NumberValue): number {
  if (typeof value === "number") return value;
  return "value" in value ? value.value : 0;
}

/** Switches a number to another mode, keeping its literal and reading `path` where it needs one. */
export function switchNumberValueMode(
  value: NumberValue,
  mode: ValueMode,
  path: string,
): NumberValue {
  if (mode === "literal") return readLiteral(value);
  if (mode === "from") return { from: path };
  return { value: readLiteral(value), times: path };
}

export function findRangeValueMode(value: RangeValue): ValueMode {
  if ("from" in value) return "from";
  return value.times === undefined ? "literal" : "times";
}

/** Switches a range to another mode; `rangePath` names a range field, `numberPath` a number. */
export function switchRangeValueMode(
  value: RangeValue,
  mode: ValueMode,
  paths: { rangePath: string; numberPath: string },
): RangeValue {
  const literal = "from" in value ? { min: 0, max: 0 } : { min: value.min, max: value.max };
  if (mode === "literal") return literal;
  if (mode === "from") return { from: paths.rangePath };
  return { ...literal, times: paths.numberPath };
}

export function findTextValueMode(value: TextValue): ValueMode {
  return typeof value === "string" ? "literal" : "from";
}

export function switchTextValueMode(value: TextValue, mode: ValueMode, path: string): TextValue {
  if (mode !== "literal") return { from: path };
  return typeof value === "string" ? value : "";
}
