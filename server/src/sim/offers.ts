import { describeCount, findDefinition, findDefinitionByName, type Agent } from "@village/shared";
import { config } from "../config";
import { resolveName } from "../decision/resolve-name";
import {
  chooseEntitiesToGive,
  computeChebyshevDistance,
  executeGive,
  type GiveRequest,
} from "../economy/give";
import { isAsleep } from "../economy/sleep";
import { canSee } from "../perception/sight";
import { isDead } from "../status/health";
import { WAIT_ACTION } from "./action-phrases";
import { getAgentRuntime, requestDecision, type PendingOffer } from "./agent-runtime";
import type { DecisionPlan, PlannedAction } from "./decision-runner";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import {
  appendToStream,
  buildPerceptionWorld,
  describeAgentAsSeen,
  findAgent,
  listOthersAsSeen,
  markAgentChanged,
  markEntityChanged,
  replaceAgent,
} from "./world-access";
import type { WorldState } from "./world-state";

const words = config.economy.offer;

type OfferGoods = Pick<PendingOffer, "itemText" | "inReturn">;

/** What the offer phrases name: who gives, who is offered, and what. */
interface OfferNames {
  giver: Agent;
  recipient: Agent;
  offer: OfferGoods;
}

/** "3 coins", or for a trade "1 bread for 10 coins". */
export function describeOfferWhat(offer: OfferGoods): string {
  return offer.inReturn === null
    ? offer.itemText
    : `${offer.itemText}${words.tradeJoiner}${offer.inReturn.itemText}`;
}

interface OfferParties extends OfferNames {
  offer: PendingOffer;
}

/** Fills `{giver}`, `{recipient}`, `{what}` and `{price}` in one of the offer phrases. */
function fillOfferWords(phrase: string, parties: OfferNames): string {
  return phrase
    .split("{giver}")
    .join(parties.giver.name)
    .split("{recipient}")
    .join(parties.recipient.name)
    .split("{what}")
    .join(describeOfferWhat(parties.offer))
    .split("{price}")
    .join(parties.offer.inReturn?.itemText ?? "");
}

/** The giver's offer was answered or lapsed: it stops waiting and goes on with its queued acts. */
function endWaitingForAnswer(context: TickContext, giverId: string): void {
  const runtime = getAgentRuntime(context.state, giverId);
  if (!runtime.isAwaitingAnswer) return;
  runtime.isAwaitingAnswer = false;
  const giver = findAgent(context.state, giverId);
  if (giver.currentAction?.kind !== WAIT_ACTION) return;
  replaceAgent(context.state, { ...giver, currentAction: null });
  markAgentChanged(context.result, giverId);
}

/** Only the living remember, so a dead giver or recipient files nothing. */
function noteForBoth(state: WorldState, parties: OfferParties, phrases: [string, string]): void {
  const [recipientPhrase, giverPhrase] = phrases;
  if (!isDead(parties.recipient)) {
    appendToStream(state, parties.recipient.id, fillOfferWords(recipientPhrase, parties));
  }
  if (!isDead(parties.giver)) {
    appendToStream(state, parties.giver.id, fillOfferWords(giverPhrase, parties));
  }
}

function findParties(state: WorldState, recipientId: string): OfferParties | null {
  const offer = getAgentRuntime(state, recipientId).pendingOffer;
  if (offer === null) return null;
  return {
    giver: findAgent(state, offer.giverId),
    recipient: findAgent(state, recipientId),
    offer,
  };
}

/** Whether two hands can meet: the giver sees the recipient, so no wall is between them. */
function canReachAcross(state: WorldState, giver: Agent, recipient: Agent): boolean {
  return canSee(
    buildPerceptionWorld(state),
    giver.pos,
    recipient.pos,
    config.perception.sightRangeTiles,
  );
}

/** Whether the giver is still alive and within reach, so the offer still stands. */
function isOfferStanding(state: WorldState, parties: OfferParties): boolean {
  const { giver, recipient } = parties;
  return (
    !isDead(giver) &&
    computeChebyshevDistance(giver.pos, recipient.pos) <= config.economy.giveReachTiles &&
    canReachAcross(state, giver, recipient)
  );
}

/** Why the giver can't offer this recipient anything now, or null when it can. */
function findOfferBlocker(state: WorldState, giver: Agent, recipient: Agent): string | null {
  const pending = getAgentRuntime(state, recipient.id).pendingOffer;
  const phrase = isAsleep(recipient)
    ? words.asleepReason
    : pending?.giverId === giver.id
      ? words.alreadyOfferingReason
      : pending !== null
        ? words.alreadyOfferedReason
        : !canReachAcross(state, giver, recipient)
          ? words.outOfSightReason
          : null;
  if (phrase === null) return null;
  const offer = { itemText: pending?.itemText ?? "", inReturn: pending?.inReturn ?? null };
  return fillOfferWords(phrase, { giver, recipient, offer });
}

/** What the giver is offering someone, waiting for their answer; null when nothing. */
export function findOwnOffer(
  state: WorldState,
  giverId: string,
): { recipientName: string; itemText: string } | null {
  for (const [recipientId, runtime] of Object.entries(state.agentRuntimes)) {
    const offer = runtime.pendingOffer;
    if (offer === null || offer.giverId !== giverId) continue;
    const recipient = findAgent(state, recipientId);
    return { recipientName: describeAgentAsSeen(recipient), itemText: describeOfferWhat(offer) };
  }
  return null;
}

function withdrawOffer(context: TickContext, parties: OfferParties): void {
  getAgentRuntime(context.state, parties.recipient.id).pendingOffer = null;
  endWaitingForAnswer(context, parties.giver.id);
  noteForBoth(context.state, parties, [words.withdrawnRecipientEntry, words.withdrawnGiverEntry]);
  markAgentChanged(context.result, parties.recipient.id);
}

function leaveOfferUnanswered(context: TickContext, parties: OfferParties): void {
  getAgentRuntime(context.state, parties.recipient.id).pendingOffer = null;
  endWaitingForAnswer(context, parties.giver.id);
  noteForBoth(context.state, parties, [words.unansweredRecipientEntry, words.unansweredGiverEntry]);
  markAgentChanged(context.result, parties.recipient.id);
}

/**
 * A `give` offers things the giver carries to someone in reach; nothing changes hands until the
 * recipient accepts. The recipient gets an urgent decision to answer it.
 */
export function makeOffer(
  context: TickContext,
  agentId: string,
  action: Extract<PlannedAction, { kind: "give" }>,
): void {
  const { state, result } = context;
  const giver = findAgent(state, agentId);
  const what = `${action.amount} ${action.item.trim().toLowerCase()}`;
  const recipientId = resolveName(action.target, listOthersAsSeen(state, agentId));
  const fail = (attempt: string, reason: string) =>
    failAction(state, result, agentId, attempt, reason);
  if (!recipientId) {
    fail(`hand ${what} to ${action.target}`, "there was no one by that name");
    return;
  }
  const recipient = findAgent(state, recipientId);
  const attempt = `hand ${recipient.name} ${what}`;
  if (isDead(recipient)) {
    fail(`hand ${what} to ${describeAgentAsSeen(recipient)}`, "a body can't take anything");
    return;
  }
  const request = { giver, recipient, itemName: action.item, amount: action.amount };
  const chosen = chooseEntitiesToGive(state, request);
  if (!chosen.isSuccess) {
    fail(attempt, chosen.reason);
    return;
  }
  const recipientRuntime = getAgentRuntime(state, recipientId);
  const blocker = findOfferBlocker(state, giver, recipient);
  if (blocker !== null) {
    fail(`hand ${recipient.name} ${chosen.description}`, blocker);
    return;
  }
  const inReturn = describeAskedReturn(state, action.inReturn);
  if (typeof inReturn === "string") {
    const price = `${action.inReturn?.amount ?? ""} ${action.inReturn?.item ?? ""}`.trim();
    fail(attempt, words.unknownReturnReason.split("{price}").join(price));
    return;
  }
  const parties = { giver, recipient, offer: { itemText: chosen.description, inReturn } };
  const event = createEvent(state, giver, {
    kind: "offered",
    description: fillOfferWords(words.offeredDescription, parties),
    targetId: recipientId,
    targetName: recipient.name,
    targetDescription: fillOfferWords(words.offeredTargetDescription, parties),
    item: findDefinition(state.items, chosen.definitionId).name,
    amount: action.amount,
    itemText: chosen.description,
  });
  broadcastEvent(state, event, result);
  recipientRuntime.pendingOffer = {
    eventId: event.id,
    giverId: agentId,
    itemName: action.item,
    amount: action.amount,
    itemText: chosen.description,
    inReturn,
    offeredAtTick: state.tick,
  };
  requestDecision(recipientRuntime, fillOfferWords(words.decisionReason, parties), true);
  markAgentChanged(result, agentId);
  markAgentChanged(result, recipientId);
}

/**
 * What the giver asks back, named and counted ("10 coins"); null when nothing, or the name asked
 * for when nothing in the world goes by it.
 */
function describeAskedReturn(
  state: WorldState,
  asked: { item: string; amount: number } | undefined,
): PendingOffer["inReturn"] | string {
  if (asked === undefined) return null;
  const definition = findDefinitionByName(state.items, asked.item);
  if (definition === undefined) return asked.item;
  return {
    itemName: asked.item,
    amount: asked.amount,
    itemText: describeCount(definition, asked.amount),
  };
}

/** Moves the things from one agent to the other, as checked just before, and lets all around see. */
function handOver(context: TickContext, request: GiveRequest): void {
  const { state, result } = context;
  const given = executeGive(state, request);
  if (!given.isSuccess) throw new Error(`a checked give failed: ${given.reason}`);
  for (const entityId of given.movedEntityIds) markEntityChanged(result, entityId);
  markAgentChanged(result, request.giver.id);
  markAgentChanged(result, request.recipient.id);
  const event = createEvent(state, request.giver, {
    kind: "gave",
    description: `gave ${request.recipient.name} ${given.description}`,
    targetId: request.recipient.id,
    targetName: request.recipient.name,
    item: findDefinition(state.items, given.definitionId).name,
    amount: given.amount,
    itemText: given.description,
  });
  broadcastEvent(state, event, result);
}

/** Accepting moves the gift, and for a trade what was asked back too: both at once, or neither. */
function acceptOffer(context: TickContext, parties: OfferParties): void {
  const { state } = context;
  const { giver, recipient, offer } = parties;
  const gift = { giver, recipient, itemName: offer.itemName, amount: offer.amount };
  if (!chooseEntitiesToGive(state, gift).isSuccess) {
    noteForBoth(state, parties, [words.acceptFailedRecipientEntry, words.acceptFailedGiverEntry]);
    return;
  }
  const payment =
    offer.inReturn === null
      ? null
      : {
          giver: recipient,
          recipient: giver,
          itemName: offer.inReturn.itemName,
          amount: offer.inReturn.amount,
        };
  if (payment !== null && !chooseEntitiesToGive(state, payment).isSuccess) {
    noteForBoth(state, parties, [words.tradeShortRecipientEntry, words.tradeShortGiverEntry]);
    return;
  }
  handOver(context, gift);
  if (payment !== null) handOver(context, payment);
}

function declineOffer(context: TickContext, parties: OfferParties): void {
  const { state, result } = context;
  const { giver, recipient } = parties;
  const event = createEvent(state, recipient, {
    kind: "declined",
    description: fillOfferWords(words.declinedDescription, parties),
    targetId: giver.id,
    targetName: giver.name,
    targetDescription: fillOfferWords(words.declinedTargetDescription, parties),
  });
  broadcastEvent(state, event, result);
  if (isDead(giver)) return;
  const reason = fillOfferWords(words.declinedDecisionReason, parties);
  requestDecision(getAgentRuntime(state, giver.id), reason, true);
}

/**
 * Answers the offer the decision was shown, before its action runs: accept hands the things over,
 * decline is seen by all around, and no answer turns it down quietly. A decision asked for before
 * the offer was made leaves it standing.
 */
export function answerOffer(context: TickContext, plan: DecisionPlan): void {
  const parties = findParties(context.state, plan.agentId);
  if (parties === null || parties.offer.eventId !== plan.offerEventId) return;
  if (!isOfferStanding(context.state, parties)) {
    withdrawOffer(context, parties);
    return;
  }
  getAgentRuntime(context.state, plan.agentId).pendingOffer = null;
  endWaitingForAnswer(context, parties.giver.id);
  markAgentChanged(context.result, plan.agentId);
  const answer = plan.reply.reply.offer;
  if (answer === "accept") acceptOffer(context, parties);
  else if (answer === "decline") declineOffer(context, parties);
  else leaveOfferUnanswered(context, parties);
}

/** Offers whose giver left reach or died are withdrawn; ones left too long go unanswered. */
export function lapseOffers(context: TickContext): void {
  const { state } = context;
  const lapseTicks = Math.ceil(config.economy.offerLapseMinutes / config.clock.minutesPerTick);
  for (const recipientId of Object.keys(state.agentRuntimes)) {
    const parties = findParties(state, recipientId);
    if (parties === null) continue;
    if (isDead(parties.recipient) || !isOfferStanding(state, parties)) {
      withdrawOffer(context, parties);
    } else if (state.tick - parties.offer.offeredAtTick >= lapseTicks) {
      leaveOfferUnanswered(context, parties);
    }
  }
}

/** The offer a decision is shown, captured when it is asked for. */
export function findShownOfferEventId(state: WorldState, agentId: string): number | null {
  return getAgentRuntime(state, agentId).pendingOffer?.eventId ?? null;
}
