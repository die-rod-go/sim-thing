import { z } from "zod";
import { NEED_NAMES, type NeedName } from "../types";
import { componentPathSchema, identifierSchema } from "./component-schema";
import { matcherSchema, type Matcher } from "./matcher-schema";
import {
  asNameSchema,
  definitionValueSchema,
  fieldValueInputSchema,
  numberValueSchema,
  textValueSchema,
  thingNameSchema,
} from "./value-schema";

/*
 * The step types: the only item behavior in code. A verb or a rule lists them in order; each is
 * told which component, field or matcher to work on.
 */

/** Settings every step takes. */
const commonSettings = {
  /** 0 to 1, rolled on the seeded generator; the step is skipped on a failed roll. */
  chance: z.number().min(0).max(1).optional(),
  /** Runs after a missed `roll_hit` too. */
  evenOnMiss: z.boolean().optional(),
};

/**
 * What the step works on: a role (`user`, `item`, `target`, `self`), an `as` name, `nearby` or
 * `earshot`. Required in verbs; `self` when omitted in rules. `nearby` takes `radius` and
 * `around`; `earshot` takes `loudness` and `around`.
 */
const onSettings = {
  ...commonSettings,
  on: thingNameSchema.optional(),
  radius: z.number().int().nonnegative().optional(),
  /** For `earshot`: how loud the sound is whose listeners the step reaches. */
  loudness: numberValueSchema.optional(),
  /** Whose tile `nearby` and `earshot` count from; `self` when omitted in a rule. */
  around: thingNameSchema.optional(),
};

const needNameSchema = z.enum(NEED_NAMES as readonly [NeedName, ...NeedName[]]);

/** Where `move` and `create` put things: inside a thing, or on the tile where a thing is. */
const destinationSettings = {
  into: thingNameSchema.optional(),
  at: thingNameSchema.optional(),
  /** The most entities the destination may directly hold after the step. */
  limit: numberValueSchema.optional(),
};

const pickSettings = {
  ...commonSettings,
  /** Whose contents to look in: `user`, `item` or `target`. */
  in: thingNameSchema,
  rule: matcherSchema,
  count: z.number().int().positive().default(1),
  /** Names the first entity found, for later steps. */
  as: asNameSchema.optional(),
};

export const stepSchema = z.discriminatedUnion("step", [
  z.strictObject({ step: z.literal("require"), ...pickSettings }),
  z.strictObject({ step: z.literal("use_up"), ...pickSettings }),
  z.strictObject({
    step: z.literal("check"),
    ...onSettings,
    if: matcherSchema,
    /** The refusal when it doesn't match; `{item}` and `{target}` are filled in. */
    otherwise: z.string().trim().min(1),
  }),
  z.strictObject({
    step: z.literal("wait"),
    ...commonSettings,
    minutes: numberValueSchema,
    /** Only on a verb's first `wait`: how far it is heard. */
    loudness: numberValueSchema.optional(),
  }),
  z.strictObject({
    step: z.literal("sleep"),
    ...commonSettings,
    /** Omitted, or a missing `choice.minutes`: until woken. */
    minutes: numberValueSchema.optional(),
  }),
  z.strictObject({ step: z.literal("roll_hit"), ...commonSettings, chance: numberValueSchema }),
  z.strictObject({
    step: z.literal("change"),
    ...onSettings,
    field: componentPathSchema,
    by: numberValueSchema,
  }),
  z.strictObject({
    step: z.literal("damage"),
    ...onSettings,
    field: componentPathSchema,
    amount: numberValueSchema,
    scaledByStrength: z.boolean().optional(),
  }),
  z.strictObject({
    step: z.literal("set"),
    ...onSettings,
    field: componentPathSchema,
    to: fieldValueInputSchema,
  }),
  z.strictObject({
    step: z.literal("add"),
    ...onSettings,
    component: identifierSchema,
    minutes: numberValueSchema.optional(),
    /** Field name to value. */
    fields: z.record(z.string(), fieldValueInputSchema).optional(),
  }),
  z.strictObject({ step: z.literal("remove"), ...onSettings, component: identifierSchema }),
  z.strictObject({ step: z.literal("move"), ...onSettings, ...destinationSettings }),
  z.strictObject({
    step: z.literal("create"),
    ...commonSettings,
    item: definitionValueSchema,
    count: numberValueSchema,
    ...destinationSettings,
    /** `"component.field"` to value, written on each new entity. */
    fields: z.record(componentPathSchema, fieldValueInputSchema).optional(),
    /** Names the first entity made, for later steps. */
    as: asNameSchema.optional(),
  }),
  z.strictObject({ step: z.literal("transform"), ...onSettings, into: definitionValueSchema }),
  z.strictObject({ step: z.literal("destroy"), ...onSettings }),
  z.strictObject({ step: z.literal("send"), ...onSettings, stimulus: textValueSchema }),
  z.strictObject({ step: z.literal("sound"), ...onSettings, loudness: numberValueSchema }),
  z.strictObject({
    step: z.literal("announce"),
    ...onSettings,
    text: z.string().trim().min(1),
    /** Nobody but the thing's own agent perceives it. */
    isPrivate: z.boolean().default(false),
  }),
  z.strictObject({
    step: z.literal("change_need"),
    ...onSettings,
    need: needNameSchema,
    amount: numberValueSchema,
    /** Added again for every other agent running a verb on the same item (the card table). */
    perOtherUser: numberValueSchema.optional(),
  }),
  z.strictObject({
    step: z.literal("read"),
    ...onSettings,
    field: componentPathSchema,
    /** The field naming who wrote it. */
    author: componentPathSchema.optional(),
  }),
]);

export type Step = z.infer<typeof stepSchema>;
export type StepType = Step["step"];
export type StepOfType<Type extends StepType> = Extract<Step, { step: Type }>;

export const STEP_TYPES = stepSchema.options.map(
  (option) => option.shape.step.value,
) as readonly StepType[];

/** Steps that need an agent doing something: verbs only. */
export const VERB_ONLY_STEPS: ReadonlySet<StepType> = new Set<StepType>([
  "require",
  "use_up",
  "check",
  "wait",
  "sleep",
  "roll_hit",
  "read",
]);

/** The thing a step works on, if it takes `on`. */
export function findStepOn(step: Step): string | undefined {
  return "on" in step ? step.on : undefined;
}

/** The `as` name a step gives the first entity it picks or makes, if any. */
export function findStepAs(step: Step): string | undefined {
  return step.step === "require" || step.step === "use_up" || step.step === "create"
    ? step.as
    : undefined;
}

/**
 * A matcher every entity a naming step names is sure to meet: its `rule`, or the definition
 * `create` made it of (nothing known when that is read from a field).
 */
export function describeNamedThing(step: Step): Matcher {
  if (step.step === "require" || step.step === "use_up") return step.rule;
  if (step.step === "create" && typeof step.item === "string") return { definition: step.item };
  return { allOf: [] };
}
