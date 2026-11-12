import type { Agent, DecisionReply, Volume } from "@village/shared";
import { config } from "../config";
import { formatMinutesAgo } from "../decision/around-you";
import { buildDecisionPrompt } from "../decision/decision-prompt";
import { buildDecisionReplySchema } from "../decision/reply-schema";
import { searchMemories } from "../memory/recall";
import { fillStatusWords, findFailedRecall, readStatusView } from "../status/impairment";
import { extractTags } from "../memory/tags";
import { pushWorkingMemory } from "../memory/working-memory";
import type { InteractRequest } from "./agent-runtime";
import { buildDecisionContext } from "./context-builder";
import type { SpeechOrigin } from "./event-factory";
import type { DecisionRequest } from "./tick-phases";
import type { SimDependencies } from "./tick-context";
import { planInteract } from "./interact-planning";
import { findAgent, formatWorkingMemoryEntry, listKnownNames } from "./world-access";
import type { WorldState } from "./world-state";

/** The physical act a decision settled on, with names already resolved where that needs the LLM. */
export type PlannedAction =
  | { kind: "walk_to"; target: string }
  | { kind: "interact"; request: InteractRequest }
  | { kind: "give"; target: string; item: string; amount: number }
  | {
      kind: "say";
      line: { words: string; volume: Volume };
      origin: SpeechOrigin;
      minutes: number;
    }
  | { kind: "wait"; minutes: number }
  | { kind: "continue" };

/** One decision reply and the `llm_calls` row it came from (null for a fallback). */
export interface DecidedReply {
  reply: DecisionReply;
  llmCallId: number | null;
}

/** Everything one decision produced; applied to the world after all decisions of the tick return. */
export interface DecisionPlan {
  agentId: string;
  isMidActionInterrupt: boolean;
  /** Replies in order (two after a recall); free acts of each apply, the last one's action wins. */
  replies: DecidedReply[];
  action: PlannedAction;
  /** Working-memory entries from a recall, already stamped. */
  recallEntries: string[];
}

function fallbackWait(agent: Agent): DecisionReply {
  return {
    thought: "",
    intention: agent.intention,
    action: "wait",
    minutes: config.decision.defaultWaitMinutes,
  };
}

async function askForDecision(
  state: WorldState,
  dependencies: SimDependencies,
  request: DecisionRequest,
  agentOverride?: Agent,
): Promise<DecidedReply> {
  const context = buildDecisionContext(state, request.agentId, request.isMidActionInterrupt, {
    passiveRecallRoll: request.recallRolls.passive,
    ...(agentOverride ? { agentOverride } : {}),
  });
  const prompt = buildDecisionPrompt(context, dependencies.promptsDirectory);
  const schemas = buildDecisionReplySchema(
    context.validTargets,
    context.validItems,
    context.validHolders,
    { isMidActionInterrupt: request.isMidActionInterrupt },
  );
  const reply = await dependencies.callStructured({
    kind: "decision",
    agentId: request.agentId,
    tick: state.tick,
    prompt,
    ...schemas,
  });
  return reply.ok
    ? { reply: reply.value, llmCallId: reply.callId }
    : { reply: fallbackWait(findAgent(state, request.agentId)), llmCallId: null };
}

/**
 * The `recall` action: memories sharing names in the query, plus where named agents were last
 * perceived. A pressing need or wound can make the search fail, leaving every memory untouched.
 */
export function runRecall(state: WorldState, agent: Agent, query: string, roll: number): string[] {
  const fog = findFailedRecall(readStatusView(state.items, agent), roll);
  if (fog !== null) {
    const failed = fillStatusWords(config.impairment.recallFailedText, fog.statusWords);
    return [formatWorkingMemoryEntry(state.tick, failed.split("{query}").join(query))];
  }
  const memories = searchMemories(
    state.memoryStore,
    agent.id,
    query,
    listKnownNames(state),
    state.tick,
  );
  const lines = memories.map(
    (memory) =>
      `I recall: ${memory.text} (${formatMinutesAgo((state.tick - memory.tick) * config.clock.minutesPerTick)})`,
  );
  const namedAgents = extractTags(
    query,
    state.agents.map((other) => other.name),
  );
  for (const other of state.agents) {
    const entry = agent.awareness[other.id];
    if (other.id === agent.id || !entry || !namedAgents.includes(other.name.toLowerCase()))
      continue;
    const how = entry.via === "saw" ? "saw" : "heard";
    const when = formatMinutesAgo((state.tick - entry.tick) * config.clock.minutesPerTick);
    lines.push(`I last ${how} ${other.name} ${when} at ${entry.place}, ${entry.doing}`);
  }
  if (lines.length === 0) lines.push(`I tried to recall "${query}" but nothing came to mind`);
  return lines.map((line) => formatWorkingMemoryEntry(state.tick, line));
}

function planSay(decided: DecidedReply): PlannedAction {
  const { reply, llmCallId } = decided;
  return {
    kind: "say",
    line: { words: reply.say ?? "", volume: reply.volume ?? "normal" },
    origin: { thought: reply.thought, llmCallId },
    minutes: reply.minutes ?? config.decision.sayWaitMinutes,
  };
}

function planSimpleAction(decided: DecidedReply): PlannedAction {
  const { reply } = decided;
  switch (reply.action) {
    case "say":
      return planSay(decided);
    case "walk_to":
      return { kind: "walk_to", target: reply.target ?? "" };
    case "give":
      return {
        kind: "give",
        target: reply.target ?? "",
        item: reply.item ?? "",
        amount: reply.amount ?? 0,
      };
    case "continue":
      return { kind: "continue" };
    default:
      return { kind: "wait", minutes: reply.minutes ?? config.decision.defaultWaitMinutes };
  }
}

/**
 * One decision for one agent, reading the world without changing it (apart from recall bumps).
 * Invalid or failed replies fall back to `wait`; the failed calls are still logged by the caller.
 * A `recall` runs the search and asks once more in the same tick; a second recall becomes a wait.
 */
export async function runDecision(
  state: WorldState,
  dependencies: SimDependencies,
  request: DecisionRequest,
): Promise<DecisionPlan> {
  const agent = findAgent(state, request.agentId);
  const first = await askForDecision(state, dependencies, request);
  const replies = [first];
  let recallEntries: string[] = [];
  let finalReply = first.reply;
  let finalCallId = first.llmCallId;
  if (finalReply.action === "recall") {
    recallEntries = runRecall(state, agent, finalReply.query ?? "", request.recallRolls.explicit);
    const workingMemory = recallEntries.reduce(
      (entries, entry) => pushWorkingMemory(entries, entry),
      agent.workingMemory,
    );
    const second = await askForDecision(state, dependencies, request, { ...agent, workingMemory });
    finalReply =
      second.reply.action === "recall"
        ? { ...second.reply, action: "wait", minutes: config.decision.defaultWaitMinutes }
        : second.reply;
    finalCallId = second.llmCallId;
    replies.push({ reply: finalReply, llmCallId: finalCallId });
  }
  const action =
    finalReply.action === "interact"
      ? await planInteract(state, dependencies, agent, finalReply)
      : planSimpleAction({ reply: finalReply, llmCallId: finalCallId });
  return {
    agentId: agent.id,
    isMidActionInterrupt: request.isMidActionInterrupt,
    replies,
    action,
    recallEntries,
  };
}
