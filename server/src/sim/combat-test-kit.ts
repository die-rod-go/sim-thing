import { buildItemCatalog, parseItemFile, type Entity, type Position } from "@village/shared";
import { createEntity } from "../items/entity-store";
import type { PendingVerb, UsedThing } from "./agent-runtime";
import { createNoReflectionHook } from "./reflection-hook";
import { createTestSim, scriptByAgent, type TestSim } from "./test-sim";
import type { TickContext } from "./tick-context";
import { startOrApproachVerb } from "./verb-approach";
import { finishRunningVerb } from "./verb-runner";
import { getAgentRuntime } from "./agent-runtime";
import { createEmptyTickResult } from "./world-state";

/** Open ground on the village square, side by side. */
export const SQUARE = { x: 19, y: 15 };
export const NEXT_TO_SQUARE = { x: 20, y: 15 };
export const BESIDE_SQUARE = { x: 19, y: 16 };

export function buildCombatSim(agentIds = ["mara", "tobias"]): TestSim {
  return createTestSim({ agentIds, responder: scriptByAgent({}) });
}

export function contextOf(sim: TestSim): TickContext {
  return {
    state: sim.state,
    result: createEmptyTickResult(sim.state.tick),
    dependencies: {
      callStructured: sim.llm.callStructured,
      reflectionHook: createNoReflectionHook(),
    },
  };
}

export function handOver(sim: TestSim, agentId: string, definitionId: string): Entity {
  return createEntity(sim.state, definitionId, { kind: "inventory", agentId });
}

/** Every roll of the seeded generator comes out as this value: 0 always hits, 0.99 misses. */
export function fixRolls(sim: TestSim, roll: number): void {
  sim.state.random.next = () => roll;
}

export function place(sim: TestSim, positions: Record<string, Position>): void {
  for (const [agentId, position] of Object.entries(positions)) sim.placeAgent(agentId, position);
}

/** Applies an interact as a decision would, then returns the context it ran in. */
export function aim(
  sim: TestSim,
  agentId: string,
  used: UsedThing,
  request: PendingVerb,
  targetName?: string,
): TickContext {
  const context = contextOf(sim);
  startOrApproachVerb(context, agentId, used, request, targetName);
  return context;
}

export function aimWith(
  sim: TestSim,
  agentId: string,
  entity: Entity,
  verb: string,
  targetName?: string,
): TickContext {
  return aim(sim, agentId, { kind: "entity", entityId: entity.id }, { verb }, targetName);
}

export function finish(sim: TestSim, agentId: string): TickContext {
  const context = contextOf(sim);
  finishRunningVerb(context, agentId);
  return context;
}

export function lastFailure(sim: TestSim, agentId: string): string | null {
  return getAgentRuntime(sim.state, agentId).lastFailure;
}

export function memoryTexts(sim: TestSim, agentId: string): string[] {
  return sim.state.memoryStore.listByAgent(agentId).map((memory) => memory.text);
}

/** The project's items plus extra verbs, for behavior the shipped content doesn't use. */
export function addVerbs(sim: TestSim, verbs: unknown[]): void {
  const file = sim.state.items.file;
  const parsed = parseItemFile({ ...file, verbs: [...file.verbs, ...verbs] });
  sim.state.items = buildItemCatalog(parsed);
}
