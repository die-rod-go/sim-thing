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
import { getAgentRuntime, requestDecision } from "./agent-runtime";
import { createNoReflectionHook } from "./reflection-hook";
import { createReflectionHook } from "./reflection-passes";
import { createDecisionStrategy } from "./tick-pipeline";
import { findAgent, replaceAgent } from "./world-access";
import { createWorldState, type TickResult, type WorldState } from "./world-state";

/*
 * Test helpers: a fixed map, item file and cast driven by a fake LLM. Not used by the running sim.
 * The fixtures are frozen copies, so editing the project's map or items.json does not break tests.
 */

/** Where the fixed test cast starts: their cottages, and Ilsa in the town square. */
const TEST_START_TILES = {
  mara: { x: 5, y: 4 },
  edwin: { x: 12, y: 4 },
  wren: { x: 19, y: 4 },
  tobias: { x: 26, y: 4 },
  bram: { x: 33, y: 4 },
  ilsa: { x: 19, y: 15 },
};

/** The test map, with start tiles for the test cast. */
export function loadTestMap() {
  const map = loadWorldMap(resolve(import.meta.dirname, "test-map.json"));
  return { ...map, startTiles: structuredClone(TEST_START_TILES) };
}

/** The test item file: the verbs and definitions the test map's objects need. */
export function loadTestItems(): ItemCatalog {
  const json: unknown = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "test-items.json"), "utf8"),
  );
  return buildItemCatalog(parseItemFile(json));
}

/** No items at all, for tests whose world holds none. */
export function buildEmptyItems(): ItemCatalog {
  return buildItemCatalog(
    parseItemFile({
      world: { agentBody: "person", agentHealth: "health.current" },
      components: {
        health: {
          fields: {
            max: { type: "number", min: 0 },
            current: { type: "number", min: 0, max: "max" },
          },
        },
      },
      definitions: [
        {
          id: "person",
          name: "person",
          glyph: { index: 2, color: "#ffffff" },
          components: { health: { max: 1, current: 1 } },
        },
      ],
      verbs: [],
    }),
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

/** Sets the agent waiting for `waitTicks` with an urgent decision pending, so it decides mid-action. */
export function interruptDuringWait(sim: TestSim, agentId: string, waitTicks: number): void {
  const agent = findAgent(sim.state, agentId);
  const endsAtTick = sim.state.tick + waitTicks;
  replaceAgent(sim.state, { ...agent, currentAction: { kind: "wait", endsAtTick } });
  requestDecision(getAgentRuntime(sim.state, agentId), "a test interruption", true);
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
  /** Caps how long idle agents' decisions hold a tick; no cap when omitted. */
  idleDecisionWaitMs?: number;
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
    idleDecisionWaitMs: options.idleDecisionWaitMs,
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
