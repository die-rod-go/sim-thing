import { formatSimTime } from "@village/shared";
import { applyDayPlan, buildDayPlanPrompt, buildDayPlanReplySchema } from "../agenda/day-plan";
import { config } from "../config";
import { describeSituation } from "../decision/situation";
import { buildSituation } from "./context-builder";
import { buildHeldKnowledge } from "./held-knowledge";
import type { JobOutcome } from "./memory-job";
import { buildGoalMoments, recordMoments } from "./moments";
import type { SimDependencies } from "./tick-context";
import { findAgent, getAgentMemory, replaceAgent } from "./world-access";
import type { WorldState } from "./world-state";

/**
 * The day plan: on waking (and at the start), the agent writes Today from everything it holds and
 * where it is, and may rewrite its long-term goals. Applied to the agent as it is when it lands.
 */
export async function planDay(
  dependencies: SimDependencies,
  state: WorldState,
  agentId: string,
): Promise<JobOutcome> {
  const agent = findAgent(state, agentId);
  const situation = describeSituation(
    buildSituation(state, agentId),
    formatSimTime(state.tick, config.clock),
    dependencies.promptsDirectory,
  );
  const prompt = buildDayPlanPrompt(
    { agent, held: buildHeldKnowledge(state, agent), items: state.items, situation },
    dependencies.promptsDirectory,
  );
  const reply = await dependencies.callStructured({
    kind: "day_plan",
    agentId,
    tick: state.tick,
    prompt,
    ...buildDayPlanReplySchema(),
  });
  return {
    agentId,
    jobName: "day plan",
    apply: (current, result) => {
      if (!reply.ok) return false;
      const before = findAgent(current, agentId);
      const planned = applyDayPlan(before, reply.value);
      replaceAgent(current, planned);
      recordMoments(
        current,
        result,
        buildGoalMoments(before, current.tick, before.longTermGoals, planned.longTermGoals),
      );
      const memory = getAgentMemory(current, agentId);
      current.agentMemories[agentId] = { ...memory, dayPlanOwedSinceTick: null };
      return true;
    },
  };
}
