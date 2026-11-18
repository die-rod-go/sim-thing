import { config } from "../config";
import type { RejectedReply } from "../llm/call-structured";

/** An act's field that names something in the world; a rejection there means it wasn't found. */
const NAMING_FIELD_PATTERN = /^acts\.(\d+)\.(target|item|from)$/;

function readNamedText(value: unknown, actIndex: number, field: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const acts: unknown = Reflect.get(value, "acts");
  if (!Array.isArray(acts)) return null;
  const act: unknown = acts[actIndex];
  if (typeof act !== "object" || act === null) return null;
  const text: unknown = Reflect.get(act, field);
  return typeof text === "string" && text.trim() !== "" ? text.trim() : null;
}

/**
 * What the agent learns from a rejected reply that named something that isn't there: "I looked
 * for nail box, but there was nothing and no one by that name here or on me". Other rejections (bad
 * JSON, text too long) are the model's slips, not the agent's, and teach nothing.
 */
export function describeUnknownNames(rejected: RejectedReply): string[] {
  return rejected.fields.flatMap((path) => {
    const match = NAMING_FIELD_PATTERN.exec(path);
    if (match === null) return [];
    const name = readNamedText(rejected.value, Number(match[1]), match[2] ?? "");
    return name === null ? [] : [config.decision.unknownNameTexts.thing.split("{name}").join(name)];
  });
}
