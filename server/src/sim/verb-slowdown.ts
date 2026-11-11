import type { Agent, Verb } from "@village/shared";
import { config } from "../config";
import { fillStatusWords, findSlowdown, type Impairment } from "../status/impairment";
import { getAgentRuntime, type VerbRun } from "./agent-runtime";
import type { AimedPhrases } from "./verb-hits";
import { rememberBriefly } from "./world-access";
import type { WorldState } from "./world-state";

/** Only a verb with a length can drag on; one that runs until stopped (sleep) can't. */
export function findVerbSlowdown(agent: Agent, verb: Verb): Impairment | null {
  return verb.minutes === null ? null : findSlowdown(agent);
}

/** Tells the agent, as its verb starts, that it will take longer and why. */
export function noteSlowStart(state: WorldState, agentId: string): void {
  const slowedBy = getAgentRuntime(state, agentId).verbRun?.slowedBy;
  if (slowedBy === undefined) return;
  rememberBriefly(state, agentId, fillStatusWords(config.impairment.slowStartText, slowedBy));
}

/** Only the agent itself knows why it was slow: "finished chopping wood, slowly, because I was exhausted". */
export function addSlowFinish(phrases: AimedPhrases, run: VerbRun): AimedPhrases {
  if (run.slowedBy === undefined) return phrases;
  const slowly = fillStatusWords(config.impairment.slowFinishText, run.slowedBy);
  return {
    ...phrases,
    actorDescription: `${phrases.actorDescription ?? phrases.description}, ${slowly}`,
  };
}
