import type { Agent, Verb } from "@village/shared";
import { config } from "../config";
import {
  fillStatusWords,
  findSlowdown,
  readStatusView,
  type Impairment,
} from "../status/impairment";
import type { VerbRun } from "./agent-runtime";
import { appendToStream } from "./world-access";
import type { WorldState } from "./world-state";

/** Only a verb that waits can drag on; one that runs until stopped (sleep) can't. */
export function findVerbSlowdown(state: WorldState, agent: Agent, verb: Verb): Impairment | null {
  if (!verb.steps.some((step) => step.step === "wait")) return null;
  return findSlowdown(readStatusView(state.items, agent));
}

/** The run, marked with what slows it down: every `wait` it reaches takes that much longer. */
export function withSlowdown(verbRun: VerbRun, slowdown: Impairment | null): VerbRun {
  if (slowdown === null) return verbRun;
  return { ...verbRun, slowedBy: slowdown.statusWords, slowdownShare: slowdown.amount };
}

/** A `wait` of the run, stretched by its slowdown. */
export function stretchWaitMinutes(verbRun: VerbRun | null, minutes: number): number {
  return minutes * (1 + (verbRun?.slowdownShare ?? 0));
}

/** Tells the agent, as its verb starts, that it will take longer and why. */
export function noteSlowStart(state: WorldState, verbRun: VerbRun): void {
  if (verbRun.slowedBy === undefined) return;
  const text = fillStatusWords(config.impairment.slowStartText, verbRun.slowedBy);
  appendToStream(state, verbRun.agentId, text);
}

/** Only the agent itself knows why it was slow: "finished chopping wood, slowly, because I was exhausted". */
export function addSlowFinish<Phrases extends { description: string; actorDescription?: string }>(
  phrases: Phrases,
  verbRun: VerbRun,
): Phrases {
  if (verbRun.slowedBy === undefined) return phrases;
  const slowly = fillStatusWords(config.impairment.slowFinishText, verbRun.slowedBy);
  return {
    ...phrases,
    actorDescription: `${phrases.actorDescription ?? phrases.description}, ${slowly}`,
  };
}
