import { pruneConversationLog } from "../memory/conversation";
import { applyDecisionPlan } from "./action-executor";
import { BackgroundDecisions } from "./background-decisions";
import { createConversationSummarizer } from "./conversation-summaries";
import { runDecision } from "./decision-runner";
import type { AdvanceTick } from "./loop";
import { enforceBucketCaps, runScheduledForgetting } from "./memory-upkeep";
import type { SimDependencies, TickContext } from "./tick-context";
import type { DecisionRequest } from "./tick-phases";
import {
  applyMechanics,
  flagCrossedNeeds,
  progressActions,
  selectDecisionRequests,
  updateSight,
} from "./tick-phases";
import { createEmptyTickResult, type WorldState } from "./world-state";

/**
 * The LLM-driven strategy for the sim loop. Each tick, in order:
 * 1. mechanics: stocks regrow, needs decay (slower asleep), sleepers recover, crowds take effect;
 * 2. actions progress: walks step (opening closed doors), arrivals, interactions finish, sleepers
 *    wake on their own, waits run out; every event is broadcast (perceived and filed) as it happens;
 * 3. sight: awareness of everyone in view is refreshed; someone newly in view flags a decision;
 * 4. needs that crossed the decision threshold flag a decision;
 * 5. decisions: everyone who needs one gets it, all in parallel through the limiter; the tick
 *    waits for all of them, then applies them in agent order (speech first, then the act), so
 *    the result doesn't depend on which LLM call returned first;
 * 6. conversation summaries: each ended conversation's lines are replaced by the agent's summary;
 * 7. upkeep: bucket caps, hourly forgetting, conversation log pruning, then the reflection hook.
 * Events from step 5 flag decisions for the next tick, like a reply to what was just said.
 *
 * With `shouldDecideInBackground`, step 5 instead applies the decisions that returned since the
 * last tick (in agent order) and starts the new ones without waiting, so a slow LLM call no longer
 * holds the clock; an agent keeps doing what it was doing until its decision lands.
 */
export function createDecisionStrategy(dependencies: SimDependencies): AdvanceTick {
  const summarizeEndedConversations = createConversationSummarizer(dependencies);
  const backgroundDecisions = dependencies.shouldDecideInBackground
    ? new BackgroundDecisions()
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
        backgroundDecisions.isDeciding(state, agentId),
      );
      for (const request of requests) {
        backgroundDecisions.start(state, request.agentId, () => decide(state, request));
      }
    } else {
      const requests = selectDecisionRequests(context);
      const plans = await Promise.all(requests.map((request) => decide(state, request)));
      for (const plan of plans) applyDecisionPlan(context, plan);
    }
    await summarizeEndedConversations(state);
    enforceBucketCaps(state);
    runScheduledForgetting(state);
    state.conversationLog = pruneConversationLog(state.conversationLog, state.tick);
    await dependencies.reflectionHook.afterTick(state, context.result);
    return context.result;
  };
}
