import type { Volume, WorldEvent } from "@village/shared";
import type { EventPerception, PerceivedEvent } from "../perception/types";
import { isTakingPart, type ConversationLog } from "./conversation";

/** What filing needs besides the event itself. */
export interface FilingContext {
  /** Recent speech, used to tell conversation participants from bystanders. */
  conversationLog: ConversationLog;
  /** Per listener, the agent ids whose voices it recognizes without seeing them. */
  knownAgentIdsByListener: Readonly<Record<string, readonly string[]>>;
}

/** One event as one agent took it in: the text that goes into that agent's stream. */
export interface FiledEvent {
  agentId: string;
  text: string;
}

const UNKNOWN_SPEAKER = "someone";

const SPEECH_PAST_TENSE: Record<Volume, string> = {
  whisper: "whispered",
  normal: "said",
  shout: "shouted",
};

const SPEECH_BASE_FORM: Record<Volume, string> = {
  whisper: "whisper",
  normal: "say",
  shout: "shout",
};

/** "bakery" reads as "the bakery"; names that are capitalized or already have "the" stay as is. */
export function describePlace(name: string): string {
  const startsCapitalized = name.charAt(0) !== name.charAt(0).toLowerCase();
  if (startsCapitalized || name.toLowerCase().startsWith("the ")) return name;
  return `the ${name}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function describeDirection(direction: string | null): string {
  return direction === null ? "" : `, to the ${direction}`;
}

function isSpeech(
  event: WorldEvent,
): event is WorldEvent & { speech: NonNullable<WorldEvent["speech"]> } {
  return event.kind === "said" && event.speech !== undefined;
}

function giveRecipientId(event: WorldEvent): string | null {
  if (event.kind !== "gave" || event.targetId === null || event.targetId === event.actorId) {
    return null;
  }
  return event.targetId;
}

function describeGiftForRecipient(event: WorldEvent): string {
  if (event.itemText !== undefined) return `${event.actorName} gave me ${event.itemText}`;
  if (event.item === undefined) return `${event.actorName} gave me something`;
  const amount = event.amount === undefined ? "" : `${event.amount} `;
  return `${event.actorName} gave me ${amount}${event.item}`;
}

/**
 * The agent an act was aimed at, who files it as done to them ("Tobias hit me with a knife"), if
 * they took it in: a sleeper doesn't perceive the attack that wakes them.
 */
function aimedTargetId(event: WorldEvent, perceptions: readonly EventPerception[]): string | null {
  if (event.targetDescription === undefined || event.targetId === null) return null;
  if (event.targetId === event.actorId) return null;
  const targetId = event.targetId;
  return perceptions.some((perception) => perception.agentId === targetId) ? targetId : null;
}

function draftsForParticipants(
  event: WorldEvent,
  perceptions: readonly EventPerception[],
): FiledEvent[] {
  // The dead remember nothing more, not even dying; a thing remembers nothing at all.
  if (event.kind === "died" || event.isActorThing === true) return [];
  const actorDraft: FiledEvent = isSpeech(event)
    ? {
        agentId: event.actorId,
        text: `I ${SPEECH_PAST_TENSE[event.speech.volume]}: "${event.speech.words}"`,
      }
    : {
        agentId: event.actorId,
        text: `I ${event.actorDescription ?? event.description}`,
      };
  const targetId = aimedTargetId(event, perceptions);
  if (targetId !== null && event.targetDescription !== undefined) {
    const text = `${event.actorName} ${event.targetDescription}`;
    return [actorDraft, { agentId: targetId, text }];
  }
  const recipientId = giveRecipientId(event);
  if (recipientId === null) return [actorDraft];
  const recipientDraft: FiledEvent = {
    agentId: recipientId,
    text: describeGiftForRecipient(event),
  };
  return [actorDraft, recipientDraft];
}

function recognizesActor(
  perception: EventPerception,
  event: WorldEvent,
  context: FilingContext,
): boolean {
  if (perception.isInSight) return true;
  const knownAgentIds = context.knownAgentIdsByListener[perception.agentId] ?? [];
  return knownAgentIds.includes(event.actorId);
}

function draftForSpeechPerceiver(
  perception: EventPerception,
  event: WorldEvent & { speech: NonNullable<WorldEvent["speech"]> },
  context: FilingContext,
): FiledEvent | null {
  const isActorKnown = recognizesActor(perception, event, context);
  const speakerLabel = isActorKnown ? event.actorName : UNKNOWN_SPEAKER;
  const { words, volume } = event.speech;
  const base = { agentId: perception.agentId };
  if (perception.hearing === "clear") {
    if (isTakingPart(context.conversationLog, perception.agentId, event.actorId, event.tick)) {
      const text = `${capitalize(speakerLabel)} ${SPEECH_PAST_TENSE[volume]}: "${words}"`;
      return { ...base, text };
    }
    const text = `I overheard ${speakerLabel} ${SPEECH_BASE_FORM[volume]}: "${words}"`;
    return { ...base, text };
  }
  if (perception.hearing === "muffled") {
    const text =
      `I heard ${speakerLabel}'s voice from ${describePlace(event.place)}` +
      `${describeDirection(perception.direction)} but couldn't make out the words`;
    return { agentId: perception.agentId, text };
  }
  if (!perception.isInSight) return null;
  const text = `I saw ${event.actorName} speaking but couldn't hear the words`;
  return { agentId: perception.agentId, text };
}

function draftForActionPerceiver(
  perception: EventPerception,
  event: WorldEvent,
): FiledEvent | null {
  const agentId = perception.agentId;
  if (perception.isInSight) {
    const text = `I saw that ${event.actorName} ${event.description}`;
    return { agentId, text };
  }
  const source = `${describePlace(event.place)}${describeDirection(perception.direction)}`;
  if (perception.hearing === "clear") {
    const text = `I heard sounds from ${source}: someone ${event.description}`;
    return { agentId, text };
  }
  if (perception.hearing === "muffled") {
    const text = `I heard muffled sounds from ${source}`;
    return { agentId, text };
  }
  return null;
}

/** The agent carrying the thing an event is about files it as their own ("My pickaxe broke"). */
function draftForPerceiver(
  perception: EventPerception,
  event: WorldEvent,
  context: FilingContext,
): FiledEvent | null {
  if (perception.agentId === event.holderId && event.holderDescription !== undefined) {
    return {
      agentId: perception.agentId,
      text: capitalize(event.holderDescription),
    };
  }
  return isSpeech(event)
    ? draftForSpeechPerceiver(perception, event, context)
    : draftForActionPerceiver(perception, event);
}

function draftsForPerceivers(
  event: WorldEvent,
  perceptions: readonly EventPerception[],
  context: FilingContext,
): FiledEvent[] {
  const participantIds = new Set([
    event.actorId,
    giveRecipientId(event),
    aimedTargetId(event, perceptions),
  ]);
  const drafts: FiledEvent[] = [];
  for (const perception of perceptions) {
    if (participantIds.has(perception.agentId)) continue;
    const draft = draftForPerceiver(perception, event, context);
    if (draft !== null) drafts.push(draft);
  }
  return drafts;
}

/**
 * Files one world event for everyone involved: the actor (and a give's recipient) take it in as
 * their own, and each perceiver as what it saw or heard. Returns one text per agent; the caller
 * appends them to the streams.
 */
export function fileEvent(perceived: PerceivedEvent, context: FilingContext): FiledEvent[] {
  const { event, perceptions } = perceived;
  return [
    ...draftsForParticipants(event, perceptions),
    ...draftsForPerceivers(event, perceptions, context),
  ];
}
