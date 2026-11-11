import type { Agent, EventSpeech, Volume, WorldEvent, WorldEventKind } from "@village/shared";
import { config } from "../config";
import { takeNextEventId, type WorldState } from "./world-state";

export interface EventFields {
  kind: WorldEventKind;
  description: string;
  targetId?: string | null;
  targetName?: string | null;
  loudness?: number | null;
  item?: string;
  amount?: number;
}

/** A world event by the agent, at the agent's tile, on the tick being simulated. */
export function createEvent(state: WorldState, actor: Agent, fields: EventFields): WorldEvent {
  const event: WorldEvent = {
    id: takeNextEventId(state),
    tick: state.tick,
    actorId: actor.id,
    actorName: actor.name,
    kind: fields.kind,
    targetId: fields.targetId ?? null,
    targetName: fields.targetName ?? null,
    place: actor.place,
    pos: { ...actor.pos },
    description: fields.description,
    loudness: fields.loudness ?? null,
  };
  if (fields.item !== undefined) event.item = fields.item;
  if (fields.amount !== undefined) event.amount = fields.amount;
  return event;
}

/** The decision behind a line of speech, kept on the event for the viewer. */
export interface SpeechOrigin {
  thought: string;
  llmCallId: number | null;
}

export function createSpeechEvent(
  state: WorldState,
  speaker: Agent,
  line: { words: string; volume: Volume },
  origin?: SpeechOrigin,
): WorldEvent {
  const { words, volume } = line;
  const verb = volume === "normal" ? "said" : `${volume}ed`;
  const speech: EventSpeech = { words, volume };
  const thought = origin?.thought.trim();
  if (thought) speech.thought = thought;
  const llmCallId = origin?.llmCallId;
  if (typeof llmCallId === "number") speech.llmCallId = llmCallId;
  return {
    ...createEvent(state, speaker, {
      kind: "said",
      description: `${verb} "${words}"`,
      loudness: config.perception.speechLoudness[volume],
    }),
    speech,
  };
}
