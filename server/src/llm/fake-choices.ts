import { config } from "../config";
import { readJsonEnumValues } from "../decision/schema-fields";
import type { JsonSchema } from "./types";

/* What the fake responder reads out of a request: schema enums and a few prompt lines. */

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readEnum(schema: JsonSchema, property: string): string[] {
  const properties = schema.properties;
  if (!isRecord(properties)) return [];
  return readJsonEnumValues(properties[property]);
}

export function readLine(prompt: string, prefix: string): string | null {
  const line = prompt.split("\n").find((candidate) => candidate.startsWith(prefix));
  return line === undefined ? null : line.slice(prefix.length).trim();
}

/** The line after the prompt line starting with `prefix`: the status line follows "It is ...". */
export function readLineAfter(prompt: string, prefix: string): string {
  const lines = prompt.split("\n");
  const index = lines.findIndex((candidate) => candidate.startsWith(prefix));
  return index === -1 ? "" : (lines[index + 1] ?? "");
}

/** "oven (bake bread), 3 bread (eat), a knife (attack)" → names with their verbs. */
export function parseNamedUses(text: string | null): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  if (text === null) return uses;
  for (const match of text.matchAll(/(?:^|, )(?:\d+ |an? )?([^,()]+?) \(([^)]*)\)/g)) {
    const name = match[1]?.trim();
    const verbList = (match[2] ?? "").split("; ")[0] ?? "";
    if (name) uses.set(name, verbList.split(", ").filter(Boolean));
  }
  return uses;
}
export interface DecisionChoices {
  actions: string[];
  targets: Set<string>;
  /** What `item` may name: things carried. */
  items: string[];
  places: string[];
  currentPlace: string;
  /** Things here, named as `target`, with their verbs. */
  objects: Map<string, string[]>;
  /** Things carried, named as `item`, with their verbs. */
  heldItems: Map<string, string[]>;
  inSight: string[];
  /** Verbs that need nothing carried ("You can also: punch."). */
  itemlessVerbs: string[];
  isHungry: boolean;
}
export function readDecisionChoices(schema: JsonSchema, prompt: string): DecisionChoices {
  const targets = new Set(readEnum(schema, "target"));
  const heard = readLine(prompt, "In sight, would hear you: ") ?? "";
  return {
    actions: readEnum(schema, "action"),
    targets,
    items: readEnum(schema, "item"),
    places: (readLine(prompt, "Places you know: ") ?? "")
      .split(", ")
      .filter((name) => targets.has(name)),
    currentPlace: (readLine(prompt, "You are at the ") ?? "").replace(/\.$/, ""),
    objects: parseNamedUses(readLine(prompt, "Here: ")),
    heldItems: parseNamedUses(readLine(prompt, "You carry: ")),
    inSight: heard
      .replace(/\.$/, "")
      .split(", ")
      .map((entry) => entry.replace(/ \(.*$/, "").trim())
      .filter((name) => targets.has(name)),
    itemlessVerbs: (readLine(prompt, "You can also: ") ?? "")
      .replace(/\.$/, "")
      .split(", ")
      .filter(Boolean),
    isHungry: config.llm.fakeResponder.hungryWords.some((word) =>
      readLineAfter(prompt, "It is ").includes(word),
    ),
  };
}

/**
 * Something carried that can be eaten, when the status says the agent is hungry. Not mid-action,
 * so a meal in progress isn't cancelled for another.
 */
export function findMealToEat(choices: DecisionChoices): string | null {
  if (!choices.isHungry || !choices.actions.includes("interact")) return null;
  if (choices.actions.includes("continue")) return null;
  const { eatVerb } = config.llm.fakeResponder;
  const meal = [...choices.heldItems].find(([, verbs]) => verbs.includes(eatVerb));
  return meal?.[0] ?? null;
}
