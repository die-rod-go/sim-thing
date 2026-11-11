import type { Bucket, Memory, Volume, WorldEvent } from "@village/shared";
import { config } from "../config";
import type { EventPerception, PerceivedEvent } from "../perception/types";
import { isTakingPart, type ConversationLog } from "./conversation";
import type { MemoryIdGenerator, MemoryReader } from "./memory-store";
import { extractTags, uniqueTags } from "./tags";

/** What filing needs besides the event itself. */
export interface FilingContext {
  /** Existing memories, used to skip duplicates. */
  memories: MemoryReader;
  idGenerator: MemoryIdGenerator;
  /** Recent speech, used to tell conversation participants from bystanders. */
  conversationLog: ConversationLog;
  /** Agent, object and place names that speech is searched for when tagging. */
  knownNames: readonly string[];
  /** Per listener, the agent ids whose voices it recognizes without seeing them. */
  knownAgentIdsByListener: Readonly<Record<string, readonly string[]>>;
}

interface MemoryDraft {
  agentId: string;
  bucket: Bucket;
  text: string;
  tags: string[];
}

const ELLIPSIS = "…";
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

/** Keeps a memory to `maxChars` (default `maxMemoryChars`), ending a cut text with an ellipsis. */
export function truncateMemoryText(
  text: string,
  maxChars: number = config.memory.maxMemoryChars,
): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - ELLIPSIS.length).trimEnd() + ELLIPSIS;
}

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

function eventTags(event: WorldEvent, context: FilingContext, isActorKnown: boolean): string[] {
  return uniqueTags([
    isActorKnown ? event.actorName : null,
    event.targetName,
    event.place,
    ...extractTags(event.description, context.knownNames),
    ...(event.speech === undefined ? [] : extractTags(event.speech.words, context.knownNames)),
  ]);
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
  context: FilingContext,
): MemoryDraft[] {
  // The dead remember nothing more, not even dying; a thing remembers nothing at all.
  if (event.kind === "died" || event.isActorThing === true) return [];
  const tags = eventTags(event, context, true);
  const actorDraft: MemoryDraft = isSpeech(event)
    ? {
        agentId: event.actorId,
        bucket: "conversations",
        text: `I ${SPEECH_PAST_TENSE[event.speech.volume]}: "${event.speech.words}"`,
        tags,
      }
    : {
        agentId: event.actorId,
        bucket: "did",
        text: `I ${event.actorDescription ?? event.description}`,
        tags,
      };
  const targetId = aimedTargetId(event, perceptions);
  if (targetId !== null && event.targetDescription !== undefined) {
    const text = `${event.actorName} ${event.targetDescription}`;
    return [actorDraft, { agentId: targetId, bucket: "did", text, tags }];
  }
  const recipientId = giveRecipientId(event);
  if (recipientId === null) return [actorDraft];
  const recipientDraft: MemoryDraft = {
    agentId: recipientId,
    bucket: "did",
    text: describeGiftForRecipient(event),
    tags: uniqueTags([...tags, event.item]),
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
): MemoryDraft | null {
  const isActorKnown = recognizesActor(perception, event, context);
  const speakerLabel = isActorKnown ? event.actorName : UNKNOWN_SPEAKER;
  const { words, volume } = event.speech;
  const base = { agentId: perception.agentId, tags: eventTags(event, context, isActorKnown) };
  if (perception.hearing === "clear") {
    if (isTakingPart(context.conversationLog, perception.agentId, event.actorId, event.tick)) {
      const text = `${capitalize(speakerLabel)} ${SPEECH_PAST_TENSE[volume]}: "${words}"`;
      return { ...base, bucket: "conversations", text };
    }
    const text = `I overheard ${speakerLabel} ${SPEECH_BASE_FORM[volume]}: "${words}"`;
    return { ...base, bucket: "overheard", text };
  }
  const placeTags = uniqueTags([isActorKnown ? event.actorName : null, event.place]);
  if (perception.hearing === "muffled") {
    const text =
      `I heard ${speakerLabel}'s voice from ${describePlace(event.place)}` +
      `${describeDirection(perception.direction)} but couldn't make out the words`;
    return { agentId: perception.agentId, bucket: "overheard", text, tags: placeTags };
  }
  if (!perception.isInSight) return null;
  const text = `I saw ${event.actorName} speaking but couldn't hear the words`;
  return { agentId: perception.agentId, bucket: "seen", text, tags: placeTags };
}

function draftForActionPerceiver(
  perception: EventPerception,
  event: WorldEvent,
  context: FilingContext,
): MemoryDraft | null {
  const agentId = perception.agentId;
  if (perception.isInSight) {
    const text = `I saw that ${event.actorName} ${event.description}`;
    return { agentId, bucket: "seen", text, tags: eventTags(event, context, true) };
  }
  const source = `${describePlace(event.place)}${describeDirection(perception.direction)}`;
  if (perception.hearing === "clear") {
    const text = `I heard sounds from ${source}: someone ${event.description}`;
    return { agentId, bucket: "seen", text, tags: eventTags(event, context, false) };
  }
  if (perception.hearing === "muffled") {
    const text = `I heard muffled sounds from ${source}`;
    return { agentId, bucket: "seen", text, tags: uniqueTags([event.place]) };
  }
  return null;
}

function draftsForPerceivers(
  event: WorldEvent,
  perceptions: readonly EventPerception[],
  context: FilingContext,
): MemoryDraft[] {
  const participantIds = new Set([
    event.actorId,
    giveRecipientId(event),
    aimedTargetId(event, perceptions),
  ]);
  const drafts: MemoryDraft[] = [];
  for (const perception of perceptions) {
    if (participantIds.has(perception.agentId)) continue;
    const draft = isSpeech(event)
      ? draftForSpeechPerceiver(perception, event, context)
      : draftForActionPerceiver(perception, event, context);
    if (draft !== null) drafts.push(draft);
  }
  return drafts;
}

/**
 * Duplicates are judged by identical text for the same agent within `duplicateWindowTicks`, so an
 * action's start and its result ("started baking", "finished baking") are both kept.
 */
function isDuplicate(draft: MemoryDraft, tick: number, recentMemories: readonly Memory[]): boolean {
  return recentMemories.some(
    (memory) =>
      memory.agentId === draft.agentId &&
      memory.text === draft.text &&
      tick - memory.tick <= config.memory.duplicateWindowTicks,
  );
}

function createMemory(draft: MemoryDraft, tick: number, idGenerator: MemoryIdGenerator): Memory {
  return {
    id: idGenerator.nextId(draft.agentId, tick),
    agentId: draft.agentId,
    bucket: draft.bucket,
    tick,
    text: draft.text,
    tags: draft.tags,
    strength: config.memory.newMemoryStrength,
    lastRecalledTick: null,
  };
}

function materializeDrafts(
  drafts: readonly MemoryDraft[],
  tick: number,
  context: FilingContext,
): Memory[] {
  const filed: Memory[] = [];
  for (const draft of drafts) {
    const truncated = { ...draft, text: truncateMemoryText(draft.text) };
    const recentMemories = [...context.memories.listByAgent(draft.agentId), ...filed];
    if (isDuplicate(truncated, tick, recentMemories)) continue;
    filed.push(createMemory(truncated, tick, context.idGenerator));
  }
  return filed;
}

/**
 * Files one world event for everyone involved: the actor (and a give's recipient) remember it as
 * their own, and each perceiver remembers what it saw or heard. Returns the new memories; the
 * caller adds them to the store.
 */
export function fileEvent(perceived: PerceivedEvent, context: FilingContext): Memory[] {
  const { event, perceptions } = perceived;
  const drafts = [
    ...draftsForParticipants(event, perceptions, context),
    ...draftsForPerceivers(event, perceptions, context),
  ];
  return materializeDrafts(drafts, event.tick, context);
}

/** A `places` memory for an agent's first visit to a place, naming the objects found there. */
export function fileFirstVisit(
  agentId: string,
  place: string,
  objectNames: readonly string[],
  tick: number,
  idGenerator: MemoryIdGenerator,
): Memory {
  const visit = `I visited ${describePlace(place)} for the first time`;
  const objectList = objectNames.map(describePlace);
  const lastObject = objectList.pop();
  const found =
    lastObject === undefined
      ? ""
      : `; I found ${objectList.length > 0 ? `${objectList.join(", ")} and ` : ""}${lastObject} here`;
  const draft: MemoryDraft = {
    agentId,
    bucket: "places",
    text: truncateMemoryText(visit + found),
    tags: uniqueTags([place, ...objectNames]),
  };
  return createMemory(draft, tick, idGenerator);
}

/** A `people` memory from the agent's own note about a person, tagged with that person. */
export function filePersonNote(
  agentId: string,
  person: string,
  text: string,
  tick: number,
  idGenerator: MemoryIdGenerator,
  knownNames: readonly string[] = [],
): Memory {
  const draft: MemoryDraft = {
    agentId,
    bucket: "people",
    text: truncateMemoryText(`About ${person}: ${text}`),
    tags: uniqueTags([person, ...extractTags(text, knownNames)]),
  };
  return createMemory(draft, tick, idGenerator);
}
