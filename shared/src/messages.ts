import { z } from "zod";
import type {
  Agent,
  ClockState,
  LlmCallRecord,
  Memory,
  PersonalityChange,
  Position,
  SimStats,
  Volume,
  WorldEvent,
  WorldObject,
} from "./types";
import type { SimTimeSettings } from "./time";

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("step") }),
  z.object({ type: z.literal("set_speed"), speed: z.number().positive() }),
  z.object({ type: z.literal("inspect_agent"), agentId: z.string().nullable() }),
  z.object({
    type: z.literal("update_settings"),
    dailyTokenBudget: z.number().int().positive(),
  }),
  z.object({ type: z.literal("reset") }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export interface SnapshotMessage {
  type: "snapshot";
  clock: ClockState;
  stats: SimStats;
  timeSettings: SimTimeSettings;
  baseTicksPerSecond: number;
  speedOptions: number[];
  agents: Agent[];
  objects: WorldObject[];
  recentEvents: WorldEvent[];
}

export interface TickMessage {
  type: "tick";
  tick: number;
  stats: SimStats;
}

export interface PausedMessage {
  type: "paused";
  isPaused: boolean;
  /** Why the sim paused on its own, e.g. the daily token budget was reached. */
  reason: string | null;
}

export interface SettingsMessage {
  type: "settings";
  speed: number;
  dailyTokenBudget: number;
}

export interface AgentMovedMessage {
  type: "agent_moved";
  agentId: string;
  pos: Position;
  place: string;
}

export interface SaidMessage {
  type: "said";
  agentId: string;
  text: string;
  volume: Volume;
  tick: number;
}

export interface InteractedMessage {
  type: "interacted";
  agentId: string;
  objectId: string;
  interaction: string;
  tick: number;
}

export interface StateChangedMessage {
  type: "state_changed";
  agents?: Agent[];
  objects?: WorldObject[];
}

export interface EventLoggedMessage {
  type: "event_logged";
  event: WorldEvent;
}

/** Sent in reply to inspect_agent, and again whenever the inspected agent's data changes. */
export interface AgentDetailMessage {
  type: "agent_detail";
  agentId: string;
  agent: Agent;
  memories: Memory[];
  llmCalls: LlmCallRecord[];
  personalityHistory: PersonalityChange[];
}

export type ServerMessage =
  | SnapshotMessage
  | TickMessage
  | PausedMessage
  | SettingsMessage
  | AgentMovedMessage
  | SaidMessage
  | InteractedMessage
  | StateChangedMessage
  | EventLoggedMessage
  | AgentDetailMessage;

export const SERVER_MESSAGE_TYPES = [
  "snapshot",
  "tick",
  "paused",
  "settings",
  "agent_moved",
  "said",
  "interacted",
  "state_changed",
  "event_logged",
  "agent_detail",
] as const satisfies readonly ServerMessage["type"][];

const serverEnvelopeSchema = z.looseObject({ type: z.enum(SERVER_MESSAGE_TYPES) });

/** The server is trusted, so only the envelope is checked; the payload shape follows the type. */
export function parseServerMessage(raw: string): ServerMessage {
  const envelope = serverEnvelopeSchema.parse(JSON.parse(raw));
  return envelope as unknown as ServerMessage;
}

export function parseClientMessage(raw: string): ClientMessage {
  return clientMessageSchema.parse(JSON.parse(raw));
}
