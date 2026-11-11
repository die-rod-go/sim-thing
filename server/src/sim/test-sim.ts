import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildItemCatalog,
  parseItemFile,
  type Agent,
  type Entity,
  type ItemCatalog,
  type PersonalityChange,
  type Position,
} from "@village/shared";
import { config } from "../config";
import type { LlmCallDraft } from "../llm/call-structured";
import { FakeLlmClient, type FakeResponder } from "../llm/fake-llm-client";
import { buildLlmStack, type LlmStack } from "../llm/llm-stack";
import { InMemoryTokenUsageStore } from "../llm/token-budget";
import type { LlmRequest } from "../llm/types";
import { CONVERSATION_SUMMARY_SCHEMA_NAME } from "../memory/conversation-summary";
import { buildSeededWorld, loadSeedFile, type SeededWorld } from "../seeds";
import { findPlaceAt, loadWorldMap } from "../world/map-loader";
import { createNoReflectionHook } from "./reflection-hook";
import { createReflectionHook } from "./reflection-passes";
import { createDecisionStrategy } from "./tick-pipeline";
import { findAgent, replaceAgent } from "./world-access";
import { createWorldState, type TickResult, type WorldState } from "./world-state";

/* Test helpers: a real map and seed world driven by a fake LLM. Not used by the running sim. */

const repositoryRoot = resolve(import.meta.dirname, "../../..");

export function loadTestMap() {
  return loadWorldMap(resolve(repositoryRoot, config.server.mapPath));
}

/** The project's `items.json`: the verbs and definitions the map's objects need. */
export function loadTestItems(): ItemCatalog {
  const json: unknown = JSON.parse(
    readFileSync(resolve(repositoryRoot, config.server.itemsPath), "utf8"),
  );
  return buildItemCatalog(parseItemFile(json));
}

/** No items at all, for tests whose world holds none. */
export function buildEmptyItems(): ItemCatalog {
  return buildItemCatalog(
    parseItemFile({ components: {}, person: { properties: [] }, definitions: [], verbs: [] }),
  );
}

/** A world with no agents, entities or memories beyond those given. */
export function buildEmptySeededWorld(seeded: Partial<SeededWorld> = {}): SeededWorld {
  return { agents: [], memories: [], entities: [], nextEntityId: 1, ...seeded };
}

/** A placed map object by its label ("bakery door"). */
export function findEntityByLabel(state: WorldState, label: string): Entity {
  const entity = state.entities.find((candidate) => candidate.label === label);
  if (!entity) throw new Error(`The map has no "${label}"`);
  return entity;
}

/** A fixed cast, so tests do not change when someone edits the project seed file. */
export function loadTestSeeds() {
  return loadSeedFile(resolve(import.meta.dirname, "test-seeds.json"));
}

/** Who a prompt is for: every prompt opens with "You are <name>," or "You are <name>.". */
export function findPromptAgentName(request: LlmRequest): string {
  const prompt = "prompt" in request ? request.prompt : (request.messages[0]?.content ?? "");
  return /^You are ([^,.]+)[,.]/.exec(prompt)?.[1] ?? "";
}

export function promptOf(request: LlmRequest): string {
  return "prompt" in request
    ? request.prompt
    : request.messages.map((message) => message.content).join("\n");
}

/** A decision reply with the required fields filled in. */
export function decisionReply(fields: Record<string, unknown>): string {
  return JSON.stringify({ thought: "Thinking it over.", intention: "getting on", ...fields });
}

export type AgentScript = (request: LlmRequest, callIndex: number) => string | undefined;

export const DEFAULT_CONVERSATION_SUMMARY = "I talked with the people nearby.";

/**
 * Replies per agent name; anyone unscripted (or a script returning undefined) waits a long time.
 * Conversation summary calls get a fixed summary, so scripts only deal with decisions.
 */
export function scriptByAgent(scripts: Record<string, AgentScript>): FakeResponder {
  return (request, callIndex) => {
    if (request.schemaName === CONVERSATION_SUMMARY_SCHEMA_NAME) {
      return JSON.stringify({ summary: DEFAULT_CONVERSATION_SUMMARY });
    }
    const reply = scripts[findPromptAgentName(request)]?.(request, callIndex);
    return reply ?? decisionReply({ action: "wait", minutes: config.decision.maxWaitMinutes });
  };
}

export interface TestSim {
  state: WorldState;
  client: FakeLlmClient;
  llm: LlmStack;
  records: LlmCallDraft[];
  results: TickResult[];
  advance(ticks?: number): Promise<TickResult[]>;
  placeAgent(agentId: string, pos: Position): void;
  agent(agentId: string): Agent;
}

export interface TestSimOptions {
  responder: FakeResponder;
  /** Keep only these seed agents (all when omitted). */
  agentIds?: string[];
  /** Runs the real reflection passes, handing personality changes here; off when omitted. */
  reflection?: (change: Omit<PersonalityChange, "id">) => void;
  dailyTokenBudget?: number;
  /** Runs decisions in the background, as the live sim does; off (each tick waits) when omitted. */
  shouldDecideInBackground?: boolean;
}

export function createTestSim(options: TestSimOptions): TestSim {
  const map = loadTestMap();
  const items = loadTestItems();
  const state = createWorldState(map, buildSeededWorld(loadTestSeeds(), map, items), items);
  if (options.agentIds) {
    const kept = new Set(options.agentIds);
    state.agents = state.agents.filter((agent) => kept.has(agent.id));
    state.memoryStore.replaceAll(
      state.memoryStore.all().filter((memory) => kept.has(memory.agentId)),
    );
  }
  const records: LlmCallDraft[] = [];
  const client = new FakeLlmClient(options.responder);
  const llm = buildLlmStack({
    provider: "fake",
    client,
    tokenUsageStore: new InMemoryTokenUsageStore(),
    dailyTokenBudget: options.dailyTokenBudget ?? Number.MAX_SAFE_INTEGER,
    // The 1-based position in the list stands in for the llm_calls row id.
    recordLlmCall: (record) => records.push(record),
    pause: () => Promise.resolve(),
  });
  const advanceTick = createDecisionStrategy({
    callStructured: llm.callStructured,
    shouldDecideInBackground: options.shouldDecideInBackground,
    reflectionHook: options.reflection
      ? createReflectionHook({
          callStructured: llm.callStructured,
          recordPersonalityChange: options.reflection,
        })
      : createNoReflectionHook(),
  });
  const results: TickResult[] = [];
  return {
    state,
    client,
    llm,
    records,
    results,
    async advance(ticks = 1) {
      const produced: TickResult[] = [];
      for (let count = 0; count < ticks; count += 1) {
        const result = await advanceTick(state);
        state.tick += 1;
        produced.push(result);
        results.push(result);
      }
      return produced;
    },
    placeAgent(agentId, pos) {
      const agent = findAgent(state, agentId);
      const place = findPlaceAt(state.map, pos);
      replaceAgent(state, { ...agent, pos: { ...pos }, place });
      const runtime = state.agentRuntimes[agentId];
      if (runtime && !runtime.visitedPlaces.includes(place)) runtime.visitedPlaces.push(place);
    },
    agent: (agentId) => findAgent(state, agentId),
  };
}
