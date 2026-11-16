import type { Agent, DecisionReply, Volume } from "@village/shared";
import { config } from "../config";
import { buildCacheableDecisionPrompt } from "../decision/decision-prompt";
import { buildDecisionReplySchema } from "../decision/reply-schema";
import { describeUnknownNames } from "../decision/unknown-names";
import type { InteractRequest } from "./agent-runtime";
import { buildDecisionContext } from "./context-builder";
import type { SpeechOrigin } from "./event-factory";
import type { DecisionRequest } from "./tick-phases";
import type { SimDependencies } from "./tick-context";
import { planInteract } from "./interact-planning";
import { findShownOfferEventId } from "./offers";
import { findAgent } from "./world-access";
import type { WorldState } from "./world-state";

/** The physical act a decision settled on, with names already resolved where that needs the LLM. */
export type PlannedAction =
  | { kind: "walk_to"; target: string }
  | { kind: "interact"; request: InteractRequest }
  | { kind: "give"; target: string; item: string; amount: number }
  | { kind: "wait"; minutes: number }
  | { kind: "continue" };

/** One decision reply and the `llm_calls` row it came from (null for a fallback). */
export interface DecidedReply {
  reply: DecisionReply;
  llmCallId: number | null;
  /** What the agent learned from replies rejected for naming something that isn't there. */
  unknownNameNotes?: string[];
}

/** Words spoken along with the action, from the decision's last reply. */
export interface PlannedSpeech {
  line: { words: string; volume: Volume };
  origin: SpeechOrigin;
}

/** Everything one decision produced; applied to the world after all decisions of the tick return. */
export interface DecisionPlan {
  agentId: string;
  isMidActionInterrupt: boolean;
  reply: DecidedReply;
  action: PlannedAction;
  speech: PlannedSpeech | null;
  /** "I looked for nail box, but ...": names the agent tried that aren't there. */
  unknownNameNotes: string[];
  /** The `offered` event of the offer the decision was shown, which its `offer` answers. */
  offerEventId: number | null;
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
): Promise<DecidedReply> {
  const context = buildDecisionContext(
    state,
    request.agentId,
    request.isMidActionInterrupt,
    request.reason,
  );
  const { text: prompt, cacheBreakpoints } = buildCacheableDecisionPrompt(
    context,
    dependencies.promptsDirectory,
  );
  const schemas = buildDecisionReplySchema(
    context.validTargets,
    context.validItems,
    context.validHolders,
    {
      isMidActionInterrupt: request.isMidActionInterrupt,
      isReplySchemaStable: dependencies.isReplySchemaStable,
    },
  );
  const reply = await dependencies.callStructured({
    kind: "decision",
    agentId: request.agentId,
    tick: state.tick,
    prompt,
    cacheBreakpoints,
    ...schemas,
  });
  const unknownNameNotes = (reply.rejectedReplies ?? []).flatMap(describeUnknownNames);
  return reply.ok
    ? { reply: reply.value, llmCallId: reply.callId, unknownNameNotes }
    : { reply: fallbackWait(findAgent(state, request.agentId)), llmCallId: null, unknownNameNotes };
}

function planSpeech(decided: DecidedReply): PlannedSpeech | null {
  const { reply, llmCallId } = decided;
  const words = reply.say?.trim() ?? "";
  if (words === "") return null;
  return {
    line: { words, volume: reply.volume ?? "normal" },
    origin: { thought: reply.thought, llmCallId },
  };
}

/** A wait after speaking is a pause to hear the answer, so it defaults shorter. */
function chooseWaitMinutes(reply: DecisionReply): number {
  if (reply.minutes !== undefined) return reply.minutes;
  return planSpeech({ reply, llmCallId: null }) === null
    ? config.decision.defaultWaitMinutes
    : config.decision.sayWaitMinutes;
}

function planSimpleAction(decided: DecidedReply): PlannedAction {
  const { reply } = decided;
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
      return { kind: "wait", minutes: chooseWaitMinutes(reply) };
  }
}

/**
 * One decision for one agent, reading the world without changing it. An invalid or failed reply
 * falls back to `wait`; the failed calls are still logged by the caller.
 */
export async function runDecision(
  state: WorldState,
  dependencies: SimDependencies,
  request: DecisionRequest,
): Promise<DecisionPlan> {
  const agent = findAgent(state, request.agentId);
  const offerEventId = findShownOfferEventId(state, agent.id);
  const decided = await askForDecision(state, dependencies, request);
  const action =
    decided.reply.action === "interact"
      ? await planInteract(state, dependencies, agent, decided.reply)
      : planSimpleAction(decided);
  return {
    agentId: agent.id,
    isMidActionInterrupt: request.isMidActionInterrupt,
    reply: decided,
    action,
    speech: planSpeech(decided),
    unknownNameNotes: [...new Set(decided.unknownNameNotes ?? [])],
    offerEventId,
  };
}
