import type { Agent, DecisionAct, DecisionReply } from "@village/shared";
import { config } from "../config";
import { buildCacheableDecisionPrompt } from "../decision/decision-prompt";
import { buildDecisionReplySchema } from "../decision/reply-schema";
import { describeUnknownNames } from "../decision/unknown-names";
import type { PlannedAct, PlannedSpeech, QueuedAct } from "./agent-runtime";
import { buildDecisionContext } from "./context-builder";
import { buildInteractRequest, planInteract } from "./interact-planning";
import { findShownOfferEventId } from "./offers";
import type { SimDependencies } from "./tick-context";
import type { DecisionRequest } from "./tick-phases";
import { findAgent } from "./world-access";
import type { WorldState } from "./world-state";

/** The first act a decision settled on, with names already resolved where that needs the LLM. */
export type PlannedAction = PlannedAct | { kind: "continue" };

export type { PlannedSpeech };

/** One decision reply and the `llm_calls` row it came from (null for a fallback). */
export interface DecidedReply {
  reply: DecisionReply;
  llmCallId: number | null;
  /** What the agent learned from replies rejected for naming something that isn't there. */
  unknownNameNotes?: string[];
}

/** Everything one decision produced; applied to the world after all decisions of the tick return. */
export interface DecisionPlan {
  agentId: string;
  isMidActionInterrupt: boolean;
  reply: DecidedReply;
  action: PlannedAction;
  /** The words of the first act, spoken as it starts. */
  speech: PlannedSpeech | null;
  /** The later acts, each with its words, started one after another with no LLM call. */
  queued: QueuedAct[];
  /** "I looked for nail box, but ...": names the agent tried that aren't there. */
  unknownNameNotes: string[];
  /** The `offered` event of the offer the decision was shown, which its `offer` answers. */
  offerEventId: number | null;
  /** The decision was a reckoning, so its `agenda` replaces Today. */
  isReckoning: boolean;
}

function fallbackWait(agent: Agent): DecisionReply {
  return {
    thought: "",
    intention: agent.intention,
    acts: [{ action: "wait", minutes: config.decision.defaultWaitMinutes }],
  };
}

async function askForDecision(
  state: WorldState,
  dependencies: SimDependencies,
  request: DecisionRequest,
): Promise<DecidedReply> {
  const context = {
    ...buildDecisionContext(
      state,
      request.agentId,
      request.isMidActionInterrupt,
      request.reason,
      dependencies.promptsDirectory,
    ),
    isReckoning: request.isReckoning,
  };
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
      isReckoning: request.isReckoning,
    },
  );
  const reply = await dependencies.callStructured({
    kind: request.isReckoning ? "reckoning" : "decision",
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

function planSpeech(act: DecisionAct, decided: DecidedReply): PlannedSpeech | null {
  const words = act.say?.trim() ?? "";
  if (words === "") return null;
  return {
    line: { words, volume: act.volume ?? "normal" },
    origin: { thought: decided.reply.thought, llmCallId: decided.llmCallId },
  };
}

/** A wait after speaking is a pause to hear the answer, so it defaults shorter. */
function chooseWaitMinutes(act: DecisionAct): number {
  if (act.minutes !== undefined) return act.minutes;
  const hasWords = (act.say?.trim() ?? "") !== "";
  return hasWords ? config.decision.sayWaitMinutes : config.decision.defaultWaitMinutes;
}

/** An act in the reply's own words, to be resolved when it starts. */
export function planAct(act: DecisionAct): PlannedAct {
  switch (act.action) {
    case "walk_to":
      return { kind: "walk_to", target: act.target ?? "" };
    case "interact":
      return { kind: "interact", request: buildInteractRequest(act) };
    case "give":
      return {
        kind: "give",
        target: act.target ?? "",
        item: act.item ?? "",
        amount: act.amount ?? 0,
      };
    case "follow":
      return {
        kind: "follow",
        target: act.target ?? "",
        minutes: act.minutes ?? config.walking.followDefaultMinutes,
      };
    default:
      return { kind: "wait", minutes: chooseWaitMinutes(act) };
  }
}

/**
 * One decision for one agent, reading the world without changing it. An invalid or failed reply
 * falls back to `wait`; the failed calls are still logged by the caller. Only the first act may
 * need a second call to choose its verb; later acts are resolved when they start.
 */
export async function runDecision(
  state: WorldState,
  dependencies: SimDependencies,
  request: DecisionRequest,
): Promise<DecisionPlan> {
  const agent = findAgent(state, request.agentId);
  const offerEventId = findShownOfferEventId(state, agent.id);
  const decided = await askForDecision(state, dependencies, request);
  const [first, ...later] = decided.reply.acts;
  const firstAct: DecisionAct = first ?? { action: "wait" };
  const action: PlannedAction =
    firstAct.action === "continue"
      ? { kind: "continue" }
      : firstAct.action === "interact"
        ? await planInteract(state, dependencies, agent, decided.reply.intention, firstAct)
        : planAct(firstAct);
  return {
    agentId: agent.id,
    isMidActionInterrupt: request.isMidActionInterrupt,
    reply: decided,
    action,
    speech: planSpeech(firstAct, decided),
    queued: later.map((act) => ({ act: planAct(act), speech: planSpeech(act, decided) })),
    unknownNameNotes: [...new Set(decided.unknownNameNotes ?? [])],
    offerEventId,
    isReckoning: request.isReckoning,
  };
}
