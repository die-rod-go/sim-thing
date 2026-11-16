import type { Entity, Position } from "@village/shared";
import { createEntity, describeEntityName } from "../../src/items/entity-store";
import type { ThingRef } from "../../src/items/things";
import { getAgentRuntime, type VerbChoice, type VerbRun } from "../../src/sim/agent-runtime";
import { contextOf } from "./combat-test-kit";
import type { TestSim } from "../../src/sim/test-sim";
import type { TickContext } from "../../src/sim/tick-context";
import { resumeRunningVerb, startVerbRun } from "../../src/sim/verb-runner";

/** What a test says about a verb; the rest comes from the entities, as resolution would fill it. */
export interface VerbStartOptions {
  items?: readonly Entity[];
  itemName?: string;
  target?: ThingRef;
  targetName?: string;
  from?: ThingRef;
  choice?: Partial<VerbChoice>;
}

export function findVerbIndex(sim: TestSim, verbName: string): number {
  const index = sim.state.items.verbs.findIndex((verb) => verb.name === verbName);
  if (index < 0) throw new Error(`No verb "${verbName}"`);
  return index;
}

/** Starts the named verb for the agent and returns the context it ran in. */
export function startVerb(
  sim: TestSim,
  agentId: string,
  verbName: string,
  options: VerbStartOptions = {},
): TickContext {
  const context = contextOf(sim);
  const items = options.items ?? [];
  const [first] = items;
  startVerbRun(context, agentId, {
    verbIndex: findVerbIndex(sim, verbName),
    itemIds: items.map((entity) => entity.id),
    itemName: options.itemName ?? (first ? describeEntityName(sim.state, first) : ""),
    from: options.from ?? null,
    target: options.target ?? null,
    targetName: options.targetName ?? null,
    choice: { amount: 1, ...options.choice },
  });
  return context;
}

/** Resumes the agent's verb as if its `wait` had just run out. */
export function resumeVerb(sim: TestSim, agentId: string): TickContext {
  const context = contextOf(sim);
  resumeRunningVerb(context, agentId);
  return context;
}

export function currentRun(sim: TestSim, agentId: string): VerbRun | null {
  return getAgentRuntime(sim.state, agentId).verbRun;
}

/** A verb run as saved between steps, for tests that set up an agent already mid-verb. */
export function buildRunRecord(
  sim: TestSim,
  agentId: string,
  verbName: string,
  item: Entity,
): VerbRun {
  return {
    userId: agentId,
    verbIndex: findVerbIndex(sim, verbName),
    verbName,
    itemIds: [item.id],
    itemName: describeEntityName(sim.state, item),
    from: null,
    target: null,
    targetName: null,
    choice: { amount: 1 },
    stepIndex: 1,
    isHit: null,
    snapshots: {},
    namedIds: {},
    itemHolderIds: {},
    touchedIds: [],
    made: {},
    hasWaited: true,
    firstWaitIndex: 0,
    startedAtTick: 0,
  };
}

/** A new entity of the definition on a tile of the square's map. */
export function placeEntity(sim: TestSim, definitionId: string, pos: Position): Entity {
  return createEntity(sim.state, definitionId, {
    kind: "tile",
    place: sim.agent("mara").place,
    pos,
  });
}
