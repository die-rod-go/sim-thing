import { config } from "../config";
import { startAct } from "./act-execution";
import { getAgentRuntime, type PlannedAct, type QueuedAct } from "./agent-runtime";
import type { TickContext } from "./tick-context";
import { listLivingAgents } from "./world-access";

function fillText(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(value),
    template,
  );
}

/** "put bread in the bakery chest", "walk to the well": a queued act in a few words. */
function describePlannedAct(act: PlannedAct): string {
  const texts = config.decision.queuedActTexts;
  switch (act.kind) {
    case "walk_to":
      return fillText(texts.walk_to, { target: act.target });
    case "interact": {
      const { request } = act;
      const item = request.itemName ?? request.targetName ?? "";
      return fillText(texts.interact, { verb: request.verb, item }).trim();
    }
    case "give":
      return fillText(texts.give, {
        target: act.target,
        amount: String(act.amount),
        item: act.item,
      });
    case "wait":
      return fillText(texts.wait, { minutes: String(act.minutes) });
    case "follow":
      return fillText(texts.follow, { target: act.target });
  }
}

/** The acts still queued, each in a few words, in the order they will start. */
export function describeQueuedActs(queued: readonly QueuedAct[]): string[] {
  return queued.map((entry) => describePlannedAct(entry.act));
}

/**
 * Phase 5a, before anyone decides: an agent whose act has ended starts its next queued act with
 * its words, with no LLM call. One with something urgent waiting decides instead, which replaces
 * the queue; so does one whose decision is still being made.
 */
export function startQueuedActs(
  context: TickContext,
  isAgentDeciding: (agentId: string) => boolean = () => false,
): void {
  for (const agent of listLivingAgents(context.state)) {
    if (agent.currentAction !== null || isAgentDeciding(agent.id)) continue;
    const runtime = getAgentRuntime(context.state, agent.id);
    if (runtime.pendingDecision?.isUrgent) continue;
    const next = runtime.queuedActs.shift();
    if (next !== undefined) startAct(context, agent.id, next.act, next.speech);
  }
}
