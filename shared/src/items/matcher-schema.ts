import { z } from "zod";
import { componentPathSchema, identifierSchema } from "./component-schema";
import { valueReadSchema, type ValueRead } from "./value-schema";

/** Where a thing is, relative to the agent doing a verb. */
export const THING_WHERES = ["held", "here", "inside", "self"] as const;
export type ThingWhere = (typeof THING_WHERES)[number];

export const FIELD_COMPARISONS = ["atLeast", "atMost", "above", "below", "equals"] as const;
export type FieldComparison = (typeof FIELD_COMPARISONS)[number];

/** What a field is compared with: a literal, or (in a step's `rule` or `if`) a read of a value. */
export type ComparedValue = number | string | boolean | ValueRead;

export interface FieldMatcher {
  /** `<component>.<field>`. Never matches a thing that lacks the component. */
  field: string;
  atLeast?: number | ValueRead;
  atMost?: number | ValueRead;
  above?: number | ValueRead;
  below?: number | ValueRead;
  equals?: number | string | boolean | ValueRead;
}

/** The expression that says "which things". */
export type Matcher =
  | { has: string }
  | { definition: string }
  | FieldMatcher
  | { where: ThingWhere }
  | { anyOf: Matcher[] }
  | { allOf: Matcher[] }
  | { not: Matcher };

const orderedValueSchema = z.union([z.number(), valueReadSchema]);

const fieldMatcherSchema = z
  .strictObject({
    field: componentPathSchema,
    atLeast: orderedValueSchema.optional(),
    atMost: orderedValueSchema.optional(),
    above: orderedValueSchema.optional(),
    below: orderedValueSchema.optional(),
    equals: z.union([z.number(), z.string(), z.boolean(), valueReadSchema]).optional(),
  })
  .refine(
    (matcher) =>
      FIELD_COMPARISONS.filter((comparison) => matcher[comparison] !== undefined).length === 1,
    { message: `A field comparison needs exactly one of: ${FIELD_COMPARISONS.join(", ")}.` },
  );

export const matcherSchema: z.ZodType<Matcher> = z.lazy(() =>
  z.union([
    z.strictObject({ has: identifierSchema }),
    z.strictObject({ definition: identifierSchema }),
    fieldMatcherSchema,
    z.strictObject({ where: z.enum(THING_WHERES) }),
    z.strictObject({ anyOf: z.array(matcherSchema) }),
    z.strictObject({ allOf: z.array(matcherSchema) }),
    z.strictObject({ not: matcherSchema }),
  ]),
);

export function isValueRead(value: ComparedValue | undefined): value is ValueRead {
  return typeof value === "object";
}

export interface FieldComparisonTerm {
  comparison: FieldComparison;
  value: ComparedValue;
}

/** The comparison a field matcher makes, and what it compares with; null when it makes none. */
export function readFieldComparison(matcher: FieldMatcher): FieldComparisonTerm | null {
  for (const comparison of FIELD_COMPARISONS) {
    const value = matcher[comparison];
    if (value !== undefined) return { comparison, value };
  }
  return null;
}
