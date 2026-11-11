import { z } from "zod";
import { NEED_NAMES, type NeedName } from "../types";
import { componentPathSchema, identifierSchema } from "./component-schema";

/**
 * Whose field a value reads: `item` is the thing a verb is used with, `self` the thing a rule
 * fired on.
 */
export const VALUE_PATH_SUBJECTS = ["item", "self"] as const;
export type ValuePathSubject = (typeof VALUE_PATH_SUBJECTS)[number];

/** `<who>.<component>.<field>`, as in `item.weapon.damage` or `self.breaks_into.item`. */
export const VALUE_PATH_PATTERN =
  /^(item|self)\.([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.([a-z][A-Za-z0-9]*)$/;

export interface ValuePath {
  who: ValuePathSubject;
  component: string;
  field: string;
}

/** Null for text that isn't `<who>.<component>.<field>`. */
export function parseValuePath(path: string): ValuePath | null {
  const match = VALUE_PATH_PATTERN.exec(path);
  const who = match?.[1];
  if ((who !== "item" && who !== "self") || !match?.[2] || !match[3]) return null;
  return { who, component: match[2], field: match[3] };
}

const valuePathSchema = z
  .string()
  .regex(VALUE_PATH_PATTERN, 'A component read looks like "item.weapon.damage".');

const fromComponentSchema = z.strictObject({ from: valuePathSchema });

/** A literal, a field read as it is, or a literal multiplied by a number field. */
export const numberValueSchema = z.union([
  z.number(),
  fromComponentSchema,
  z.strictObject({ value: z.number(), times: valuePathSchema }),
]);
export const rangeValueSchema = z.union([
  fromComponentSchema,
  z.strictObject({ min: z.number(), max: z.number(), times: valuePathSchema.optional() }),
]);
export const textValueSchema = z.union([z.string().min(1), fromComponentSchema]);
/** A definition id, or an `item` field naming one (`self.breaks_into.item`). */
export const definitionValueSchema = z.union([identifierSchema, fromComponentSchema]);

export type NumberValue = z.infer<typeof numberValueSchema>;
export type RangeValue = z.infer<typeof rangeValueSchema>;
export type TextValue = z.infer<typeof textValueSchema>;
export type DefinitionValue = z.infer<typeof definitionValueSchema>;

export const EFFECT_SUBJECTS = ["target", "user", "item", "chosen", "self", "nearby"] as const;
export type EffectSubject = (typeof EFFECT_SUBJECTS)[number];

export const EFFECT_TIMINGS = ["start", "finish"] as const;
export type EffectTiming = (typeof EFFECT_TIMINGS)[number];

const effectModifiers = {
  /** Required in verbs; `self` when omitted in rules. */
  on: z.enum(EFFECT_SUBJECTS).optional(),
  chance: z.number().min(0).max(1).optional(),
  when: z.enum(EFFECT_TIMINGS).optional(),
  requiresHit: z.boolean().optional(),
  /** Tiles around the target (or `self`) that `on: nearby` reaches. */
  radius: z.number().int().nonnegative().optional(),
};

const needNameSchema = z.enum(NEED_NAMES as readonly [NeedName, ...NeedName[]]);

export const effectSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("damage"),
    ...effectModifiers,
    amount: rangeValueSchema,
    stimulus: textValueSchema.optional(),
    scaledByStrength: z.boolean().default(false),
  }),
  z.strictObject({ type: z.literal("heal"), ...effectModifiers, amount: numberValueSchema }),
  z.strictObject({
    type: z.literal("change_need"),
    ...effectModifiers,
    need: needNameSchema,
    amount: numberValueSchema,
    /** Added once for every other agent using the same thing (the card table). */
    perOtherUser: numberValueSchema.optional(),
  }),
  z.strictObject({ type: z.literal("emit"), ...effectModifiers, stimulus: textValueSchema }),
  z.strictObject({
    type: z.literal("add_condition"),
    ...effectModifiers,
    condition: identifierSchema,
    minutes: numberValueSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("remove_condition"),
    ...effectModifiers,
    condition: identifierSchema,
  }),
  z.strictObject({
    type: z.literal("produce"),
    ...effectModifiers,
    item: identifierSchema,
    count: numberValueSchema,
    into: z.enum(["user", "ground"]),
  }),
  z.strictObject({ type: z.literal("wear"), ...effectModifiers, amount: numberValueSchema }),
  z.strictObject({
    type: z.literal("transform"),
    ...effectModifiers,
    into: definitionValueSchema,
  }),
  z.strictObject({ type: z.literal("destroy"), ...effectModifiers }),
  z.strictObject({ type: z.literal("take_stock"), ...effectModifiers, amount: numberValueSchema }),
  z.strictObject({
    type: z.literal("move"),
    ...effectModifiers,
    to: z.enum(["ground", "user", "item", "target_tile"]),
  }),
  z.strictObject({
    type: z.literal("make_sound"),
    ...effectModifiers,
    loudness: numberValueSchema,
  }),
  /** Writes a field; skips a thing without the component. */
  z.strictObject({
    type: z.literal("set"),
    ...effectModifiers,
    field: componentPathSchema,
    to: z.union([z.number(), z.string(), z.boolean()]),
  }),
  /** Adds `by` to a number field; skips a thing without the component. */
  z.strictObject({
    type: z.literal("change"),
    ...effectModifiers,
    field: componentPathSchema,
    by: numberValueSchema,
  }),
  /**
   * An `announced` event whose subject is the thing ("the jar broke"). On a living agent's body it
   * is that agent's own: remembered in the first person, with an urgent decision. `isPrivate`:
   * nobody else perceives it.
   */
  z.strictObject({
    type: z.literal("announce"),
    ...effectModifiers,
    text: z.string().trim().min(1),
    isPrivate: z.boolean().default(false),
  }),
  z.strictObject({ type: z.literal("sleep"), ...effectModifiers }),
  z.strictObject({ type: z.literal("read_notes"), ...effectModifiers }),
  z.strictObject({ type: z.literal("post_note"), ...effectModifiers }),
]);

export type Effect = z.infer<typeof effectSchema>;
export type EffectType = Effect["type"];
export type EffectOfType<Type extends EffectType> = Extract<Effect, { type: Type }>;
