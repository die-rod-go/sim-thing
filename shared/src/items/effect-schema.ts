import { z } from "zod";
import { NEED_NAMES, type NeedName } from "../types";
import { identifierSchema } from "./component-schema";

/** `item.<component>.<field>`: a field of a component on the thing a verb is used with. */
export const ITEM_VALUE_PATH_PATTERN =
  /^item\.([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.([a-z][A-Za-z0-9]*)$/;

const itemValuePathSchema = z
  .string()
  .regex(ITEM_VALUE_PATH_PATTERN, 'A component read looks like "item.weapon.damage".');

const fromComponentSchema = z.strictObject({ from: itemValuePathSchema });

/** A literal, a field read as it is, or a literal multiplied by a number field. */
export const numberValueSchema = z.union([
  z.number(),
  fromComponentSchema,
  z.strictObject({ value: z.number(), times: itemValuePathSchema }),
]);
export const rangeValueSchema = z.union([
  fromComponentSchema,
  z.strictObject({ min: z.number(), max: z.number(), times: itemValuePathSchema.optional() }),
]);
export const textValueSchema = z.union([z.string().min(1), fromComponentSchema]);

export type NumberValue = z.infer<typeof numberValueSchema>;
export type RangeValue = z.infer<typeof rangeValueSchema>;
export type TextValue = z.infer<typeof textValueSchema>;

export const EFFECT_SUBJECTS = ["target", "user", "item", "chosen", "self", "nearby"] as const;
export type EffectSubject = (typeof EFFECT_SUBJECTS)[number];

export const EFFECT_TIMINGS = ["start", "finish"] as const;
export type EffectTiming = (typeof EFFECT_TIMINGS)[number];

const effectModifiers = {
  /** Required in verbs; `self` when omitted in conditions, reactions and `onBroken`. */
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
  z.strictObject({ type: z.literal("transform"), ...effectModifiers, into: identifierSchema }),
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
  z.strictObject({ type: z.literal("sleep"), ...effectModifiers }),
  z.strictObject({ type: z.literal("read_notes"), ...effectModifiers }),
  z.strictObject({ type: z.literal("post_note"), ...effectModifiers }),
]);

export type Effect = z.infer<typeof effectSchema>;
export type EffectType = Effect["type"];
export type EffectOfType<Type extends EffectType> = Extract<Effect, { type: Type }>;
