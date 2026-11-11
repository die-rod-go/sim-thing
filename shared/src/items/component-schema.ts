import { z } from "zod";

/** Definition ids and component names: snake_case. */
export const ITEM_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
/** Component field names: camelCase. */
export const FIELD_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/;
/** `<component>.<field>`: a field of a component, relative to one thing. */
export const COMPONENT_PATH_PATTERN = /^([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.([a-z][A-Za-z0-9]*)$/;

export const identifierSchema = z
  .string()
  .regex(ITEM_IDENTIFIER_PATTERN, "Use snake_case: lowercase letters, digits and underscores.");

export const componentPathSchema = z
  .string()
  .regex(COMPONENT_PATH_PATTERN, 'A component path looks like "component.field".');

export interface ComponentPath {
  component: string;
  field: string;
}

/** Null for text that isn't `<component>.<field>`. */
export function parseComponentPath(path: string): ComponentPath | null {
  const match = COMPONENT_PATH_PATTERN.exec(path);
  if (!match?.[1] || !match[2]) return null;
  return { component: match[1], field: match[2] };
}

/** `item` is a definition id. */
export const FIELD_TYPES = ["number", "range", "boolean", "text", "item"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const rangeSchema = z.strictObject({ min: z.number(), max: z.number() });
export type NumberRange = z.infer<typeof rangeSchema>;

export const fieldValueSchema = z.union([z.number(), rangeSchema, z.boolean(), z.string()]);
export type FieldValue = z.infer<typeof fieldValueSchema>;

/** A literal, or the name of another number field of the same component. */
const fieldBoundSchema = z.union([z.number(), z.string().regex(FIELD_NAME_PATTERN)]);
export type FieldBound = z.infer<typeof fieldBoundSchema>;

/** How a number reads in prompts while it is under `below`; without `below` it always matches. */
const fieldWordSchema = z.strictObject({ below: z.number().optional(), text: z.string().min(1) });
export type FieldWord = z.infer<typeof fieldWordSchema>;

const fieldDeclarationSchema = z.strictObject({
  type: z.enum(FIELD_TYPES),
  description: z.string().default(""),
  /** The value when a definition gives none; without it every definition must give one. */
  default: fieldValueSchema.optional(),
  /** Numbers only: every write to the field is clamped to these. */
  min: fieldBoundSchema.optional(),
  max: fieldBoundSchema.optional(),
  /** Numbers only: the first entry the value is under wins; `{value}` is the value rounded down. */
  words: z.array(fieldWordSchema).optional(),
});
export type FieldDeclaration = z.infer<typeof fieldDeclarationSchema>;

export const componentDeclarationSchema = z.strictObject({
  description: z.string().default(""),
  /** Empty for a tag. */
  fields: z.record(z.string().regex(FIELD_NAME_PATTERN), fieldDeclarationSchema).default({}),
  /** How it reads in prompts while a thing has it ("on fire"). Omitted: it is never mentioned. */
  words: z.string().min(1).optional(),
  /** Whether agents who see the thing get `words`. The thing's own agent always does. */
  isVisible: z.boolean().default(false),
});
export type ComponentDeclaration = z.infer<typeof componentDeclarationSchema>;
export type ComponentDeclarations = Readonly<Record<string, ComponentDeclaration>>;

/** A component's field values, as a definition or a change gives them. */
export const componentValuesSchema = z.record(z.string(), fieldValueSchema);
export type ComponentValues = z.infer<typeof componentValuesSchema>;
