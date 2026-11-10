import { pruneConversationLog } from "../memory/conversation";
import { applyDecisionPlan } from "./action-executor";
import { runDecision } from "./decision-runner";
import type { AdvanceTick } from "./loop";
import { enforceBucketCaps, runScheduledForgetting } from "./memory-upkeep";
import type { SimDependencies, TickContext } from "./tick-context";
import {
  applyMechanics,
  flagCrossedNeeds,
  progressActions,
  selectDecisionRequests,
  updateSight,
} from "./tick-phases";
import { createEmptyTickResult } from "./world-state";

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
 * 6. upkeep: bucket caps, hourly forgetting, conversation log pruning, then the reflection hook.
 * Events from step 5 flag decisions for the next tick, like a reply to what was just said.
 */
export function createDecisionStrategy(dependencies: SimDependencies): AdvanceTick {
  return async (state) => {
    const context: TickContext = { state, result: createEmptyTickResult(state.tick), dependencies };
    const needsBefore = applyMechanics(context);
    progressActions(context);
    updateSight(context);
    flagCrossedNeeds(context, needsBefore);
    const requests = selectDecisionRequests(context);
    const plans = await Promise.all(
      requests.map((request) => runDecision(state, dependencies, request)),
    );
    for (const plan of plans) applyDecisionPlan(context, plan);
    enforceBucketCaps(state);
    runScheduledForgetting(state);
    state.conversationLog = pruneConversationLog(state.conversationLog, state.tick);
    await dependencies.reflectionHook.afterTick(state, context.result);
    return context.result;
  };
}
