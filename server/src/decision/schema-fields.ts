import { z } from "zod";
import type { JsonSchema } from "../llm/types";
import { normalizeDisplayName } from "./resolve-name";

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

/*
 * Enums and objects are made nullable with `anyOf` rather than a `type` array: some providers
 * (Anthropic via OpenRouter) reject enum values under a union type.
 */
export function nullableJsonEnum(values: readonly string[]): JsonSchema {
  return values.length > 0
    ? { anyOf: [{ type: "string", enum: [...values] }, { type: "null" }] }
    : { type: "null" };
}

export function nullableJsonObject(schema: JsonSchema): JsonSchema {
  return { anyOf: [schema, { type: "null" }] };
}

function isJsonRecord(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The string enum values of a schema, whether given directly or inside a nullable `anyOf`. */
export function readJsonEnumValues(schema: unknown): string[] {
  if (!isJsonRecord(schema)) return [];
  if (Array.isArray(schema.enum)) {
    return schema.enum.filter((value): value is string => typeof value === "string");
  }
  if (!Array.isArray(schema.anyOf)) return [];
  return schema.anyOf.flatMap((option: unknown) => readJsonEnumValues(option));
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
  return aliasedNameEnum(names, new Map(), fieldLabel);
}

/** Like `displayNameEnum`, also accepting other spellings that parse to a name ("coins" → "coin"). */
export function aliasedNameEnum(
  names: readonly string[],
  aliases: ReadonlyMap<string, string>,
  fieldLabel: string,
) {
  const canonicalByNormalized = new Map([
    ...[...aliases].map(([alias, name]) => [normalizeDisplayName(alias), name] as const),
    ...names.map((name) => [normalizeDisplayName(name), name] as const),
  ]);
  return z
    .string()
    .refine((input) => canonicalByNormalized.has(normalizeDisplayName(input)), {
      message: `${fieldLabel} must be one of: ${names.join(", ")}`,
    })
    .transform((input) => canonicalByNormalized.get(normalizeDisplayName(input)) ?? input);
}
