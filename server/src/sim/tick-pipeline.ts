import { pruneConversationLog } from "../memory/conversation";
import { applyDecisionPlan } from "./action-executor";
import { BackgroundWork } from "./background-work";
import { runDecision, type DecisionPlan } from "./decision-runner";
import type { AdvanceTick } from "./loop";
import type { SimDependencies, TickContext } from "./tick-context";
import type { DecisionRequest } from "./tick-phases";
import {
  applyMechanics,
  flagCrossedNeeds,
  progressActions,
  selectDecisionRequests,
  updateSight,
} from "./tick-phases";
import { listLivingAgents } from "./world-access";
import { createEmptyTickResult, type WorldState } from "./world-state";

function listIdleAgentIds(state: WorldState): string[] {
  return listLivingAgents(state)
    .filter((agent) => agent.currentAction === null)
    .map((agent) => agent.id);
}

/**
 * The LLM-driven strategy for the sim loop. Each tick, in order:
 * 1. mechanics: stocks regrow, needs decay (slower asleep), sleepers recover, crowds take effect;
 * 2. actions progress: walks step (clearing what is in the way), arrivals, verbs finish, sleepers
 *    wake on their own, waits run out; every event is broadcast (perceived and added to streams)
 *    as it happens;
 * 3. sight: awareness of everyone in view and seen places are refreshed; someone newly in view
 *    flags a decision;
 * 4. needs that crossed the decision threshold flag a decision;
 * 5. decisions: everyone who needs one gets it, all in parallel through the limiter; the tick
 *    waits for all of them, then applies them in agent order (speech first, then the act), so
 *    the result doesn't depend on which LLM call returned first;
 * 6. upkeep: the conversation log is pruned.
 * Events from step 5 flag decisions for the next tick, like a reply to what was just said.
 *
 * With `shouldCallLlmInBackground`, only agents with nothing to do hold the clock: step 5 applies
 * the decisions that returned since the last tick, starts the new ones, waits for those of idle
 * agents (up to `idleDecisionWaitMs`), then applies every finished plan (in agent order). An agent
 * interrupted mid-action keeps doing what it was doing until its decision lands, so a slow call
 * doesn't stall the village, while idle agents (and the replies they give) never fall behind the
 * clock.
 */
export function createDecisionStrategy(dependencies: SimDependencies): AdvanceTick {
  const backgroundDecisions = dependencies.shouldCallLlmInBackground
    ? new BackgroundWork<DecisionPlan>("decision")
    : null;
  const decide = (state: WorldState, request: DecisionRequest) =>
    runDecision(state, dependencies, request);
  return async (state) => {
    const context: TickContext = { state, result: createEmptyTickResult(state.tick), dependencies };
    const needsBefore = applyMechanics(context);
    progressActions(context);
    updateSight(context);
    flagCrossedNeeds(context, needsBefore);
    if (backgroundDecisions) {
      for (const plan of backgroundDecisions.collectFinished(state)) {
        applyDecisionPlan(context, plan);
      }
      const requests = selectDecisionRequests(context, (agentId) =>
        backgroundDecisions.isRunning(state, agentId),
      );
      for (const request of requests) {
        backgroundDecisions.start(state, request.agentId, () => decide(state, request));
      }
      await backgroundDecisions.waitFor(
        state,
        listIdleAgentIds(state),
        dependencies.idleDecisionWaitMs,
      );
      for (const plan of backgroundDecisions.collectFinished(state)) {
        applyDecisionPlan(context, plan);
      }
    } else {
      const requests = selectDecisionRequests(context);
      const plans = await Promise.all(requests.map((request) => decide(state, request)));
      for (const plan of plans) applyDecisionPlan(context, plan);
    }
    state.conversationLog = pruneConversationLog(state.conversationLog, state.tick);
    return context.result;
  };
}
