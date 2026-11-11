import { z } from "zod";
import { identifierSchema } from "./component-schema";

/*
 * Values in step settings: a literal, a read of somebody's field (`{ "from": "item.component.field" }`),
 * a roll (`{ "min": 0.05, "max": 0.12 }`), and for numbers a factor (`"times"`).
 */

/** Who a run knows by role. Anything else in a value path is an `as` name. */
export const RUN_ROLES = ["user", "item", "target", "self"] as const;
export type RunRole = (typeof RUN_ROLES)[number];

/** What the decision supplied, read as `choice.<name>`. */
export const CHOICE_NAMES = ["amount", "minutes", "text"] as const;
export type ChoiceName = (typeof CHOICE_NAMES)[number];

/** Names an `as` may not take: the roles, `choice` and `nearby`. */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([...RUN_ROLES, "choice", "nearby"]);

/** An `as` name: lowercase, camelCase allowed (`bullet`, `firstNote`). */
export const AS_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/;
export const asNameSchema = z
  .string()
  .regex(AS_NAME_PATTERN, "Use a short lowercase name.")
  .refine((name) => !RESERVED_NAMES.has(name), { message: "That name is taken by a role." });

/** Whose thing a step works on or a value reads: a role or an `as` name. */
export const thingNameSchema = z.string().regex(AS_NAME_PATTERN);

/**
 * `who.component.field` (whose field), `who.name` (whose display name) or `choice.amount`.
 * `who` is a role or an `as` name.
 */
export const VALUE_PATH_PATTERN =
  /^([a-z][A-Za-z0-9]*)\.([a-z][A-Za-z0-9_]*)(?:\.([a-z][A-Za-z0-9]*))?$/;
const COMPONENT_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export type ValuePath =
  | { kind: "field"; who: string; component: string; field: string }
  | { kind: "name"; who: string }
  | { kind: "choice"; choice: ChoiceName };

function isChoiceName(name: string): name is ChoiceName {
  return (CHOICE_NAMES as readonly string[]).includes(name);
}

/** Null for text that isn't a value path. */
export function parseValuePath(path: string): ValuePath | null {
  const match = VALUE_PATH_PATTERN.exec(path);
  const who = match?.[1];
  const second = match?.[2];
  if (who === undefined || second === undefined) return null;
  const third = match?.[3];
  if (who === "choice") {
    return third === undefined && isChoiceName(second) ? { kind: "choice", choice: second } : null;
  }
  if (third === undefined) return second === "name" ? { kind: "name", who } : null;
  if (!COMPONENT_NAME_PATTERN.test(second)) return null;
  return { kind: "field", who, component: second, field: third };
}

export const valuePathSchema = z.string().refine((path) => parseValuePath(path) !== null, {
  message: 'A read looks like "item.component.field", "user.name" or "choice.amount".',
});

/** A literal factor or a number field to multiply by. */
const timesSchema = z.union([z.number(), valuePathSchema]);

const readSchema = z.strictObject({ from: valuePathSchema, times: timesSchema.optional() });
const rollSchema = z.strictObject({
  min: z.number(),
  max: z.number(),
  times: timesSchema.optional(),
});

/** A number literal, a field (a `range` field is rolled), or a roll; reads and rolls may be multiplied. */
export const numberValueSchema = z.union([z.number(), readSchema, rollSchema]);
export type NumberValue = z.infer<typeof numberValueSchema>;

const plainReadSchema = z.strictObject({ from: valuePathSchema });

export const textValueSchema = z.union([z.string().min(1), plainReadSchema]);
export type TextValue = z.infer<typeof textValueSchema>;

/** A definition id, or an `item` field naming one. */
export const definitionValueSchema = z.union([identifierSchema, plainReadSchema]);
export type DefinitionValue = z.infer<typeof definitionValueSchema>;

/** Any field value: a number, text or boolean literal, or a read. Its type is checked against the field. */
export const fieldValueInputSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  readSchema,
  rollSchema,
]);
export type FieldValueInput = z.infer<typeof fieldValueInputSchema>;
