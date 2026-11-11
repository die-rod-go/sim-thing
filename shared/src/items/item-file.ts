import { z } from "zod";
import { glyphSchema } from "../glyph";
import { NEED_NAMES, type NeedName } from "../types";

/*
 * The shape of `seeds/items.json`: item definitions, component declarations, properties, the
 * `person` properties, verbs, conditions and reactions. Cross-references (unknown names, rules a
 * verb's numbers depend on, overlapping verbs) are checked by `findItemFileProblems`.
 */

/** Definition ids, component, property and condition names: snake_case. */
export const ITEM_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
/** Component field names: camelCase. */
export const FIELD_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/;
/** `item.<component>.<field>`: a field of a component on the thing a verb is used with. */
export const COMPONENT_PATH_PATTERN =
  /^item\.([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.([a-z][A-Za-z0-9]*)$/;

const identifierSchema = z
  .string()
  .regex(ITEM_IDENTIFIER_PATTERN, "Use snake_case: lowercase letters, digits and underscores.");

export const ITEM_FORMS = ["placeable", "carriable"] as const;
export type ItemForm = (typeof ITEM_FORMS)[number];

export const FIELD_TYPES = ["number", "range", "boolean", "text"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const fieldDeclarationSchema = z.strictObject({
  type: z.enum(FIELD_TYPES),
  description: z.string().default(""),
});

const componentDeclarationSchema = z.strictObject({
  description: z.string().default(""),
  fields: z.record(z.string().regex(FIELD_NAME_PATTERN), fieldDeclarationSchema).default({}),
});

const rangeSchema = z.strictObject({ min: z.number(), max: z.number() });
export type NumberRange = z.infer<typeof rangeSchema>;

const fieldValueSchema = z.union([z.number(), rangeSchema, z.boolean(), z.string()]);
export type FieldValue = z.infer<typeof fieldValueSchema>;

const propertyDeclarationSchema = z.strictObject({
  description: z.string().default(""),
  /** Shown in prompts before the item's name ("a fragile jar"). */
  isVisible: z.boolean().default(false),
  /** The prompt word; the property name when omitted. */
  word: z.string().optional(),
});

const componentPathSchema = z
  .string()
  .regex(COMPONENT_PATH_PATTERN, 'A component read looks like "item.weapon.damage".');

const fromComponentSchema = z.strictObject({ from: componentPathSchema });

/** A literal, a field read as it is, or a literal multiplied by a number field. */
export const numberValueSchema = z.union([
  z.number(),
  fromComponentSchema,
  z.strictObject({ value: z.number(), times: componentPathSchema }),
]);
export const rangeValueSchema = z.union([
  fromComponentSchema,
  z.strictObject({ min: z.number(), max: z.number(), times: componentPathSchema.optional() }),
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
  z.strictObject({ type: z.literal("set_open"), ...effectModifiers, isOpen: z.boolean() }),
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

export const RULE_LOCATIONS = ["held", "ground", "placed"] as const;
export type RuleLocation = (typeof RULE_LOCATIONS)[number];

/** Which entities and agents offer a verb. Terms combine with `anyOf`, `allOf` and `not`. */
export type AppliesToRule =
  | { definition: string }
  | { component: string }
  | { form: ItemForm }
  | { property: string }
  | { location: RuleLocation }
  | { isDeadAgent: true }
  | { isUser: true }
  | { anyOf: AppliesToRule[] }
  | { allOf: AppliesToRule[] }
  | { not: AppliesToRule };

export const appliesToRuleSchema: z.ZodType<AppliesToRule> = z.lazy(() =>
  z.union([
    z.strictObject({ definition: identifierSchema }),
    z.strictObject({ component: identifierSchema }),
    z.strictObject({ form: z.enum(ITEM_FORMS) }),
    z.strictObject({ property: identifierSchema }),
    z.strictObject({ location: z.enum(RULE_LOCATIONS) }),
    z.strictObject({ isDeadAgent: z.literal(true) }),
    z.strictObject({ isUser: z.literal(true) }),
    z.strictObject({ anyOf: z.array(appliesToRuleSchema) }),
    z.strictObject({ allOf: z.array(appliesToRuleSchema) }),
    z.strictObject({ not: appliesToRuleSchema }),
  ]),
);

export const VERB_TARGETS = ["none", "agent", "entity", "agent_or_entity"] as const;
export type VerbTarget = (typeof VERB_TARGETS)[number];

const phrasesSchema = z.strictObject({
  ongoing: z.string().optional(),
  done: z.string().optional(),
  attempt: z.string().optional(),
  hit: z.string().optional(),
  missed: z.string().optional(),
  killed: z.string().optional(),
});
export type VerbPhrases = z.infer<typeof phrasesSchema>;

const killedPhraseSchema = z.strictObject({ killed: z.string().optional() });

/** How a condition's start and end read as events ("caught fire", "stopped burning"). */
const conditionPhrasesSchema = z.strictObject({
  killed: z.string().optional(),
  started: z.string().optional(),
  ended: z.string().optional(),
});
export type ConditionPhrases = z.infer<typeof conditionPhrasesSchema>;

export const verbSchema = z.strictObject({
  name: z.string().trim().min(1),
  appliesTo: appliesToRuleSchema,
  target: z.enum(VERB_TARGETS).default("none"),
  canTargetSelf: z.boolean().default(false),
  reach: numberValueSchema.default(1),
  /** Null: it ends by its own rules (sleep). */
  minutes: numberValueSchema.nullable().default(1),
  /** Sound reach in tiles while it runs; null if silent. */
  loudness: numberValueSchema.nullable().default(null),
  takesText: z.boolean().default(false),
  /** Items used up from the user's inventory when it starts, by definition id. */
  inputs: z.record(identifierSchema, z.number().int().positive()).default({}),
  /** Held items needed but not used up: every listed definition, and something with each property. */
  tools: z
    .strictObject({
      definitions: z.array(identifierSchema).default([]),
      properties: z.array(identifierSchema).default([]),
    })
    .optional(),
  hitRoll: z.strictObject({ baseHitChance: numberValueSchema }).optional(),
  effects: z.array(effectSchema),
  phrases: phrasesSchema.default({}),
});
export type Verb = z.infer<typeof verbSchema>;

export const conditionSchema = z.strictObject({
  name: identifierSchema,
  /** How it reads in prompts ("on fire"). */
  words: z.string().min(1),
  isVisible: z.boolean().default(false),
  /** Null: lasts until something removes it. */
  defaultMinutes: z.number().positive().nullable(),
  everyMinute: z.array(effectSchema).default([]),
  onEnd: z.array(effectSchema).default([]),
  phrases: conditionPhrasesSchema.default({}),
});
export type ConditionDefinition = z.infer<typeof conditionSchema>;

export const reactionSchema = z
  .strictObject({
    stimulus: z.string().min(1),
    property: identifierSchema.optional(),
    condition: identifierSchema.optional(),
    /** Skipped when the receiver has this property or condition. */
    unless: identifierSchema.optional(),
    effects: z.array(effectSchema),
    phrases: killedPhraseSchema.default({}),
  })
  .refine((reaction) => reaction.property !== undefined || reaction.condition !== undefined, {
    message: "A reaction needs a property, a condition, or both.",
  });
export type Reaction = z.infer<typeof reactionSchema>;

export const itemDefinitionSchema = z.strictObject({
  id: identifierSchema,
  name: z.string().trim().min(1),
  /** Omitted for things counted without a plural ("3 bread"). */
  plural: z.string().trim().min(1).optional(),
  form: z.enum(ITEM_FORMS),
  glyph: glyphSchema,
  /** Drawn instead of `glyph` while an openable thing is closed. */
  glyphWhenClosed: glyphSchema.optional(),
  isVisibleWhenCarried: z.boolean().default(false),
  properties: z.array(identifierSchema).default([]),
  /** Component name to its field values. */
  components: z.record(identifierSchema, z.record(z.string(), fieldValueSchema)).default({}),
  /** Runs when durability reaches 0; without it the entity is destroyed. */
  onBroken: z.array(effectSchema).optional(),
});
export type ItemDefinition = z.infer<typeof itemDefinitionSchema>;

export const itemFileSchema = z.strictObject({
  components: z.record(identifierSchema, componentDeclarationSchema),
  properties: z.record(identifierSchema, propertyDeclarationSchema).default({}),
  /** What agents are made of, for reactions and verb rules. Not an item definition. */
  person: z.strictObject({ properties: z.array(identifierSchema).default([]) }),
  definitions: z.array(itemDefinitionSchema),
  verbs: z.array(verbSchema),
  conditions: z.array(conditionSchema).default([]),
  reactions: z.array(reactionSchema).default([]),
});

export type ItemFile = z.infer<typeof itemFileSchema>;
export type ComponentDeclaration = z.infer<typeof componentDeclarationSchema>;
export type PropertyDeclaration = z.infer<typeof propertyDeclarationSchema>;

/**
 * Components the engine reads. Their fields are fixed: `items.json` must declare them exactly so,
 * and the item editor shows them locked.
 */
export const ENGINE_COMPONENT_FIELDS = {
  durability: { toughness: "number" },
  stock: { capacity: "number", regrowPerDay: "number" },
  openable: {
    startsOpen: "boolean",
    blocksSightWhenClosed: "boolean",
    muffleWhenClosed: "boolean",
  },
  blocking: { blocksMovement: "boolean", blocksSight: "boolean" },
  container: { capacity: "number" },
  notes: { maxNotes: "number" },
  bed: {},
} as const satisfies Record<string, Record<string, FieldType>>;

export type EngineComponentName = keyof typeof ENGINE_COMPONENT_FIELDS;

export function isEngineComponent(name: string): name is EngineComponentName {
  return Object.hasOwn(ENGINE_COMPONENT_FIELDS, name);
}

export function parseItemFile(json: unknown): ItemFile {
  return itemFileSchema.parse(json);
}
