import { z } from "zod";
import { renderTemplate } from "../llm/templates";
import type { ReplySchemas } from "./reply-schema";
import {
  displayNameEnum,
  dropEmptyFields,
  nullableJsonInteger,
  nullableJsonString,
  strictJsonObject,
} from "./schema-fields";

export interface InteractOption {
  name: string;
  /** e.g. "needs 2 wheat and 1 wood; you have no wood". */
  description: string;
}

export interface InteractPromptInput {
  agentName: string;
  objectName: string;
  /** "the oven", when the options are narrowed to the verbs that can aim at it. */
  targetName?: string;
  options: InteractOption[];
  intention: string;
}

export interface InteractReply {
  verb: string;
  text?: string;
  minutes?: number;
}

/** The second call of a two-step interact: which of the thing's verbs to use. */
export function buildInteractPrompt(input: InteractPromptInput, promptsDirectory?: string): string {
  const options = input.options
    .map((option) =>
      option.description ? `- ${option.name}: ${option.description}` : `- ${option.name}`,
    )
    .join("\n");
  return renderTemplate(
    "interact",
    {
      agentName: input.agentName,
      objectName: input.objectName,
      targetWords: input.targetName === undefined ? "" : ` and ${input.targetName}`,
      intention: input.intention || "nothing in particular",
      options,
    },
    promptsDirectory,
  );
}

export function buildInteractReplySchema(optionNames: string[]): ReplySchemas<InteractReply> {
  const replyObject = z.object({
    verb: displayNameEnum(optionNames, "verb"),
    text: z.string().trim().optional(),
    minutes: z.number().positive().optional(),
  });
  return {
    schema: z.preprocess(dropEmptyFields, replyObject),
    jsonSchema: strictJsonObject({
      verb: { type: "string", enum: [...optionNames] },
      text: nullableJsonString(),
      minutes: nullableJsonInteger(),
    }),
    schemaName: "interact_reply",
  };
}
