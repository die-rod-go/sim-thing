import { config } from "../config";
import { readJsonEnumValues } from "../decision/schema-fields";
import type { JsonSchema } from "./types";

/* What the fake responder reads out of a request: schema enums and a few prompt lines. */

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The properties of one act in a decision reply's schema, where the act fields live. */
function readActProperties(schema: JsonSchema): JsonRecord | null {
  const acts = isRecord(schema.properties) ? schema.properties.acts : undefined;
  const items = isRecord(acts) ? acts.items : undefined;
  return isRecord(items) && isRecord(items.properties) ? items.properties : null;
}

/** The enum values of a property, at the top of the schema or in a decision's acts. */
export function readEnum(schema: JsonSchema, property: string): string[] {
  const properties = schema.properties;
  if (!isRecord(properties)) return [];
  const actProperties = readActProperties(schema);
  const field = properties[property] ?? actProperties?.[property];
  return readJsonEnumValues(field);
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

export interface ListedThing {
  name: string;
  verbs: string[];
  /** The holder it is listed under; null at the top level. */
  from: string | null;
}

const BULLET_PATTERN = /^( *)- (.*)$/;
const INDENT_WIDTH = 2;

/** "3 bread, wet (eat, drop)" → "bread": the name part, without its count or article. */
function readListedName(line: string, itemNames: string[]): string {
  const name = (line.split(/, | \(/)[0] ?? "").replace(/^(?:\d+|an?) /, "").trim();
  return (
    itemNames.find((itemName) => [itemName, `${itemName}s`, `${itemName}es`].includes(name)) ?? name
  );
}

/** "(attack, drop; lets you chop down the tree)" → the verbs before the tool uses. */
function readListedVerbs(line: string): string[] {
  const match = line.match(/\(([^()]*)\)$/);
  const [verbs] = (match?.[1] ?? "").split("; ");
  return (verbs ?? "").split(", ").filter(Boolean);
}

/** The bullet list that follows the line starting with `header`, nested bullets knowing their holder. */
export function parseThingList(prompt: string, header: string, itemNames: string[]): ListedThing[] {
  const lines = prompt.split("\n");
  const start = lines.findIndex((candidate) => candidate.startsWith(header));
  if (start === -1) return [];
  const holdersByDepth: string[] = [];
  const things: ListedThing[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(BULLET_PATTERN);
    if (match === null) break;
    const depth = (match[1] ?? "").length / INDENT_WIDTH;
    const text = match[2] ?? "";
    const name = readListedName(text, itemNames);
    holdersByDepth.length = depth;
    holdersByDepth[depth] = name;
    things.push({
      name,
      verbs: readListedVerbs(text),
      from: depth > 0 ? (holdersByDepth[depth - 1] ?? null) : null,
    });
  }
  return things;
}

/** The names opening each bullet under `header`: "- bakery: oven" → "bakery". */
function readBulletNames(prompt: string, header: string): string[] {
  const lines = prompt.split("\n");
  const start = lines.findIndex((candidate) => candidate.startsWith(header));
  if (start === -1) return [];
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const text = line.match(BULLET_PATTERN)?.[2];
    if (text === undefined) break;
    names.push((text.split(":")[0] ?? "").trim());
  }
  return names;
}

function groupVerbsByName(things: ListedThing[]): Map<string, string[]> {
  return new Map(
    things.filter((thing) => thing.from === null).map((thing) => [thing.name, thing.verbs]),
  );
}

export interface DecisionChoices {
  actions: string[];
  targets: Set<string>;
  /** What `item` may name: things carried, here or inside a holder. */
  items: string[];
  /** What `from` may name: holders that items can be taken out of. */
  holders: string[];
  /** Things listed inside a holder, here or carried, with their own verbs. */
  insideThings: ListedThing[];
  places: string[];
  currentPlace: string;
  /** Things here, named as `item`, with their verbs. */
  objects: Map<string, string[]>;
  /** Things carried, named as `item`, with their verbs. */
  heldItems: Map<string, string[]>;
  inSight: string[];
  /** Verbs that need nothing carried ("You can also: punch."). */
  itemlessVerbs: string[];
  isHungry: boolean;
  /** Someone is offering the agent something, waiting for its answer. */
  hasOffer: boolean;
}

export function readDecisionChoices(schema: JsonSchema, prompt: string): DecisionChoices {
  const targets = new Set(readEnum(schema, "target"));
  const items = readEnum(schema, "item");
  const hereThings = parseThingList(prompt, "Here:", items);
  const carriedThings = parseThingList(prompt, "You carry:", items);
  const heard = readLine(prompt, "In sight, would hear you: ") ?? "";
  return {
    actions: readEnum(schema, "action"),
    targets,
    items,
    holders: readEnum(schema, "from"),
    insideThings: [...hereThings, ...carriedThings].filter((thing) => thing.from !== null),
    places: readBulletNames(prompt, "## Places you know").filter((name) => targets.has(name)),
    currentPlace: (readLine(prompt, "You are at ") ?? "").replace(/^the /, "").replace(/\.$/, ""),
    objects: groupVerbsByName(hereThings),
    heldItems: groupVerbsByName(carriedThings),
    inSight: heard
      .replace(/\.$/, "")
      .split(", ")
      .map((entry) => entry.replace(/ \(.*$/, "").trim())
      .filter((name) => targets.has(name)),
    itemlessVerbs: (readLine(prompt, "You can also: ") ?? "")
      .replace(/\.$/, "")
      .split(", ")
      .filter(Boolean),
    hasOffer: prompt.includes(config.llm.fakeResponder.offerMarker),
    // Settled needs are listed under Now; pressing ones get their own sentence at the end.
    isHungry: config.llm.fakeResponder.hungryWords.some(
      (word) =>
        readLineAfter(prompt, "It is ").includes(word) || prompt.includes(`You are ${word}:`),
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
