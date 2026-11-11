import { config } from "../config";
import { isAsleep } from "../economy/sleep";
import { clampHealth, findCrossedHealthThresholds, isDead } from "../status/health";
import { getAgentRuntime, requestDecision } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { abandonCurrentAction, wakeAgent } from "./action-stopping";
import { buildDeathMoment, recordMoments } from "./moments";
import type { TickContext } from "./tick-context";
import { findAgent, markAgentChanged, rememberBriefly, replaceAgent } from "./world-access";

const ACTOR_PLACEHOLDER = "{actor}";

/** Health lost to one cause. Verbs, conditions and starvation all come through here. */
export interface Damage {
  amount: number;
  /** The cause of death if this damage kills, e.g. "stabbed by {actor}" or "starved". */
  killed: string;
  /** The agent who did it, if anyone; fills `{actor}` in `killed`. */
  sourceAgentId: string | null;
}

function describeCause(context: TickContext, damage: Damage): string {
  const source = damage.sourceAgentId
    ? findAgent(context.state, damage.sourceAgentId).name
    : config.death.unknownSource;
  return damage.killed.split(ACTOR_PLACEHOLDER).join(source);
}

/**
 * Lowers the agent's health. Death is settled at once, before anyone else acts; a sleeper wakes
 * in pain without perceiving what hurt them; dropping below a decision threshold gives a decision.
 */
export function applyDamage(context: TickContext, agentId: string, damage: Damage): void {
  const { state, result } = context;
  const agent = findAgent(state, agentId);
  if (isDead(agent) || damage.amount <= 0) return;
  const health = clampHealth(agent.health - damage.amount);
  replaceAgent(state, { ...agent, health });
  markAgentChanged(result, agentId);
  if (health <= 0) {
    settleDeath(context, agentId, damage);
    return;
  }
  const runtime = getAgentRuntime(state, agentId);
  if (isAsleep(agent)) {
    wakeAgent(context, agentId);
    rememberBriefly(state, agentId, config.health.wokeInPainText);
    requestDecision(runtime, config.health.wokeInPainText, true);
  } else if (findCrossedHealthThresholds(agent.health, health).length > 0) {
    requestDecision(runtime, "my wounds", true);
  }
}

/**
 * The agent dies where they stand: their action stops (freeing any object they used), any
 * pending or in-flight decision is void, and everyone in sight sees a `died` event.
 */
export function settleDeath(context: TickContext, agentId: string, damage: Damage): void {
  const { state, result } = context;
  abandonCurrentAction(context, agentId);
  const cause = describeCause(context, damage);
  const agent = findAgent(state, agentId);
  const dead = {
    ...agent,
    health: 0,
    death: { tick: state.tick, cause, sourceAgentId: damage.sourceAgentId },
  };
  replaceAgent(state, dead);
  const runtime = getAgentRuntime(state, agentId);
  runtime.pendingDecision = null;
  runtime.visibleAgentIds = [];
  markAgentChanged(result, agentId);
  const description = config.death.eventDescription;
  broadcastEvent(state, createEvent(state, dead, { kind: "died", description }), result);
  recordMoments(state, result, [buildDeathMoment(dead, state.tick, cause)]);
}
