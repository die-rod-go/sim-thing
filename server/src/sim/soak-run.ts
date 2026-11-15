import type { WorldEventKind } from "@village/shared";
import { config } from "../config";
import { isAsleep } from "../economy/sleep";
import { createFakeResponder } from "../llm/fake-responder";
import { listHitRollVerbNames } from "../items/verb-offers";
import { createTestSim, loadTestItems, type TestSim } from "./test-sim";
import { getAgentMemory } from "./world-access";

/** Events that only a decision can start, so each needs an LLM call by the actor on that tick. */
const DECIDED_EVENT_KINDS: readonly WorldEventKind[] = ["said", "walk_started", "gave"];

export interface SoakReport {
  ticks: number;
  llmCalls: number;
  events: number;
  /** Human-readable problems; empty when the run is healthy. */
  problems: string[];
  /** Who died and how; deaths are reported, not counted as problems. */
  deaths: string[];
  sim: TestSim;
}

export interface SoakOptions {
  ticks: number;
  /** Called every sim-hour, e.g. for progress output. */
  onHour?: (tick: number) => void;
}

const ticksPerHour = 60 / config.clock.minutesPerTick;

/**
 * Runs all seed agents with the fake LLM responder and checks the brief's done-when conditions:
 * no crash, no awake agent left without an action or decision for over a sim-hour, every decided
 * act traceable to a stored LLM call, every living agent's stream and episodes within their limits, and no reaction chain
 * cut off at the depth cap. Any thrown error ends the run with that error.
 */
export async function runSoak(options: SoakOptions): Promise<SoakReport> {
  const sim = createTestSim({
    shouldRunFirstGoalsPass: true,
    responder: createFakeResponder({}, undefined, {
      hitRollVerbNames: listHitRollVerbNames(loadTestItems()),
    }),
  });
  sim.client.requests.length = 0;
  const problems: string[] = [];
  const idleTicks = new Map<string, number>();
  const callTicksByAgent = new Map<string, Set<number>>();
  let llmCalls = 0;
  let eventCount = 0;
  for (let count = 0; count < options.ticks; count += 1) {
    const [result] = await sim.advance();
    if (!result) throw new Error("advance returned no result");
    sim.results.length = 0;
    sim.client.requests.length = 0;
    for (const record of sim.records) {
      const ticks = callTicksByAgent.get(record.agentId) ?? new Set<number>();
      ticks.add(record.tick);
      callTicksByAgent.set(record.agentId, ticks);
    }
    llmCalls += sim.records.length;
    // Prompts are large; keep only what the checks need so long runs stay small.
    sim.records.length = 0;
    eventCount += result.events.length;
    problems.push(...result.ruleDepthCapHits);
    for (const event of result.events) {
      const isDecided = DECIDED_EVENT_KINDS.includes(event.kind);
      if (isDecided && !callTicksByAgent.get(event.actorId)?.has(event.tick)) {
        problems.push(`tick ${event.tick}: ${event.actorId} ${event.kind} without an LLM call`);
      }
    }
    for (const agent of sim.state.agents) {
      const isIdle = agent.currentAction === null && !isAsleep(agent) && agent.death === null;
      const idle =
        isIdle && !result.decidedAgentIds.includes(agent.id)
          ? (idleTicks.get(agent.id) ?? 0) + 1
          : 0;
      idleTicks.set(agent.id, idle);
      if (idle === ticksPerHour + 1)
        problems.push(`tick ${result.tick}: ${agent.id} idle for over an hour`);
    }
    if (sim.state.tick % ticksPerHour === 0) options.onHour?.(sim.state.tick);
  }
  for (const agent of sim.state.agents) {
    const memory = getAgentMemory(sim.state, agent.id);
    if (agent.death !== null) continue;
    if (memory.stream.length > config.memory.streamMax)
      problems.push(`${agent.id} has ${memory.stream.length} stream entries`);
    if (memory.episodes.length > config.memory.episodesMax)
      problems.push(`${agent.id} has ${memory.episodes.length} episodes`);
  }
  const deaths = sim.state.agents.flatMap((agent) =>
    agent.death ? [`tick ${agent.death.tick}: ${agent.id} ${agent.death.cause}`] : [],
  );
  return {
    ticks: options.ticks,
    llmCalls,
    events: eventCount,
    problems,
    deaths,
    sim,
  };
}
