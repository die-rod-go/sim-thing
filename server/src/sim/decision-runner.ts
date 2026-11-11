import { findDefinitionByName, type Agent, type DecisionReply, type Verb } from "@village/shared";
import { config } from "../config";
import { formatMinutesAgo } from "../decision/around-you";
import { buildDecisionPrompt } from "../decision/decision-prompt";
import { buildInteractPrompt, buildInteractReplySchema } from "../decision/interact-prompt";
import { buildDecisionReplySchema } from "../decision/reply-schema";
import { normalizeDisplayName } from "../decision/resolve-name";
import {
  describeEntityName,
  findEntity,
  getDefinition,
  listHeldEntities,
  listHeldOfDefinition,
  listTileEntitiesAt,
} from "../items/entity-store";
import { findVerbByName, listItemlessVerbs, listVerbsForEntity } from "../items/verb-offers";
import { searchMemories } from "../memory/recall";
import { extractTags } from "../memory/tags";
import { pushWorkingMemory } from "../memory/working-memory";
import { buildDecisionContext } from "./context-builder";
import type { DecisionRequest } from "./tick-phases";
import type { SimDependencies } from "./tick-context";
import { findAgent, formatWorkingMemoryEntry, listKnownNames } from "./world-access";
import type { WorldState } from "./world-state";

/**
 * What a verb is to be used with. A held item is named by definition, so whichever of them is
 * oldest when the act is applied gets used; a placed thing by its entity.
 */
export type PlannedUse =
  | { kind: "held"; definitionId: string; name: string }
  | { kind: "entity"; entityId: string; name: string }
  | { kind: "user" };

/** The physical act a decision settled on, with names already resolved where that needs the LLM. */
export type PlannedAction =
  | { kind: "walk_to"; target: string }
  | { kind: "interact"; use: PlannedUse; verb: string; text?: string; minutes?: number }
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
  const schemas = buildDecisionReplySchema(context.validTargets, context.validItems, {
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

/** Something the reply might mean to use, with the verbs it offers. */
interface UseCandidate {
  use: Exclude<PlannedUse, { kind: "user" }>;
  verbs: Verb[];
}

function findHeldCandidate(state: WorldState, agent: Agent, itemName: string): UseCandidate | null {
  const definition = findDefinitionByName(state.items, itemName);
  const oldest = definition ? listHeldOfDefinition(state, agent.id, definition.id)[0] : undefined;
  if (!definition || !oldest) return null;
  return {
    use: { kind: "held", definitionId: definition.id, name: definition.name },
    verbs: listVerbsForEntity(state, agent.id, oldest),
  };
}

function findNearbyCandidate(state: WorldState, agent: Agent, name: string): UseCandidate | null {
  const wanted = normalizeDisplayName(name);
  const entity = listTileEntitiesAt(state, agent.place).find(
    (candidate) => normalizeDisplayName(describeEntityName(state, candidate)) === wanted,
  );
  if (!entity) return null;
  return {
    use: { kind: "entity", entityId: entity.id, name: describeEntityName(state, entity) },
    verbs: listVerbsForEntity(state, agent.id, entity),
  };
}

/** Everything carried or here, for a reply that names a verb but not what to use it with. */
function listAllCandidates(state: WorldState, agent: Agent): UseCandidate[] {
  const heldNames = new Set(
    listHeldEntities(state, agent.id).map((entity) => getDefinition(state, entity).name),
  );
  const nearbyNames = listTileEntitiesAt(state, agent.place).map((entity) =>
    describeEntityName(state, entity),
  );
  return [
    ...[...heldNames].map((name) => findHeldCandidate(state, agent, name)),
    ...nearbyNames.map((name) => findNearbyCandidate(state, agent, name)),
  ].filter((candidate): candidate is UseCandidate => candidate !== null);
}

/**
 * The held `item` comes first, then the `target` here: whichever offers the named verb wins. A
 * reply naming neither looks through everything carried or here.
 */
function listUseCandidates(state: WorldState, agent: Agent, reply: DecisionReply): UseCandidate[] {
  if (!reply.item && !reply.target) return listAllCandidates(state, agent);
  return [
    reply.item ? findHeldCandidate(state, agent, reply.item) : null,
    reply.target ? findNearbyCandidate(state, agent, reply.target) : null,
  ].filter((candidate): candidate is UseCandidate => candidate !== null);
}

function describeUseName(state: WorldState, use: UseCandidate["use"]): string {
  return use.kind === "held"
    ? use.name
    : describeEntityName(state, findEntity(state, use.entityId));
}

async function askWhichVerb(
  state: WorldState,
  dependencies: SimDependencies,
  agent: Agent,
  reply: DecisionReply,
  candidate: UseCandidate,
): Promise<PlannedAction> {
  const verbNames = [...new Set(candidate.verbs.map((verb) => verb.name))];
  const prompt = buildInteractPrompt(
    {
      agentName: agent.name,
      objectName: describeUseName(state, candidate.use),
      intention: reply.intention,
      options: verbNames.map((name) => ({ name, description: "" })),
    },
    dependencies.promptsDirectory,
  );
  const answer = await dependencies.callStructured({
    kind: "interact",
    agentId: agent.id,
    tick: state.tick,
    prompt,
    ...buildInteractReplySchema(verbNames),
  });
  if (!answer.ok) return { kind: "wait", minutes: config.decision.defaultWaitMinutes };
  return {
    kind: "interact",
    use: candidate.use,
    verb: answer.value.verb,
    text: answer.value.text ?? reply.text,
    minutes: answer.value.minutes ?? reply.minutes,
  };
}

/**
 * Resolves interact: what is used (a held `item` or a `target` here, or nothing for a bare-handed
 * verb) and the reply's verb if that thing offers it; otherwise a second call lists its verbs.
 */
async function planInteract(
  state: WorldState,
  dependencies: SimDependencies,
  agent: Agent,
  reply: DecisionReply,
): Promise<PlannedAction> {
  const verbName = reply.verb ?? "";
  const candidates = listUseCandidates(state, agent, reply);
  const details = { text: reply.text, minutes: reply.minutes };
  for (const candidate of candidates) {
    const verb = findVerbByName(candidate.verbs, verbName);
    if (verb) return { kind: "interact", use: candidate.use, verb: verb.name, ...details };
  }
  const itemless = findVerbByName(listItemlessVerbs(state), verbName);
  if (itemless) return { kind: "interact", use: { kind: "user" }, verb: itemless.name, ...details };
  const [first] = reply.item || reply.target ? candidates : [];
  const name = reply.item ?? reply.target ?? verbName;
  if (!first) {
    return {
      kind: "fail",
      attempt: `use the ${name}`,
      reason: `there is no ${name} here for me to use`,
    };
  }
  if (first.verbs.length === 0) {
    const firstName = describeUseName(state, first.use);
    return {
      kind: "fail",
      attempt: `use the ${firstName}`,
      reason: "there is nothing I can do with it",
    };
  }
  return askWhichVerb(state, dependencies, agent, reply, first);
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
