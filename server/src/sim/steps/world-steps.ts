import { config } from "../../config";
import { applyNeedEffects } from "../../economy/needs";
import { createThingEvent, type ThingRef } from "../../items/things";
import { resolveNumber, resolveText, scopeOf } from "../../items/values";
import { isDead } from "../../status/health";
import { getAgentRuntime, requestDecision } from "../agent-runtime";
import { broadcastEvent } from "../event-broadcast";
import { sendStimulus } from "../rule-engine";
import { findAgent, markAgentChanged, rememberBriefly, replaceAgent } from "../world-access";
import { findStepThings } from "./step-roles";
import { DONE, type StepHandler, type StepRun } from "./step-run";

/** Sends the stimulus to each thing, firing the `stimulus` rules that match it. */
export const sendStep: StepHandler<"send"> = {
  isVerbOnly: false,
  run(run, step) {
    const stimulus = resolveText(scopeOf(run), step.stimulus);
    for (const thing of findStepThings(run, step.on ?? "self")) sendStimulus(run, thing, stimulus);
    return DONE;
  },
};

/** A one-off sound from where each thing is (a crash, a creak of hinges). */
export const soundStep: StepHandler<"sound"> = {
  isVerbOnly: false,
  run(run, step) {
    const { state, result } = run.context;
    const loudness = resolveNumber(scopeOf(run), step.loudness);
    for (const thing of findStepThings(run, step.on ?? "self")) {
      const event = createThingEvent(state, thing, {
        kind: "sound",
        description: config.steps.soundDescription,
        loudness,
      });
      if (event !== null) broadcastEvent(state, event, result);
    }
    return DONE;
  },
};

function findLivingAgentId(run: StepRun, thing: ThingRef): string | null {
  if (thing.kind !== "agent") return null;
  return isDead(findAgent(run.context.state, thing.agentId)) ? null : thing.agentId;
}

/**
 * An `announced` event whose subject is the thing, seen by whoever sees it unless private. A
 * living agent's own body is that agent's own: they remember it in the first person (when nobody
 * else's event would have told them) and get an urgent decision.
 */
export const announceStep: StepHandler<"announce"> = {
  isVerbOnly: false,
  run(run, step) {
    const { state, result } = run.context;
    for (const thing of findStepThings(run, step.on ?? "self")) {
      const agentId = findLivingAgentId(run, thing);
      if (!step.isPrivate) {
        const event = createThingEvent(state, thing, { kind: "announced", description: step.text });
        if (event !== null) broadcastEvent(state, event, result);
      } else if (agentId !== null) {
        rememberBriefly(state, agentId, `I ${step.text}`);
      }
      if (agentId !== null) {
        requestDecision(getAgentRuntime(state, agentId), `I ${step.text}`, true);
      }
    }
    return DONE;
  },
};

/** Other agents whose verb run is using the same thing: players at the card table. */
function countOthersUsingSameItem(run: StepRun, agentId: string): number {
  const [itemId] = run.verbRun?.itemIds ?? [];
  if (itemId === undefined) return 0;
  const { state } = run.context;
  return state.agents.filter(
    (other) =>
      other.id !== agentId &&
      getAgentRuntime(state, other.id).verbRun?.itemIds.includes(itemId) === true,
  ).length;
}

/** Raises or lowers a living agent's need; `perOtherUser` adds more for each other agent at the same thing. */
export const changeNeedStep: StepHandler<"change_need"> = {
  isVerbOnly: false,
  run(run, step) {
    const { state, result } = run.context;
    const scope = scopeOf(run);
    const things = findStepThings(run, step.on ?? "self");
    if (things.length === 0) return DONE;
    const base = resolveNumber(scope, step.amount);
    const perOtherUser =
      step.perOtherUser === undefined ? 0 : resolveNumber(scope, step.perOtherUser);
    for (const thing of things) {
      const agentId = findLivingAgentId(run, thing);
      if (agentId === null) continue;
      const amount = base + perOtherUser * countOthersUsingSameItem(run, agentId);
      const agent = findAgent(state, agentId);
      replaceAgent(state, {
        ...agent,
        needs: applyNeedEffects(agent.needs, { [step.need]: amount }),
      });
      markAgentChanged(result, agentId);
    }
    return DONE;
  },
};
