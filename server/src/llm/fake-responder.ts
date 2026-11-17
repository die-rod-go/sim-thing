import { TRAIT_NAMES } from "@village/shared";
import { config } from "../config";
import { isRecord, readDecisionChoices, readEnum } from "./fake-choices";
import { buildDecisionReply } from "./fake-decision";
import { SeededRandom } from "../random";
import type { FakeResponder } from "./fake-llm-client";
import { toMessages, type LlmRequest } from "./types";

/*
 * A stand-in for the LLM when running offline (`LLM_PROVIDER=fake`) and in soak tests. It reads
 * what is valid from the request's JSON schema (action and target enums) and a few prompt lines,
 * and returns plausible, valid replies. It is seeded, so a run with the same calls is repeatable.
 */
export interface FakeResponderOptions {
  /** Verbs with a hit roll: picked only rarely (`attackWeight`), at someone in sight. */
  hitRollVerbNames?: readonly string[];
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

function buildBuiltInAnswers(hitRollVerbs: ReadonlySet<string>): Record<string, FakeAnswer> {
  return {
    decision_reply: (request, random) =>
      buildDecisionReply(
        random,
        readDecisionChoices(request.jsonSchema ?? {}, promptText(request)),
        hitRollVerbs,
      ),
    interact_reply: (request, random) => ({
      verb: random.pick(readEnum(request.jsonSchema ?? {}, "verb")),
      text: random.pick(config.llm.fakeResponder.lines),
      minutes: null,
    }),
    day_plan_reply: (_request, random) => ({
      agenda: [
        { text: "Get on with the day's work", hour: null },
        { text: random.pick(config.llm.fakeResponder.lines), hour: null },
      ],
      longTermGoals: null,
    }),
    reflection_reply: (_request, random) => ({
      people: [],
      longTermGoals: [
        { goal: "Keep my work going", reason: "It is my living", progress: "Steady." },
      ],
      traitChanges: [
        {
          trait: random.pick(TRAIT_NAMES),
          delta: (random.next() < 0.5 ? -1 : 1) * config.traits.passDeltaClamp,
          reason: "Lately I acted a little differently from how I used to.",
        },
      ],
      profession: null,
      core: null,
      selfImage: null,
      keyMemories: null,
      agenda: null,
    }),
    reality_reply: () => ({ noticed: "", thought: null }),
    episode_reply: (_request, random) => ({
      summary: random.pick(config.llm.fakeResponder.lines),
      keyMemory: null,
    }),
  };
}

/**
 * Answers decision, interact and pass calls with plausible valid replies, and any other
 * structured call with a minimal valid object. `answerOverrides` replaces answers per schema name.
 */
export function createFakeResponder(
  answerOverrides: Record<string, FakeAnswer> = {},
  seed: number = config.llm.fakeResponder.seed,
  options: FakeResponderOptions = {},
): FakeResponder {
  const random = new SeededRandom(seed);
  const builtInAnswers = buildBuiltInAnswers(new Set(options.hitRollVerbNames ?? []));
  return (request) => {
    const prompt = promptText(request);
    const schemaName = request.schemaName ?? "";
    const answerFor = answerOverrides[schemaName] ?? builtInAnswers[schemaName];
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
