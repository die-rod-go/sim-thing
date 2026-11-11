import type { Agent, DecisionReply } from "@village/shared";
import { config } from "../config";
import { formatMinutesAgo } from "../decision/around-you";
import { buildDecisionPrompt } from "../decision/decision-prompt";
import { buildInteractPrompt, buildInteractReplySchema } from "../decision/interact-prompt";
import { buildDecisionReplySchema } from "../decision/reply-schema";
import { normalizeDisplayName } from "../decision/resolve-name";
import {
  describeInteractionOption,
  listAvailableInteractions,
  type InteractionTarget,
} from "../economy/interactions";
import { searchMemories } from "../memory/recall";
import { extractTags } from "../memory/tags";
import { pushWorkingMemory } from "../memory/working-memory";
import { buildDecisionContext } from "./context-builder";
import type { DecisionRequest } from "./tick-phases";
import type { SimDependencies } from "./tick-context";
import { findAgent, formatWorkingMemoryEntry, listKnownNames } from "./world-access";
import type { WorldState } from "./world-state";

/** The physical act a decision settled on, with names already resolved where that needs the LLM. */
export type PlannedAction =
  | { kind: "walk_to"; target: string }
  | { kind: "interact"; target: string; interaction: string; text?: string; minutes?: number }
  | { kind: "give"; target: string; item: string; amount: number }
  | { kind: "wait"; minutes: number }
  | { kind: "continue" }
  | { kind: "fail"; attempt: string; reason: string };

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
  const context = buildDecisionContext(
    state,
    request.agentId,
    request.isMidActionInterrupt,
    agentOverride,
  );
  const prompt = buildDecisionPrompt(context, dependencies.promptsDirectory);
  const schemas = buildDecisionReplySchema(context.validTargets, {
    isMidActionInterrupt: request.isMidActionInterrupt,
  });
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

/** The `recall` action: memories sharing names in the query, plus where named agents were last perceived. */
function runRecall(state: WorldState, agent: Agent, query: string): string[] {
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

function findInteractTarget(
  state: WorldState,
  agent: Agent,
  name: string,
): InteractionTarget | null {
  const wanted = normalizeDisplayName(name);
  const object = state.objects.find(
    (candidate) =>
      candidate.place === agent.place && normalizeDisplayName(candidate.name) === wanted,
  );
  if (object) return object;
  const item = Object.keys(agent.inventory).find(
    (candidate) =>
      normalizeDisplayName(candidate) === wanted && (agent.inventory[candidate] ?? 0) > 0,
  );
  return item ?? null;
}

/** Resolves interact: the reply's interaction if valid, otherwise a second call that lists them. */
async function planInteract(
  state: WorldState,
  dependencies: SimDependencies,
  agent: Agent,
  reply: DecisionReply,
): Promise<PlannedAction> {
  const targetName = reply.target ?? "";
  const target = findInteractTarget(state, agent, targetName);
  if (target === null) {
    return {
      kind: "fail",
      attempt: `use the ${targetName}`,
      reason: `there is no ${targetName} here for me to use`,
    };
  }
  const options = listAvailableInteractions(agent, target);
  const resolvedName = typeof target === "string" ? target : target.name;
  const requested = normalizeDisplayName(reply.interaction ?? "");
  const known = options.find((option) => normalizeDisplayName(option.name) === requested);
  if (known) {
    return {
      kind: "interact",
      target: resolvedName,
      interaction: known.name,
      text: reply.text,
      minutes: reply.minutes,
    };
  }
  if (options.length === 0) {
    return {
      kind: "fail",
      attempt: `use the ${resolvedName}`,
      reason: `there is nothing I can do with it`,
    };
  }
  const prompt = buildInteractPrompt(
    {
      agentName: agent.name,
      objectName: resolvedName,
      intention: reply.intention,
      options: options.map((option) => ({
        name: describeInteractionOption(option),
        description: "",
      })),
    },
    dependencies.promptsDirectory,
  );
  const answer = await dependencies.callStructured({
    kind: "interact",
    agentId: agent.id,
    tick: state.tick,
    prompt,
    ...buildInteractReplySchema(options.map((option) => option.name)),
  });
  if (!answer.ok) return { kind: "wait", minutes: config.decision.defaultWaitMinutes };
  return {
    kind: "interact",
    target: resolvedName,
    interaction: answer.value.interaction,
    text: answer.value.text ?? reply.text,
    minutes: answer.value.minutes ?? reply.minutes,
  };
}

function planSimpleAction(reply: DecisionReply): PlannedAction {
  switch (reply.action) {
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
  if (finalReply.action === "recall") {
    recallEntries = runRecall(state, agent, finalReply.query ?? "");
    const workingMemory = recallEntries.reduce(
      (entries, entry) => pushWorkingMemory(entries, entry),
      agent.workingMemory,
    );
    const second = await askForDecision(state, dependencies, request, { ...agent, workingMemory });
    finalReply =
      second.reply.action === "recall"
        ? { ...second.reply, action: "wait", minutes: config.decision.defaultWaitMinutes }
        : second.reply;
    replies.push({ reply: finalReply, llmCallId: second.llmCallId });
  }
  const action =
    finalReply.action === "interact"
      ? await planInteract(state, dependencies, agent, finalReply)
      : planSimpleAction(finalReply);
  return {
    agentId: agent.id,
    isMidActionInterrupt: request.isMidActionInterrupt,
    replies,
    action,
    recallEntries,
  };
}
