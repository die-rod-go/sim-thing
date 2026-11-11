import { z } from "zod";
import { componentPathSchema, identifierSchema } from "./component-schema";

/** Where a thing is, relative to the agent doing a verb. */
export const THING_WHERES = ["held", "here", "inside", "self"] as const;
export type ThingWhere = (typeof THING_WHERES)[number];

export const FIELD_COMPARISONS = ["atLeast", "atMost", "above", "below", "equals"] as const;
export type FieldComparison = (typeof FIELD_COMPARISONS)[number];

export interface FieldMatcher {
  /** `<component>.<field>`. Never matches a thing that lacks the component. */
  field: string;
  atLeast?: number;
  atMost?: number;
  above?: number;
  below?: number;
  equals?: number | string | boolean;
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

const fieldMatcherSchema = z
  .strictObject({
    field: componentPathSchema,
    atLeast: z.number().optional(),
    atMost: z.number().optional(),
    above: z.number().optional(),
    below: z.number().optional(),
    equals: z.union([z.number(), z.string(), z.boolean()]).optional(),
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
