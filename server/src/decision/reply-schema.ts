import type { DecisionAction, DecisionReply, Volume } from "@village/shared";
import { z } from "zod";
import type { JsonSchema } from "../llm/types";
import type { DecisionTargets, ValidItem } from "./context";
import { listOfferedActions } from "./decision-prompt";
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
  strictJsonObject,
} from "./schema-fields";

const VOLUMES: readonly [Volume, ...Volume[]] = ["whisper", "normal", "shout"];
const ACTIONS_NEEDING_TARGET: readonly DecisionAction[] = ["walk_to", "give"];

export interface ReplySchemas<Value> {
  schema: z.ZodType<Value>;
  jsonSchema: JsonSchema;
  schemaName: string;
}

export interface DecisionSchemaOptions {
  /** Offer `continue`: only for a perception interrupt mid-action. */
  isMidActionInterrupt?: boolean;
}

function buildDecisionJsonSchema(
  actions: readonly string[],
  targetNames: string[],
  itemNames: string[],
  holderNames: string[],
): JsonSchema {
  return strictJsonObject({
    thought: { type: "string", description: "One or two short private sentences." },
    intention: {
      type: "string",
      description: "One line: what you are trying to get done and why.",
    },
    say: nullableJsonString(),
    volume: nullableJsonEnum(VOLUMES),
    action: { type: "string", enum: [...actions] },
    verb: nullableJsonString(),
    item: nullableJsonEnum(itemNames),
    from: nullableJsonEnum(holderNames),
    target: nullableJsonEnum(targetNames),
    text: nullableJsonString(),
    amount: nullableJsonInteger(),
    query: nullableJsonString(),
    minutes: nullableJsonInteger(),
    note: nullableJsonObject(
      strictJsonObject({ person: { type: "string" }, text: { type: "string" } }),
    ),
    mood: nullableJsonString(),
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
  if (reply.action === "say" && !reply.say) missingFields.push("say");
  if (reply.action === "recall" && !reply.query) missingFields.push("query");
  for (const field of missingFields) {
    context.addIssue({ code: "custom", path: [field], message: `${reply.action} needs ${field}` });
  }
}

/**
 * The decision reply as a zod schema plus the matching strict JSON schema. `action`, `target` and
 * `item` and `from` are enums of what is valid right now, so a structured-output provider can't produce
 * anything else; `item` also accepts plurals ("coins").
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
      target: displayNameEnum(targetNames, "target").optional(),
      text: z.string().trim().optional(),
      amount: z.number().int().positive().optional(),
      query: z.string().trim().optional(),
      minutes: z.number().positive().optional(),
      note: z
        .object({ person: z.string().trim().min(1), text: z.string().trim().min(1) })
        .optional(),
      mood: z.string().trim().optional(),
    })
    .superRefine(requireFieldsForAction);
  return {
    schema: z.preprocess(dropEmptyFields, replyObject),
    jsonSchema: buildDecisionJsonSchema(actions, targetNames, itemNames, validHolders),
    schemaName: "decision_reply",
  };
}
