import { z } from "zod";
import { renderTemplate } from "../llm/templates";
import type { ReplySchemas } from "./replySchema";
import {
  displayNameEnum,
  dropEmptyFields,
  nullableJsonInteger,
  nullableJsonString,
  strictJsonObject,
} from "./schemaFields";

export interface InteractOption {
  name: string;
  /** e.g. "needs 2 wheat and 1 wood; you have no wood". */
  description: string;
}

export interface InteractPromptInput {
  agentName: string;
  objectName: string;
  options: InteractOption[];
  intention: string;
}

export interface InteractReply {
  interaction: string;
  text?: string;
  minutes?: number;
}

/** The second call of a two-step interact: which of the object's interactions to use. */
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
      intention: input.intention || "nothing in particular",
      options,
    },
    promptsDirectory,
  );
}

export function buildInteractReplySchema(optionNames: string[]): ReplySchemas<InteractReply> {
  const replyObject = z.object({
    interaction: displayNameEnum(optionNames, "interaction"),
    text: z.string().trim().optional(),
    minutes: z.number().positive().optional(),
  });
  return {
    schema: z.preprocess(dropEmptyFields, replyObject),
    jsonSchema: strictJsonObject({
      interaction: { type: "string", enum: [...optionNames] },
      text: nullableJsonString(),
      minutes: nullableJsonInteger(),
    }),
    schemaName: "interact_reply",
  };
}
