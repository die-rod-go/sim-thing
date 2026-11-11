import { TRAIT_NAMES } from "@village/shared";
import { config } from "../config";
import { readJsonEnumValues } from "../decision/schema-fields";
import { SeededRandom } from "../random";
import type { FakeResponder } from "./fake-llm-client";
import { toMessages, type JsonSchema, type LlmRequest } from "./types";

/*
 * A stand-in for the LLM when running offline (`LLM_PROVIDER=fake`) and in soak tests. It reads
 * what is valid from the request's JSON schema (action and target enums) and a few prompt lines,
 * and returns plausible, valid replies. It is seeded, so a run with the same calls is repeatable.
 */

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEnum(schema: JsonSchema, property: string): string[] {
  const properties = schema.properties;
  if (!isRecord(properties)) return [];
  return readJsonEnumValues(properties[property]);
}

function readLine(prompt: string, prefix: string): string | null {
  const line = prompt.split("\n").find((candidate) => candidate.startsWith(prefix));
  return line === undefined ? null : line.slice(prefix.length).trim();
}

/** The line after the prompt line starting with `prefix`: the status line follows "It is ...". */
function readLineAfter(prompt: string, prefix: string): string {
  const lines = prompt.split("\n");
  const index = lines.findIndex((candidate) => candidate.startsWith(prefix));
  return index === -1 ? "" : (lines[index + 1] ?? "");
}

/** "oven (bake bread), 3 bread (eat), a knife (attack)" → names with their verbs. */
function parseNamedUses(text: string | null): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  if (text === null) return uses;
  for (const match of text.matchAll(/(?:^|, )(?:\d+ |an? )?([^,()]+?) \(([^)]*)\)/g)) {
    const name = match[1]?.trim();
    const verbList = (match[2] ?? "").split("; ")[0] ?? "";
    if (name) uses.set(name, verbList.split(", ").filter(Boolean));
  }
  return uses;
}

function pickWeighted(random: SeededRandom, weights: [string, number][]): string {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random.next() * total;
  for (const [value, weight] of weights) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return weights[weights.length - 1]?.[0] ?? "wait";
}

interface DecisionChoices {
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
  isHungry: boolean;
}

function readDecisionChoices(schema: JsonSchema, prompt: string): DecisionChoices {
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
    isHungry: config.llm.fakeResponder.hungryWords.some((word) =>
      readLineAfter(prompt, "It is ").includes(word),
    ),
  };
}

/**
 * Something carried that can be eaten, when the status says the agent is hungry. Not mid-action,
 * so a meal in progress isn't cancelled for another.
 */
function findFoodToEat(choices: DecisionChoices): string | null {
  if (!choices.isHungry || !choices.actions.includes("interact")) return null;
  if (choices.actions.includes("continue")) return null;
  const { eatVerb } = config.llm.fakeResponder;
  const food = [...choices.heldItems].find(([, verbs]) => verbs.includes(eatVerb));
  return food?.[0] ?? null;
}

/** Fills `target` for something here or `item` for something carried, and a verb it offers. */
function buildInteractFields(
  random: SeededRandom,
  choices: DecisionChoices,
): { fields: JsonRecord; usedName: string } | null {
  const tuning = config.llm.fakeResponder;
  const here = [...choices.objects].filter(
    ([name, verbs]) => choices.targets.has(name) && verbs.length > 0,
  );
  const carried = [...choices.heldItems].filter(([, verbs]) => verbs.length > 0);
  const usable = [
    ...here.map(([name, verbs]) => ({ field: "target", name, verbs })),
    ...carried.map(([name, verbs]) => ({ field: "item", name, verbs })),
  ];
  if (usable.length === 0) return null;
  const chosen = random.pick(usable);
  const verb = random.next() < tuning.omitVerbChance ? null : random.pick(chosen.verbs);
  return { fields: { [chosen.field]: chosen.name, verb }, usedName: chosen.name };
}

function buildDecisionReply(random: SeededRandom, choices: DecisionChoices): JsonRecord {
  const tuning = config.llm.fakeResponder;
  const reply: JsonRecord = {
    thought: "I take stock and pick something sensible to do.",
    intention: "getting on with my day",
    say: null,
    volume: null,
    action: "wait",
    target: null,
    verb: null,
    text: null,
    item: null,
    amount: null,
    query: null,
    minutes: null,
    note: null,
    mood: null,
  };
  const food = findFoodToEat(choices);
  if (food !== null) {
    const intention = "eating something before I go hungry";
    return { ...reply, action: "interact", item: food, verb: tuning.eatVerb, intention };
  }
  if (choices.actions.includes("continue") && random.next() < tuning.continueChance) {
    return { ...reply, action: "continue" };
  }
  const interact = buildInteractFields(random, choices);
  const otherPlaces = choices.places.filter((place) => place !== choices.currentPlace);
  const weights = Object.entries(tuning.actionWeights).filter(([action]) => {
    if (!choices.actions.includes(action)) return false;
    if (action === "interact") return interact !== null;
    if (action === "walk_to") return otherPlaces.length > 0;
    if (action === "give") return choices.inSight.length > 0 && choices.items.length > 0;
    return true;
  });
  const action = pickWeighted(random, weights);
  if (random.next() < tuning.sayChance) {
    const line = random.pick(tuning.lines);
    const say = choices.inSight.length > 0 ? `${random.pick(choices.inSight)}! ${line}` : line;
    Object.assign(reply, { say, volume: "normal" });
  }
  if (action === "interact" && interact !== null) {
    const text = random.pick(tuning.lines);
    return {
      ...reply,
      action,
      ...interact.fields,
      text,
      intention: `using the ${interact.usedName}`,
    };
  }
  if (action === "walk_to") {
    const target = random.pick(otherPlaces);
    return { ...reply, action, target, intention: `heading to the ${target}` };
  }
  if (action === "give") {
    const target = random.pick(choices.inSight);
    return { ...reply, action, target, item: random.pick(choices.items), amount: 1 };
  }
  if (action === "recall") {
    return {
      ...reply,
      action,
      query: random.pick(choices.places.length > 0 ? choices.places : ["village"]),
    };
  }
  const { min, max } = tuning.waitMinutes;
  return { ...reply, action: "wait", minutes: random.nextInt(min, max) };
}

/** A minimal valid value for any JSON schema: first enum value, empty arrays, short strings. */
export function sampleFromJsonSchema(schema: unknown, random: SeededRandom): unknown {
  if (!isRecord(schema)) return null;
  if (Array.isArray(schema.enum)) return schema.enum.find((value) => value !== null) ?? null;
  if (Array.isArray(schema.anyOf)) {
    const nonNullOption = schema.anyOf.find(
      (option: unknown) => isRecord(option) && option.type !== "null",
    );
    return sampleFromJsonSchema(nonNullOption, random);
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("object") && isRecord(schema.properties)) {
    return Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        sampleFromJsonSchema(value, random),
      ]),
    );
  }
  if (types.includes("array")) {
    const minItems = typeof schema.minItems === "number" ? schema.minItems : 0;
    return Array.from({ length: minItems }, () => sampleFromJsonSchema(schema.items, random));
  }
  if (types.includes("string")) return random.pick(config.llm.fakeResponder.lines);
  if (types.includes("integer") || types.includes("number")) {
    return typeof schema.minimum === "number" ? schema.minimum : 1;
  }
  if (types.includes("boolean")) return false;
  return null;
}

function promptText(request: LlmRequest): string {
  return toMessages(request)
    .map((message) => message.content)
    .join("\n");
}

type FakeAnswer = (request: LlmRequest, random: SeededRandom) => unknown;

const BUILT_IN_ANSWERS: Record<string, FakeAnswer> = {
  decision_reply: (request, random) =>
    buildDecisionReply(random, readDecisionChoices(request.jsonSchema ?? {}, promptText(request))),
  interact_reply: (request, random) => ({
    verb: random.pick(readEnum(request.jsonSchema ?? {}, "verb")),
    text: random.pick(config.llm.fakeResponder.lines),
    minutes: null,
  }),
  morning_reply: () => ({
    dailyPlan: "Work in the morning, eat at midday, see who is around in the afternoon.",
    mood: "ready for the day",
  }),
  night_reply: () => ({
    summary: "I went about my work and talked with a few people.",
    moodEntry: "tired but settled",
    insights: [{ text: "Keeping busy makes the day go well." }],
    peopleNotes: [],
  }),
  conversation_summary_reply: () => ({
    summary: "I chatted with the people around me about the day's work. Nothing was settled.",
  }),
  weekly_reply: (_request, random) => ({
    traitChanges: [
      {
        trait: random.pick(TRAIT_NAMES),
        delta: (random.next() < 0.5 ? -1 : 1) * config.traits.weeklyDeltaClamp,
        reason: "This week I acted a little differently from how I used to.",
      },
    ],
    core: null,
    selfImage: null,
    goals: [],
  }),
};

/**
 * Answers decision, interact and reflection calls with plausible valid replies, and any other
 * structured call with a minimal valid object. `answerOverrides` replaces answers per schema name.
 */
export function createFakeResponder(
  answerOverrides: Record<string, FakeAnswer> = {},
  seed: number = config.llm.fakeResponder.seed,
): FakeResponder {
  const random = new SeededRandom(seed);
  return (request) => {
    const prompt = promptText(request);
    const schemaName = request.schemaName ?? "";
    const answerFor = answerOverrides[schemaName] ?? BUILT_IN_ANSWERS[schemaName];
    const answer = answerFor
      ? answerFor(request, random)
      : sampleFromJsonSchema(request.jsonSchema ?? {}, random);
    const text = JSON.stringify(answer);
    return {
      text,
      promptTokens: Math.ceil(prompt.length / config.decision.charsPerToken),
      completionTokens: Math.ceil(text.length / config.decision.charsPerToken),
    };
  };
}
