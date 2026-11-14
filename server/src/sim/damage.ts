import { readAgentHealth } from "@village/shared";
import { config } from "../config";
import { isAsleep } from "../economy/sleep";
import { findCrossedHealthThresholds, isDead, withAgentHealth } from "../status/health";
import { getAgentRuntime, requestDecision } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { abandonCurrentAction, wakeAgent } from "./action-stopping";
import { buildDeathMoment, recordMoments } from "./moments";
import type { TickContext } from "./tick-context";
import { findAgent, markAgentChanged, appendToStream, replaceAgent } from "./world-access";

const ACTOR_PLACEHOLDER = "{actor}";

/** Who is behind lost health, and how a death from it reads. */
export interface HarmCause {
  /** The cause of death if this damage kills, e.g. "stabbed by {actor}" or "starved". */
  killed: string;
  /** The agent who did it, if anyone; fills `{actor}` in `killed`. */
  sourceAgentId: string | null;
}

/** Health lost to one cause. Verbs, conditions and starvation all come through here. */
export interface Damage extends HarmCause {
  amount: number;
}

function describeCause(context: TickContext, cause: HarmCause): string {
  const source = cause.sourceAgentId
    ? findAgent(context.state, cause.sourceAgentId).name
    : config.death.unknownSource;
  return cause.killed.split(ACTOR_PLACEHOLDER).join(source);
}

/**
 * Lowers the agent's health field. Death is settled at once, before anyone else acts; a sleeper
 * wakes in pain without perceiving what hurt them; dropping below a decision threshold gives a
 * decision. `writeField` routes every lowering of a living agent's health here.
 */
export function applyDamage(context: TickContext, agentId: string, damage: Damage): void {
  const { state, result } = context;
  const agent = findAgent(state, agentId);
  if (isDead(agent) || damage.amount <= 0) return;
  const before = readAgentHealth(state.items, agent);
  const hurt = withAgentHealth(state.items, agent, before - damage.amount);
  const health = readAgentHealth(state.items, hurt);
  replaceAgent(state, hurt);
  markAgentChanged(result, agentId);
  if (health <= 0) {
    settleDeath(context, agentId, damage);
    return;
  }
  const runtime = getAgentRuntime(state, agentId);
  if (isAsleep(agent)) {
    wakeAgent(context, agentId);
    appendToStream(state, agentId, config.health.wokeInPainText);
    requestDecision(runtime, config.health.wokeInPainText, true);
  } else if (findCrossedHealthThresholds(before, health).length > 0) {
    requestDecision(runtime, config.health.worsenedDecisionReason, true);
  }
}

/**
 * The agent dies where they stand: their action stops, any pending or in-flight decision is void,
 * and everyone in sight sees a `died` event.
 */
export function settleDeath(context: TickContext, agentId: string, cause: HarmCause): void {
  const { state, result } = context;
  abandonCurrentAction(context, agentId);
  const description = describeCause(context, cause);
  const agent = withAgentHealth(state.items, findAgent(state, agentId), 0);
  const dead = {
    ...agent,
    death: { tick: state.tick, cause: description, sourceAgentId: cause.sourceAgentId },
  };
  replaceAgent(state, dead);
  const runtime = getAgentRuntime(state, agentId);
  runtime.pendingDecision = null;
  runtime.visibleAgentIds = [];
  markAgentChanged(result, agentId);
  const eventDescription = config.death.eventDescription;
  broadcastEvent(
    state,
    createEvent(state, dead, { kind: "died", description: eventDescription }),
    result,
  );
  recordMoments(state, result, [buildDeathMoment(dead, state.tick, description)]);
}
