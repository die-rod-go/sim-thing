import { findDefinition, type Agent } from "@village/shared";
import { config } from "../config";
import { resolveName } from "../decision/resolve-name";
import { chooseEntitiesToGive, computeChebyshevDistance, executeGive } from "../economy/give";
import { isAsleep } from "../economy/sleep";
import { isDead } from "../status/health";
import { getAgentRuntime, requestDecision, type PendingOffer } from "./agent-runtime";
import type { DecisionPlan, PlannedAction } from "./decision-runner";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import {
  appendToStream,
  describeAgentAsSeen,
  findAgent,
  listOthersAsSeen,
  markAgentChanged,
  markEntityChanged,
} from "./world-access";
import type { WorldState } from "./world-state";

const words = config.economy.offer;

/** What the offer phrases name: who gives, who is offered, and what. */
interface OfferNames {
  giver: Agent;
  recipient: Agent;
  offer: Pick<PendingOffer, "itemText">;
}

interface OfferParties extends OfferNames {
  offer: PendingOffer;
}

/** Fills `{giver}`, `{recipient}` and `{what}` in one of the offer phrases. */
function fillOfferWords(phrase: string, parties: OfferNames): string {
  return phrase
    .split("{giver}")
    .join(parties.giver.name)
    .split("{recipient}")
    .join(parties.recipient.name)
    .split("{what}")
    .join(parties.offer.itemText);
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

/** Whether the giver is still alive and within reach, so the offer still stands. */
function isOfferStanding(parties: OfferParties): boolean {
  const { giver, recipient } = parties;
  return (
    !isDead(giver) &&
    computeChebyshevDistance(giver.pos, recipient.pos) <= config.economy.giveReachTiles
  );
}

function withdrawOffer(context: TickContext, parties: OfferParties): void {
  getAgentRuntime(context.state, parties.recipient.id).pendingOffer = null;
  noteForBoth(context.state, parties, [words.withdrawnRecipientEntry, words.withdrawnGiverEntry]);
  markAgentChanged(context.result, parties.recipient.id);
}

function leaveOfferUnanswered(context: TickContext, parties: OfferParties): void {
  getAgentRuntime(context.state, parties.recipient.id).pendingOffer = null;
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
  const blockingPhrase = isAsleep(recipient)
    ? words.asleepReason
    : recipientRuntime.pendingOffer !== null
      ? words.alreadyOfferedReason
      : null;
  if (blockingPhrase !== null) {
    const reason = blockingPhrase.split("{recipient}").join(recipient.name);
    fail(`hand ${recipient.name} ${chosen.description}`, reason);
    return;
  }
  const parties = { giver, recipient, offer: { itemText: chosen.description } };
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
    offeredAtTick: state.tick,
  };
  requestDecision(recipientRuntime, fillOfferWords(words.decisionReason, parties), true);
  markAgentChanged(result, agentId);
  markAgentChanged(result, recipientId);
}

function acceptOffer(context: TickContext, parties: OfferParties): void {
  const { state, result } = context;
  const { giver, recipient, offer } = parties;
  const given = executeGive(state, {
    giver,
    recipient,
    itemName: offer.itemName,
    amount: offer.amount,
  });
  if (!given.isSuccess) {
    noteForBoth(state, parties, [words.acceptFailedRecipientEntry, words.acceptFailedGiverEntry]);
    return;
  }
  for (const entityId of given.movedEntityIds) markEntityChanged(result, entityId);
  markAgentChanged(result, giver.id);
  const event = createEvent(state, giver, {
    kind: "gave",
    description: `gave ${recipient.name} ${given.description}`,
    targetId: recipient.id,
    targetName: recipient.name,
    item: findDefinition(state.items, given.definitionId).name,
    amount: given.amount,
    itemText: given.description,
  });
  broadcastEvent(state, event, result);
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
  if (!isOfferStanding(parties)) {
    withdrawOffer(context, parties);
    return;
  }
  getAgentRuntime(context.state, plan.agentId).pendingOffer = null;
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
    if (isDead(parties.recipient) || !isOfferStanding(parties)) {
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
