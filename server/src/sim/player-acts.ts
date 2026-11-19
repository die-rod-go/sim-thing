import type { Agent, DecisionAct, DecisionAction, PlayerAct, Position } from "@village/shared";
import { config } from "../config";
import { computeChebyshevDistance } from "../economy/give";
import { isDead } from "../status/health";
import { findPlaceAt } from "../world/map-loader";
import { isWalkable } from "../world/pathfinding";
import { describeLocation } from "../world/place-names";
import { speak } from "./act-execution";
import { describeQueuedActs } from "./act-queue";
import { applyDecisionPlan } from "./action-executor";
import { stopCurrentAction } from "./action-stopping";
import { getAgentRuntime } from "./agent-runtime";
import {
  planAct,
  planSpeech,
  type DecidedReply,
  type DecisionPlan,
  type PlannedAction,
} from "./decision-runner";
import { findPlayedAgent } from "./player-control";
import type { PlayerInbox } from "./player-inbox";
import { needsPlayer } from "./player-turn";
import type { TickContext } from "./tick-context";
import { stepOnce } from "./walking";
import {
  findAgent,
  findAgentBlockingTile,
  listLivingAgents,
  markAgentChanged,
} from "./world-access";
import type { WorldState } from "./world-state";

const { refusals } = config.player;

/** How a tile reads as somewhere to be: "the bakery", "the road by the smithy". */
export function describeSpot(state: WorldState, pos: Position): string {
  return describeLocation(state.map, findPlaceAt(state.map, pos), pos);
}

function isOnMap(state: WorldState, pos: Position): boolean {
  const { width, height } = state.map.grid;
  return pos.x >= 0 && pos.y >= 0 && pos.x < width && pos.y < height;
}

/** Why the agent can't move onto the tile now, or null when it can. */
function findMoveRefusal(state: WorldState, agent: Agent, pos: Position): string | null {
  if (computeChebyshevDistance(agent.pos, pos) !== 1) return refusals.moveNotNextTo;
  if (!isOnMap(state, pos)) return refusals.moveOffMap;
  if (!isWalkable(state.map.grid, pos)) return refusals.moveIntoWall;
  if (findAgentBlockingTile(state, agent.id, pos) !== undefined) return refusals.moveIntoSomeone;
  return null;
}

/**
 * Why the act can't even be tried. Anything the world itself might refuse (a locked door, a verb
 * that doesn't fit) is left to fail in the world, where the agent and onlookers take it in.
 */
function findActRefusal(state: WorldState, agent: Agent, act: PlayerAct): string | null {
  const longestWords = Math.max(act.say?.length ?? 0, act.text?.length ?? 0);
  if (longestWords > config.player.maxWordsChars) return refusals.wordsTooLong;
  if (act.action === "move" && act.pos !== undefined) return findMoveRefusal(state, agent, act.pos);
  if (act.action === "walk_to" && act.pos !== undefined && !isWalkable(state.map.grid, act.pos)) {
    return refusals.walkToWall;
  }
  return null;
}

/**
 * Takes an act the player chose: checks it and lines it up for the clock. When the clock was
 * waiting for the player, what stopped it is let go, since this answers it. Returns why the act
 * was turned down, or null. Run between ticks.
 */
export function acceptPlayerAct(
  state: WorldState,
  inbox: PlayerInbox,
  act: PlayerAct,
): string | null {
  const agent = findPlayedAgent(state);
  if (agent === null) return refusals.notPlaying;
  if (isDead(agent)) return refusals.dead.split("{name}").join(agent.name);
  const refusal = findActRefusal(state, agent, act);
  if (refusal !== null) return refusal;
  const isAnsweringTurn = !inbox.hasAny(agent.id) && needsPlayer(state, agent);
  if (!inbox.put(agent.id, act)) return refusals.tooManyActs;
  if (isAnsweringTurn) getAgentRuntime(state, agent.id).pendingDecision = null;
  return null;
}

/** The act as a decision reply would have written it. */
function toDecisionAct(act: PlayerAct, action: DecisionAction): DecisionAct {
  return {
    action,
    target: act.target,
    verb: act.verb,
    item: act.item,
    from: act.from,
    text: act.text,
    amount: act.amount,
    inReturn: act.inReturn,
    inReturnAmount: act.inReturnAmount,
    minutes: act.minutes,
    say: act.say,
    volume: act.volume,
  };
}

/** `continue` with nothing under way only lets a minute pass, e.g. after answering an offer. */
function planPlayerAction(
  state: WorldState,
  agent: Agent,
  act: PlayerAct,
  decisionAct: DecisionAct,
): PlannedAction {
  if (act.action === "continue") {
    return agent.currentAction === null
      ? { kind: "wait", minutes: config.clock.minutesPerTick }
      : { kind: "continue" };
  }
  if (act.action === "walk_to" && act.pos !== undefined) {
    return { kind: "walk_to", target: describeSpot(state, act.pos), pos: { ...act.pos } };
  }
  return planAct(decisionAct);
}

/** A reply with no thought behind it but the player's own; nothing goes to the LLM call log. */
function buildPlayerReply(agent: Agent, act: PlayerAct, decisionAct: DecisionAct): DecidedReply {
  return {
    reply: {
      thought: "",
      intention: agent.intention,
      acts: [decisionAct],
      ...(act.offer === undefined ? {} : { offer: act.offer.answer }),
    },
    llmCallId: null,
  };
}

/** The player's act as a decision, so it is carried out exactly as an agent's would be. */
function buildPlayerPlan(
  state: WorldState,
  agent: Agent,
  act: PlayerAct,
  action: DecisionAction,
): DecisionPlan {
  const decisionAct = toDecisionAct(act, action);
  const decided = buildPlayerReply(agent, act, decisionAct);
  return {
    agentId: agent.id,
    isMidActionInterrupt: agent.currentAction !== null,
    reply: decided,
    action: planPlayerAction(state, agent, act, decisionAct),
    speech: planSpeech(decisionAct, decided),
    queued: [],
    unknownNameNotes: [],
    offerEventId: act.offer?.eventId ?? null,
    isReckoning: false,
  };
}

function fillText(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(value),
    template,
  );
}

function describeBareAct(state: WorldState, act: PlayerAct): string {
  const texts = config.player.pendingActTexts;
  if (act.action === "move" && act.pos !== undefined) {
    return fillText(texts.move, { place: describeSpot(state, act.pos) });
  }
  if (act.action === "walk_to" && act.pos !== undefined) {
    return fillText(texts.walkToTile, { place: describeSpot(state, act.pos) });
  }
  if (act.action === "continue" || act.action === "move") {
    return act.offer === undefined
      ? texts.continue
      : fillText(texts.answer, { answer: act.offer.answer });
  }
  const [queued] = describeQueuedActs([
    { act: planAct(toDecisionAct(act, act.action)), speech: null },
  ]);
  return queued ?? texts.wait;
}

/** An act still waiting for the clock, in a few words: 'walk to the bakery, saying "hello"'. */
export function describePlayerAct(state: WorldState, act: PlayerAct): string {
  const bare = describeBareAct(state, act);
  return act.say === undefined
    ? bare
    : fillText(config.player.pendingActTexts.withWords, { act: bare, words: act.say });
}

/**
 * One tile in any direction, at once and announced to no one: onlookers see where the agent
 * stands, not each move. It ends whatever the agent was doing, as any new act does, and does what
 * a door or the like allows in passing. A move the world no longer allows is dropped.
 */
function moveOneTile(context: TickContext, agent: Agent, act: PlayerAct, pos: Position): void {
  const { state, result } = context;
  if (findMoveRefusal(state, agent, pos) !== null) return;
  stopCurrentAction(context, agent.id);
  const runtime = getAgentRuntime(state, agent.id);
  runtime.queuedActs = [];
  runtime.isAwaitingAnswer = false;
  runtime.lastFailure = null;
  markAgentChanged(result, agent.id);
  const decisionAct = toDecisionAct(act, "wait");
  const speech = planSpeech(decisionAct, buildPlayerReply(agent, act, decisionAct));
  const attempt = fillText(config.player.moveAttempt, { place: describeSpot(state, pos) });
  const hasMoved = stepOnce(context, agent.id, pos, attempt);
  if (hasMoved && speech !== null) speak(context, agent.id, speech);
}

/**
 * Phase 5, after the agents' decisions are applied: each played agent's oldest waiting act is
 * carried out as its decision, and may fail in the world like anyone's.
 */
export function carryOutPlayerActs(context: TickContext): void {
  const inbox = context.dependencies.playerInbox;
  if (inbox === undefined) return;
  for (const { id: agentId } of listLivingAgents(context.state)) {
    const agent = findAgent(context.state, agentId);
    const act = agent.isPlayed ? inbox.take(agentId) : null;
    if (act === null) continue;
    if (act.action === "move") {
      if (act.pos !== undefined) moveOneTile(context, agent, act, act.pos);
      continue;
    }
    applyDecisionPlan(context, buildPlayerPlan(context.state, agent, act, act.action));
  }
}
