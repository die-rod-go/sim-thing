import { config } from "../config";
import type { RejectedReply } from "../llm/call-structured";

/** Reply fields that name something in the world; a rejection there means the name wasn't found. */
const NAMING_FIELDS = ["target", "item", "from"] as const;

function readTextField(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const text: unknown = Reflect.get(value, field);
  return typeof text === "string" && text.trim() !== "" ? text.trim() : null;
}

/**
 * What the agent learns from a rejected reply that named something that isn't there: "I looked
 * for nail box, but there was nothing and no one by that name here or on me". Other rejections (bad
 * JSON, text too long) are the model's slips, not the agent's, and teach nothing.
 */
export function describeUnknownNames(rejected: RejectedReply): string[] {
  const lines: string[] = [];
  for (const field of NAMING_FIELDS) {
    if (!rejected.fields.includes(field)) continue;
    const name = readTextField(rejected.value, field);
    if (name === null) continue;
    lines.push(config.decision.unknownNameTexts.thing.split("{name}").join(name));
  }
  return lines;
}
