import { applyNeedEffects } from "../../economy/needs";
import { resolveNumber } from "../../items/verb-numbers";
import { getAgentRuntime } from "../agent-runtime";
import { findAgent, markAgentChanged, replaceAgent } from "../world-access";
import {
  findEffectAgentId,
  findValueSources,
  type EffectHandler,
  type EffectRun,
} from "./effect-run";

/** Other agents whose verb run is using the same thing: players at the card table. */
function countOthersUsingSameThing(effectRun: EffectRun, agentId: string): number {
  const usedEntityId = effectRun.run?.usedEntityId ?? null;
  if (usedEntityId === null) return 0;
  const { state } = effectRun.context;
  return state.agents.filter(
    (other) =>
      other.id !== agentId &&
      getAgentRuntime(state, other.id).verbRun?.usedEntityId === usedEntityId,
  ).length;
}

/** Raises or lowers a need; `perOtherUser` adds more for each other agent at the same thing. */
export const changeNeedEffect: EffectHandler<"change_need"> = {
  apply(effectRun, effect) {
    const { state, result } = effectRun.context;
    const agentId = findEffectAgentId(effectRun, effect);
    if (agentId === null) return {};
    const sources = findValueSources(effectRun);
    const perOtherUser =
      effect.perOtherUser === undefined ? 0 : resolveNumber(effect.perOtherUser, sources);
    const amount =
      resolveNumber(effect.amount, sources) +
      perOtherUser * countOthersUsingSameThing(effectRun, agentId);
    const agent = findAgent(state, agentId);
    replaceAgent(state, {
      ...agent,
      needs: applyNeedEffects(agent.needs, { [effect.need]: amount }),
    });
    markAgentChanged(result, agentId);
    return {};
  },
};
