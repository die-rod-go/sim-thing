import { z } from "zod";
import type { JsonSchema } from "../llm/types";
import { normalizeDisplayName } from "./resolveName";

/*
 * Strict structured output requires every property to be listed as required, so optional fields are
 * sent as nullable. The zod side drops nulls and blank strings before validating, so callers only
 * ever see `undefined` for a field the model left out.
 */

export function nullableJsonString(description?: string): JsonSchema {
  return description ? { type: ["string", "null"], description } : { type: ["string", "null"] };
}

export function nullableJsonInteger(): JsonSchema {
  return { type: ["integer", "null"] };
}

export function nullableJsonEnum(values: readonly string[]): JsonSchema {
  return values.length > 0
    ? { type: ["string", "null"], enum: [...values, null] }
    : { type: "null" };
}

export function strictJsonObject(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function isBlank(value: unknown): boolean {
  return value === null || (typeof value === "string" && value.trim() === "");
}

/** Removes null and blank-string fields from a reply object so optional zod fields see undefined. */
export function dropEmptyFields(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => !isBlank(fieldValue)));
}

/** A lowercase, trimmed string enum, so "Shout " still validates as "shout". */
export function looseEnum<Value extends string>(values: readonly [Value, ...Value[]]) {
  return z.preprocess(
    (input) => (typeof input === "string" ? input.trim().toLowerCase() : input),
    z.enum(values),
  );
}

/** A name that must match one of `names` case-insensitively; parses to the canonical spelling. */
export function displayNameEnum(names: readonly string[], fieldLabel: string) {
  const canonicalByNormalized = new Map(names.map((name) => [normalizeDisplayName(name), name]));
  return z
    .string()
    .refine((input) => canonicalByNormalized.has(normalizeDisplayName(input)), {
      message: `${fieldLabel} must be one of: ${names.join(", ")}`,
    })
    .transform((input) => canonicalByNormalized.get(normalizeDisplayName(input)) ?? input);
}
