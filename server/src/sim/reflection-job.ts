import { formatSimTime } from "@village/shared";
import { config } from "../config";
import { describeSituation } from "../decision/situation";
import { applyReflection } from "../passes/apply-reflection";
import { buildReflectionPrompt, buildReflectionReplySchema } from "../passes/reflection";
import { buildSituation } from "./context-builder";
import { buildHeldKnowledge } from "./held-knowledge";
import type { JobOutcome } from "./memory-job";
import { buildGoalMoments, buildPersonalityMoments, recordMoments } from "./moments";
import type { SimDependencies } from "./tick-context";
import { findAgent, getAgentMemory, listOthersAsSeen, replaceAgent } from "./world-access";
import type { WorldState } from "./world-state";

/**
 * The reflection: the agent takes stock of everything it holds and where it is, and rewrites
 * what has changed: people, long-term goals, who it is, key memories, the rest of today.
 */
export async function reflect(
  dependencies: SimDependencies,
  state: WorldState,
  agentId: string,
): Promise<JobOutcome> {
  const agent = findAgent(state, agentId);
  const memory = getAgentMemory(state, agentId);
  const asked = {
    agendaRevision: agent.agendaRevision,
    candidates: [...memory.keyMemoryCandidates],
  };
  const situation = describeSituation(
    buildSituation(state, agentId),
    formatSimTime(state.tick, config.clock),
    dependencies.promptsDirectory,
  );
  const prompt = buildReflectionPrompt(
    {
      agent,
      held: buildHeldKnowledge(state, agent),
      items: state.items,
      candidates: asked.candidates,
      situation,
    },
    dependencies.promptsDirectory,
  );
  const reply = await dependencies.callStructured({
    kind: "reflection",
    agentId,
    tick: state.tick,
    prompt,
    ...buildReflectionReplySchema(),
  });
  return {
    agentId,
    jobName: "reflection",
    apply: (current, result) => {
      if (!reply.ok) return false;
      const before = findAgent(current, agentId);
      const reflected = applyReflection(
        before,
        getAgentMemory(current, agentId),
        reply.value,
        asked,
        listOthersAsSeen(current, agentId),
        current.tick,
      );
      replaceAgent(current, reflected.agent);
      current.agentMemories[agentId] = reflected.memory;
      for (const change of reflected.personalityChanges) {
        dependencies.recordPersonalityChange?.(change);
      }
      recordMoments(current, result, [
        ...buildGoalMoments(
          before,
          current.tick,
          before.longTermGoals,
          reflected.agent.longTermGoals,
        ),
        ...buildPersonalityMoments(before, reflected.personalityChanges),
      ]);
      return true;
    },
  };
}
