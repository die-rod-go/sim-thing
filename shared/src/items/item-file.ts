import { z } from "zod";
import { glyphSchema } from "../glyph";
import {
  componentDeclarationSchema,
  componentPathSchema,
  componentValuesSchema,
  identifierSchema,
} from "./component-schema";
import { effectSchema, numberValueSchema } from "./effect-schema";
import { matcherSchema } from "./matcher-schema";

/*
 * The shape of `seeds/items.json`: the world settings, component declarations, item definitions,
 * verbs, conditions and reactions. Cross-references (unknown names, rules a verb's numbers depend
 * on, overlapping verbs) are checked by `findItemFileProblems`.
 */

export const RULE_LOCATIONS = ["held", "ground", "placed"] as const;
export type RuleLocation = (typeof RULE_LOCATIONS)[number];

/** Which entities and agents offer a verb. Terms combine with `anyOf`, `allOf` and `not`. */
export type AppliesToRule =
  | { definition: string }
  | { component: string }
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
  /** A walker blocked by an entity this verb applies to does it on the way through (a door). */
  isDoneInPassing: z.boolean().default(false),
  /** Items used up from the user's inventory when it starts, by definition id. */
  inputs: z.record(identifierSchema, z.number().int().positive()).default({}),
  /** Held items needed but not used up: every listed definition, and something with each component. */
  tools: z
    .strictObject({
      definitions: z.array(identifierSchema).default([]),
      components: z.array(identifierSchema).default([]),
    })
    .optional(),
  hitRoll: z.strictObject({ baseHitChance: numberValueSchema }).optional(),
  effects: z.array(effectSchema),
  phrases: phrasesSchema.default({}),
});
export type Verb = z.infer<typeof verbSchema>;

/**
 * What a component does while a thing has it, and how its start and end read. The state itself is
 * the component: an `add_condition` effect adds it for `defaultMinutes`. Any other component can be
 * added and removed the same way; it then lasts until removed and nothing announces it.
 */
export const conditionSchema = z.strictObject({
  /** The component's name. */
  name: identifierSchema,
  /** Null: lasts until something removes it. */
  defaultMinutes: z.number().positive().nullable(),
  everyMinute: z.array(effectSchema).default([]),
  onEnd: z.array(effectSchema).default([]),
  phrases: conditionPhrasesSchema.default({}),
});
export type ConditionDefinition = z.infer<typeof conditionSchema>;

export const reactionSchema = z.strictObject({
  stimulus: z.string().min(1),
  /** Which receivers of the stimulus react. */
  if: matcherSchema,
  effects: z.array(effectSchema),
  phrases: killedPhraseSchema.default({}),
});
export type Reaction = z.infer<typeof reactionSchema>;

export const itemDefinitionSchema = z.strictObject({
  id: identifierSchema,
  name: z.string().trim().min(1),
  /** Omitted for things counted without a plural ("3 bread"). */
  plural: z.string().trim().min(1).optional(),
  glyph: glyphSchema,
  /** Component name to its field values. */
  components: z.record(identifierSchema, componentValuesSchema).default({}),
  /** Runs when the health field reaches 0; without it the entity is destroyed. */
  onBroken: z.array(effectSchema).optional(),
});
export type ItemDefinition = z.infer<typeof itemDefinitionSchema>;

/** Matchers and names the engine's physics reads. An omitted matcher matches nothing. */
export const worldSettingsSchema = z.strictObject({
  /** A tile with a matching entity on it blocks sight. */
  sightBlockedBy: matcherSchema.optional(),
  /** A tile with a matching entity on it can't be walked through. */
  movementBlockedBy: matcherSchema.optional(),
  /** Sound passing a tile with a matching entity is muffled. */
  soundMuffledBy: matcherSchema.optional(),
  /** Nobody but its own agent sees what is inside a matching thing. */
  contentsHiddenBy: matcherSchema.optional(),
  /** Others see a matching entity directly inside an agent ("Tobias, carrying a knife"). */
  shownWhenCarried: matcherSchema.optional(),
  /** A matching entity on a tile reads as lying on the floor or the ground. */
  lyingWhenOnTile: matcherSchema.optional(),
  /** Validation warns when a verb or reaction could make or destroy a matching thing. */
  closedSupply: matcherSchema.optional(),
  /** The definition of every agent's body. */
  agentBody: identifierSchema,
  /** The number field that is an agent's health. */
  agentHealth: componentPathSchema,
});
export type WorldSettings = z.infer<typeof worldSettingsSchema>;

export const WORLD_MATCHER_SETTINGS = [
  "sightBlockedBy",
  "movementBlockedBy",
  "soundMuffledBy",
  "contentsHiddenBy",
  "shownWhenCarried",
  "lyingWhenOnTile",
  "closedSupply",
] as const satisfies readonly (keyof WorldSettings)[];

export const itemFileSchema = z.strictObject({
  world: worldSettingsSchema,
  components: z.record(identifierSchema, componentDeclarationSchema),
  definitions: z.array(itemDefinitionSchema),
  verbs: z.array(verbSchema),
  conditions: z.array(conditionSchema).default([]),
  reactions: z.array(reactionSchema).default([]),
});

export type ItemFile = z.infer<typeof itemFileSchema>;

export function parseItemFile(json: unknown): ItemFile {
  return itemFileSchema.parse(json);
}
