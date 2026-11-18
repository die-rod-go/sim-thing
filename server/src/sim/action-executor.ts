import type { Agent, AgentThought, DecisionReply } from "@village/shared";
import { applyAgendaChanges, replaceAgenda } from "../agenda/agenda";
import { oweReflection } from "../memory/reflection-progress";
import { config } from "../config";
import { isDead } from "../status/health";
import { speak, startAct } from "./act-execution";
import { stopCurrentAction } from "./action-stopping";
import { getAgentRuntime, type PlannedAct } from "./agent-runtime";
import type { DecisionPlan } from "./decision-runner";
import { answerOffer } from "./offers";
import type { TickContext } from "./tick-context";
import { markToRemember } from "./key-memories";
import {
  findAgent,
  getAgentMemory,
  markAgentChanged,
  appendToStream,
  replaceAgent,
} from "./world-access";

function chooseLastThought(agent: Agent, reply: DecisionReply, tick: number): AgentThought | null {
  const text = reply.thought.trim();
  return text ? { text, tick } : agent.lastThought;
}

/**
 * intention, mood, the agenda (a reckoning's whole new list, then done, dropped and added) and
 * remember: free mental acts that ride along with any action. A finished or dropped item and a
 * moment to remember go into the stream in the agent's own words. After a reckoning the agent
 * owes a reflection.
 */
function applyFreeActs(context: TickContext, plan: DecisionPlan): void {
  const { state } = context;
  const { agentId } = plan;
  const { reply } = plan.reply;
  const agent = findAgent(state, agentId);
  const replanned =
    plan.isReckoning && reply.agenda !== undefined ? replaceAgenda(agent, reply.agenda) : agent;
  const planned = applyAgendaChanges(replanned, {
    done: reply.done ?? [],
    dropped: reply.dropped ?? [],
    added: reply.added ?? [],
  });
  replaceAgent(state, {
    ...planned.agent,
    intention: reply.intention || agent.intention,
    mood: reply.mood ?? agent.mood,
    lastThought: chooseLastThought(agent, reply, state.tick),
  });
  for (const text of planned.streamTexts) appendToStream(state, agentId, text);
  if (reply.remember !== undefined) markToRemember(state, agentId, reply.remember);
  if (plan.isReckoning) {
    state.agentMemories[agentId] = oweReflection(getAgentMemory(state, agentId));
  }
}

/** Only the agent knows it looked for something that isn't there, so onlookers learn nothing. */
function noteUnknownName(context: TickContext, agentId: string, note: string): void {
  const { state } = context;
  getAgentRuntime(state, agentId).lastFailure = note;
  appendToStream(state, agentId, note);
}

/**
 * Applies one decision: free acts, notes of names that weren't found, the answer to an offer,
 * then its first act with its words. Choosing anything but `continue` stops the current action
 * first and puts the decision's later acts in place of any queued before; `continue` keeps them.
 */
export function applyDecisionPlan(context: TickContext, plan: DecisionPlan): void {
  const { state, result } = context;
  const { agentId } = plan;
  // A reply for someone who died since it was asked for (or earlier in this tick) is dropped.
  if (isDead(findAgent(state, agentId))) return;
  const isContinuing =
    plan.action.kind === "continue" && findAgent(state, agentId).currentAction !== null;
  const runtime = getAgentRuntime(state, agentId);
  if (!isContinuing) {
    stopCurrentAction(context, agentId);
    runtime.queuedActs = plan.queued;
    runtime.isAwaitingAnswer = false;
  }
  applyFreeActs(context, plan);
  runtime.lastFailure = null;
  for (const note of plan.unknownNameNotes) noteUnknownName(context, agentId, note);
  markAgentChanged(result, agentId);
  result.decidedAgentIds.push(agentId);
  answerOffer(context, plan);
  if (isContinuing) {
    if (plan.speech !== null) speak(context, agentId, plan.speech);
    return;
  }
  const act: PlannedAct =
    plan.action.kind === "continue"
      ? { kind: "wait", minutes: config.decision.defaultWaitMinutes }
      : plan.action;
  startAct(context, agentId, act, plan.speech);
}
