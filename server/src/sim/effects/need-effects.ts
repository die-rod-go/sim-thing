import { applyNeedEffects } from "../../economy/needs";
import { findEntityIfPresent } from "../../items/entity-store";
import { countOtherUsers } from "../../items/entity-users";
import { resolveNumber } from "../../items/verb-numbers";
import { findAgent, markAgentChanged, replaceAgent } from "../world-access";
import {
  findEffectAgentId,
  findUsedDefinition,
  type EffectHandler,
  type EffectRun,
} from "./effect-run";

function countOthersUsingSameThing(effectRun: EffectRun, agentId: string): number {
  const { usedEntityId } = effectRun.run;
  if (usedEntityId === null) return 0;
  const used = findEntityIfPresent(effectRun.context.state, usedEntityId);
  return used ? countOtherUsers(used, agentId) : 0;
}

/** Raises or lowers a need; `perOtherUser` adds more for each other agent at the same thing. */
export const changeNeedEffect: EffectHandler<"change_need"> = {
  apply(effectRun, effect) {
    const { state, result } = effectRun.context;
    const agentId = findEffectAgentId(effectRun, effect);
    const definition = findUsedDefinition(effectRun);
    const perOtherUser =
      effect.perOtherUser === undefined ? 0 : resolveNumber(effect.perOtherUser, definition);
    const amount =
      resolveNumber(effect.amount, definition) +
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
