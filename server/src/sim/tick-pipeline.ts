import type { WorldEvent } from "@village/shared";
import { config } from "../config";
import { pruneConversationLog } from "../memory/conversation";
import { ATTACK_KINDS } from "./event-broadcast";
import { applyDecisionPlan } from "./action-executor";
import { flagReminders } from "./agenda-reminders";
import { BackgroundWork } from "./background-work";
import { carryBodiesAlong } from "./carried-bodies";
import { runDecision, type DecisionPlan } from "./decision-runner";
import type { AdvanceTick } from "./loop";
import { actCreatures } from "./creatures/creature-phase";
import { createMemoryWork } from "./memory-work";
import { lapseOffers } from "./offers";
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

/** Remembers, per world, the last tick an attack or miss happened, to tell whether a fight is on. */
function createFightWatch() {
  const lastAttackTickByWorld = new WeakMap<WorldState, number>();
  return {
    noteAttacks(state: WorldState, events: readonly WorldEvent[]): void {
      if (events.some((event) => ATTACK_KINDS.includes(event.kind))) {
        lastAttackTickByWorld.set(state, state.tick);
      }
    },
    isFightOn(state: WorldState): boolean {
      const lastAttackTick = lastAttackTickByWorld.get(state);
      return (
        lastAttackTick !== undefined && state.tick - lastAttackTick <= config.combat.fightTicks
      );
    },
  };
}

/**
 * The LLM-driven strategy for the sim loop. Each tick, in order:
 * 1. mechanics: stocks regrow, needs decay (slower asleep), sleepers recover, crowds take effect;
 * 2. actions progress: walks step (clearing what is in the way), arrivals, verbs finish, sleepers
 *    wake on their own, waits run out; every event is broadcast (perceived and added to streams)
 *    as it happens;
 * 2b. creatures: each carries on with its verb or follows its first instinct that can act (no
 *    LLM); their events are broadcast the same way;
 * 2c. carried bodies move to where whoever carries them now is;
 * 3. sight: awareness of everyone in view and seen places are refreshed; someone newly in view
 *    flags a decision;
 * 3b. offers lapse: withdrawn when the giver left reach, unanswered after their time is up;
 * 4. needs that crossed the decision threshold flag a decision, and so does an agenda item whose
 *    hour has come (a sleeper finds it missed on waking);
 * 5. decisions: everyone who needs one gets it, all in parallel through the limiter; the tick
 *    waits for all of them, then applies them in agent order (speech first, the answer to an
 *    offer, then the act), so
 *    the result doesn't depend on which LLM call returned first;
 * 6. memory: each agent's due day plan, summary (episode, chronicle, and at midnight the day
 *    summary and history) or pass (identity, long-term goals, people, reality) is started or
 *    applied; an agent waiting for its day plan makes no decision but an urgent one;
 * 7. upkeep: the conversation log is pruned.
 * Events from step 5 flag decisions for the next tick, like a reply to what was just said.
 *
 * With `shouldCallLlmInBackground`, only agents with nothing to do hold the clock: step 5 applies
 * the decisions that returned since the last tick, starts the new ones, waits for those of idle
 * agents (up to `idleDecisionWaitMs`), then applies every finished plan (in agent order). An agent
 * interrupted mid-action keeps doing what it was doing until its decision lands, so a slow call
 * doesn't stall the village, while idle agents (and the replies they give) never fall behind the
 * clock. Summaries and passes (step 6) never hold it: each is applied on the first tick after it returns.
 * While a fight is on (an attack or miss within `combat.fightTicks`) and
 * `shouldCallLlmInBackgroundDuringFight` is false, every decision in flight holds the clock, uncapped.
 */
export function createDecisionStrategy(dependencies: SimDependencies): AdvanceTick {
  const runMemoryWork = createMemoryWork(dependencies);
  const backgroundDecisions = dependencies.shouldCallLlmInBackground
    ? new BackgroundWork<DecisionPlan>("decision")
    : null;
  const fightWatch = createFightWatch();
  const decide = (state: WorldState, request: DecisionRequest) =>
    runDecision(state, dependencies, request);
  return async (state) => {
    const context: TickContext = { state, result: createEmptyTickResult(state.tick), dependencies };
    const needsBefore = applyMechanics(context);
    progressActions(context);
    actCreatures(context);
    carryBodiesAlong(context);
    updateSight(context);
    lapseOffers(context);
    flagCrossedNeeds(context, needsBefore);
    flagReminders(context);
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
      fightWatch.noteAttacks(state, context.result.events);
      const isHeldByFight =
        dependencies.shouldCallLlmInBackgroundDuringFight === false && fightWatch.isFightOn(state);
      if (isHeldByFight) {
        await backgroundDecisions.waitForAll(state);
      } else {
        await backgroundDecisions.waitFor(
          state,
          listIdleAgentIds(state),
          dependencies.idleDecisionWaitMs,
        );
      }
      for (const plan of backgroundDecisions.collectFinished(state)) {
        applyDecisionPlan(context, plan);
      }
    } else {
      const requests = selectDecisionRequests(context);
      const plans = await Promise.all(requests.map((request) => decide(state, request)));
      for (const plan of plans) applyDecisionPlan(context, plan);
    }
    fightWatch.noteAttacks(state, context.result.events);
    await runMemoryWork(state, context.result);
    state.conversationLog = pruneConversationLog(state.conversationLog, state.tick);
    return context.result;
  };
}
