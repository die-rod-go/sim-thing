import type {
  DecisionAct,
  DecisionAction,
  DecisionReply,
  OfferAnswer,
  Volume,
} from "@village/shared";
import { z } from "zod";
import { PLANNED_ITEM_JSON, plannedItemSchema } from "../agenda/agenda-schema";
import { config } from "../config";
import type { JsonSchema } from "../llm/types";
import type { DecisionTargets, ValidItem } from "./context";
import { listOfferedActions } from "./decision-prompt";
import { normalizeDisplayName } from "./resolve-name";
import { listTargetNames } from "./sections";
import {
  aliasedNameEnum,
  displayNameEnum,
  dropEmptyFields,
  looseEnum,
  nullableJsonEnum,
  nullableJsonInteger,
  nullableJsonObject,
  nullableJsonString,
  nullableJsonStringOffering,
  strictJsonObject,
  writtenText,
} from "./schema-fields";

const VOLUMES: readonly [Volume, ...Volume[]] = ["whisper", "normal", "shout"];
const NUMBER_LIST_JSON: JsonSchema = { type: "array", items: { type: "integer" } };
const OFFER_ANSWERS: readonly [OfferAnswer, ...OfferAnswer[]] = ["accept", "decline"];
const ACTIONS_NEEDING_TARGET: readonly DecisionAction[] = ["walk_to", "give", "follow"];
/** What an act after the first may be: anything but `continue`. */
const LATER_ACTIONS: readonly [DecisionAction, ...DecisionAction[]] = [
  "walk_to",
  "say",
  "interact",
  "give",
  "wait",
  "follow",
];

export interface ReplySchemas<Value> {
  schema: z.ZodType<Value>;
  jsonSchema: JsonSchema;
  schemaName: string;
}

export interface DecisionSchemaOptions {
  /** Offer `continue`: only for a perception interrupt mid-action. */
  isMidActionInterrupt?: boolean;
  /**
   * Leave the names and actions as plain strings in the JSON schema (zod still checks them). A
   * schema that changes per call stops a provider's prompt cache from matching.
   */
  isReplySchemaStable?: boolean;
  /** A reckoning may also write the whole new agenda. */
  isReckoning?: boolean;
}

const AGENDA_LIST_JSON: JsonSchema = { type: "array", items: PLANNED_ITEM_JSON };

interface OfferedNames {
  actions: readonly string[];
  targets: string[];
  items: string[];
  holders: string[];
}

function buildActJsonSchema(names: OfferedNames, isStable: boolean): JsonSchema {
  // Later acts may name what isn't here yet, so names are offered rather than required; zod
  // checks the first act's names.
  const nameField = (offered: string[]) =>
    isStable ? nullableJsonString() : nullableJsonStringOffering(offered);
  return strictJsonObject({
    action: isStable ? { type: "string" } : { type: "string", enum: [...names.actions] },
    verb: nullableJsonString(),
    item: nameField(names.items),
    from: nameField(names.holders),
    target: nameField(names.targets),
    text: nullableJsonString(),
    amount: nullableJsonInteger(),
    inReturn: nullableJsonString(),
    inReturnAmount: nullableJsonInteger(),
    minutes: nullableJsonInteger(),
    say: nullableJsonString(),
    volume: nullableJsonEnum(VOLUMES),
  });
}

function buildDecisionJsonSchema(names: OfferedNames, options: DecisionSchemaOptions): JsonSchema {
  const isStable = options.isReplySchemaStable ?? false;
  return strictJsonObject({
    thought: { type: "string", description: "One or two short private sentences." },
    intention: {
      type: "string",
      description: "One line: what you are doing now and why.",
    },
    acts: { type: "array", items: buildActJsonSchema(names, isStable) },
    // Plain strings and lists, empty for none: a strict schema allows only so many nullable
    // fields (`llm.maxUnionParameters`), and each act already has eleven.
    mood: { type: "string" },
    offer: nullableJsonEnum(OFFER_ANSWERS),
    done: NUMBER_LIST_JSON,
    dropped: NUMBER_LIST_JSON,
    added: AGENDA_LIST_JSON,
    remember: { type: "string" },
    ...(options.isReckoning ? { agenda: nullableJsonObject(AGENDA_LIST_JSON) } : {}),
  });
}

function requireFieldsForAct(act: DecisionAct, context: z.RefinementCtx): void {
  const missingFields: (keyof DecisionAct)[] = [];
  if (ACTIONS_NEEDING_TARGET.includes(act.action) && !act.target) missingFields.push("target");
  if (act.action === "interact" && !act.target && !act.item && !act.verb) {
    missingFields.push("target");
  }
  if (act.action === "say" && !act.say) missingFields.push("say");
  if (act.action === "give" && !act.item) missingFields.push("item");
  if (act.action === "give" && act.amount === undefined) missingFields.push("amount");
  if (act.inReturn !== undefined && act.inReturnAmount === undefined) {
    missingFields.push("inReturnAmount");
  }
  for (const field of missingFields) {
    context.addIssue({ code: "custom", path: [field], message: `${act.action} needs ${field}` });
  }
}

/**
 * A first act's target must be one of the names valid right now, and parses to that name's
 * spelling. Only `walk_to` takes any name: an agent may set out for a place it has only heard of.
 */
function checkTarget(targetNames: readonly string[]) {
  const canonicalByNormalized = new Map(
    targetNames.map((name) => [normalizeDisplayName(name), name] as const),
  );
  const findCanonical = (target: string) => canonicalByNormalized.get(normalizeDisplayName(target));
  return {
    refine(act: DecisionAct, context: z.RefinementCtx): void {
      if (act.target === undefined || act.action === "walk_to") return;
      if (findCanonical(act.target) !== undefined) return;
      context.addIssue({
        code: "custom",
        path: ["target"],
        message: `target must be one of: ${targetNames.join(", ")}`,
      });
    },
    canonicalize(act: DecisionAct): DecisionAct {
      if (act.target === undefined) return act;
      return { ...act, target: findCanonical(act.target) ?? act.target };
    },
  };
}

/** The fields every act has, with its own `action` and naming checks. */
function buildActShape(
  action: z.ZodType<DecisionAction>,
  item: z.ZodType<string>,
  from: z.ZodType<string>,
) {
  return {
    action,
    verb: z.string().trim().optional(),
    item: item.optional(),
    from: from.optional(),
    target: z.string().trim().optional(),
    text: z.string().trim().optional(),
    amount: z.number().int().positive().optional(),
    inReturn: z.string().trim().min(1).optional(),
    inReturnAmount: z.number().int().positive().optional(),
    minutes: z.number().positive().optional(),
    say: z.string().trim().optional(),
    volume: looseEnum(VOLUMES).optional(),
  };
}

/**
 * The decision reply as a zod schema plus the matching strict JSON schema. The first act is
 * checked against what is valid right now (`item` also accepts plurals, "coins"); the later ones
 * take any name and are resolved when they start, as `walk_to` already is.
 */
export function buildDecisionReplySchema(
  validTargets: DecisionTargets,
  validItems: ValidItem[],
  validHolders: string[],
  options: DecisionSchemaOptions = {},
): ReplySchemas<DecisionReply> {
  const [firstAction, ...otherActions] = listOfferedActions(options.isMidActionInterrupt ?? false);
  const actions: [DecisionAction, ...DecisionAction[]] = [firstAction ?? "wait", ...otherActions];
  const targetNames = listTargetNames(validTargets);
  const itemNames = validItems.map((item) => item.name);
  const itemAliases = new Map(
    validItems.flatMap((item) => (item.plural ? [[item.plural, item.name] as const] : [])),
  );
  const targetCheck = checkTarget(targetNames);
  const firstAct = z.preprocess(
    dropEmptyFields,
    z
      .object(
        buildActShape(
          looseEnum(actions),
          aliasedNameEnum(itemNames, itemAliases, "item"),
          displayNameEnum(validHolders, "from"),
        ),
      )
      .superRefine(requireFieldsForAct)
      .superRefine(targetCheck.refine)
      .transform(targetCheck.canonicalize),
  );
  const laterAct = z.preprocess(
    dropEmptyFields,
    z
      .object(buildActShape(looseEnum(LATER_ACTIONS), z.string().trim(), z.string().trim()))
      .superRefine(requireFieldsForAct),
  );
  const replyObject = z.object({
    thought: z.string().trim().min(1),
    intention: z.string().trim().min(1),
    acts: z
      .tuple([firstAct])
      .rest(laterAct)
      .transform((acts) => acts.slice(0, config.decision.maxActs)),
    mood: z.string().trim().optional(),
    offer: looseEnum(OFFER_ANSWERS).optional(),
    done: z.array(z.number().int()).optional(),
    dropped: z.array(z.number().int()).optional(),
    added: z.array(plannedItemSchema).optional(),
    remember: writtenText(config.memory.keyMemoryMaxChars).min(1).optional(),
    agenda: z
      .array(plannedItemSchema)
      .transform((items) => items.slice(0, config.agenda.maxItems))
      .optional(),
  });
  const names = { actions, targets: targetNames, items: itemNames, holders: validHolders };
  return {
    schema: z.preprocess(dropEmptyFields, replyObject),
    jsonSchema: buildDecisionJsonSchema(names, options),
    schemaName: "decision_reply",
  };
}
