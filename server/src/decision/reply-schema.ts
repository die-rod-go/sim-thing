import type { DecisionAction, DecisionReply, OfferAnswer, Volume } from "@village/shared";
import { z } from "zod";
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
  nullableJsonString,
  nullableJsonStringOffering,
  strictJsonObject,
} from "./schema-fields";

const VOLUMES: readonly [Volume, ...Volume[]] = ["whisper", "normal", "shout"];
const OFFER_ANSWERS: readonly [OfferAnswer, ...OfferAnswer[]] = ["accept", "decline"];
const ACTIONS_NEEDING_TARGET: readonly DecisionAction[] = ["walk_to", "give"];

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
}

function buildDecisionJsonSchema(
  actions: readonly string[],
  targetNames: string[],
  itemNames: string[],
  holderNames: string[],
  isStable: boolean,
): JsonSchema {
  const nameField = (names: string[]) =>
    isStable ? nullableJsonString() : nullableJsonEnum(names);
  return strictJsonObject({
    thought: { type: "string", description: "One or two short private sentences." },
    intention: {
      type: "string",
      description:
        "One line: what you are trying to get done and why; usually a step of one of your short-term goals.",
    },
    say: nullableJsonString(),
    volume: nullableJsonEnum(VOLUMES),
    action: isStable ? { type: "string" } : { type: "string", enum: [...actions] },
    verb: nullableJsonString(),
    item: nameField(itemNames),
    from: nameField(holderNames),
    // `walk_to` takes any name, so the names are only offered; zod checks the other actions' targets.
    target: isStable ? nullableJsonString() : nullableJsonStringOffering(targetNames),
    text: nullableJsonString(),
    amount: nullableJsonInteger(),
    minutes: nullableJsonInteger(),
    mood: nullableJsonString(),
    offer: nullableJsonEnum(OFFER_ANSWERS),
  });
}

function requireFieldsForAction(reply: DecisionReply, context: z.RefinementCtx): void {
  const missingFields: (keyof DecisionReply)[] = [];
  if (ACTIONS_NEEDING_TARGET.includes(reply.action) && !reply.target) missingFields.push("target");
  if (reply.action === "interact" && !reply.target && !reply.item && !reply.verb) {
    missingFields.push("target");
  }
  if (reply.action === "give" && !reply.item) missingFields.push("item");
  if (reply.action === "give" && reply.amount === undefined) missingFields.push("amount");
  for (const field of missingFields) {
    context.addIssue({ code: "custom", path: [field], message: `${reply.action} needs ${field}` });
  }
}

/**
 * A target must be one of the names valid right now, and parses to that name's spelling. Only
 * `walk_to` takes any name: an agent may set out for a place it has only heard of.
 */
function checkTarget(targetNames: readonly string[]) {
  const canonicalByNormalized = new Map(
    targetNames.map((name) => [normalizeDisplayName(name), name] as const),
  );
  const findCanonical = (target: string) => canonicalByNormalized.get(normalizeDisplayName(target));
  return {
    refine(reply: DecisionReply, context: z.RefinementCtx): void {
      if (reply.target === undefined || reply.action === "walk_to") return;
      if (findCanonical(reply.target) !== undefined) return;
      context.addIssue({
        code: "custom",
        path: ["target"],
        message: `target must be one of: ${targetNames.join(", ")}`,
      });
    },
    canonicalize(reply: DecisionReply): DecisionReply {
      if (reply.target === undefined) return reply;
      return { ...reply, target: findCanonical(reply.target) ?? reply.target };
    },
  };
}

/**
 * The decision reply as a zod schema plus the matching strict JSON schema. `action`, `item` and
 * `from` are enums of what is valid right now, so a structured-output provider can't produce
 * anything else; `item` also accepts plurals ("coins"). `target` is checked by zod alone.
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
  const replyObject = z
    .object({
      thought: z.string().trim().min(1),
      intention: z.string().trim().min(1),
      say: z.string().trim().optional(),
      volume: looseEnum(VOLUMES).optional(),
      action: looseEnum(actions),
      verb: z.string().trim().optional(),
      item: aliasedNameEnum(itemNames, itemAliases, "item").optional(),
      from: displayNameEnum(validHolders, "from").optional(),
      target: z.string().trim().optional(),
      text: z.string().trim().optional(),
      amount: z.number().int().positive().optional(),
      minutes: z.number().positive().optional(),
      mood: z.string().trim().optional(),
      offer: looseEnum(OFFER_ANSWERS).optional(),
    })
    .superRefine(requireFieldsForAction)
    .superRefine(targetCheck.refine)
    .transform(targetCheck.canonicalize);
  return {
    schema: z.preprocess(dropEmptyFields, replyObject),
    jsonSchema: buildDecisionJsonSchema(
      actions,
      targetNames,
      itemNames,
      validHolders,
      options.isReplySchemaStable ?? false,
    ),
    schemaName: "decision_reply",
  };
}
