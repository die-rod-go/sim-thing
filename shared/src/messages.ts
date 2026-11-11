import { z } from "zod";
import type {
  Agent,
  ClockState,
  LlmCallRecord,
  Memory,
  Moment,
  PersonalityChange,
  Position,
  SimStats,
  Volume,
  WorldEvent,
} from "./types";
import type { Entity } from "./items/entity";
import type { ConditionDefinition, ItemDefinition, ItemFile } from "./items/item-file";
import type { ItemProblem, ItemReference } from "./items/item-problems";
import {
  seedFileSchema,
  type SeedAgent,
  type SeedFile,
  type SeedProblem,
  type SeedRules,
} from "./seed-file";
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
  z.object({ type: z.literal("load_seed_file") }),
  z.object({
    type: z.literal("save_seed_file"),
    seedFile: seedFileSchema,
    shouldResetWorld: z.boolean(),
  }),
  z.object({ type: z.literal("load_item_file") }),
  /** Checked by the server's item editor, which reports schema errors as problems. */
  z.object({ type: z.literal("save_item_file"), itemFile: z.unknown() }),
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
  entities: Entity[];
  /** Every item definition, so the client can draw entities from their glyphs and name them. */
  itemDefinitions: ItemDefinition[];
  /** Every condition definition, so the client can name conditions and draw the visible ones. */
  conditionDefinitions: ConditionDefinition[];
  recentEvents: WorldEvent[];
  /** The latest moments, oldest first. */
  recentMoments: Moment[];
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
  entityId: string;
  verb: string;
  tick: number;
}

export interface StateChangedMessage {
  type: "state_changed";
  agents: Agent[];
}

/** Entities that appeared, moved or changed state this tick, and ids of those that are gone. */
export interface EntitiesChangedMessage {
  type: "entities_changed";
  entities: Entity[];
  removedEntityIds: string[];
}

export interface EventLoggedMessage {
  type: "event_logged";
  event: WorldEvent;
}

/** Broadcast for every agent whenever a moment happens. */
export interface MomentMessage {
  type: "moment";
  moment: Moment;
}

/** Sent in reply to inspect_agent, and again whenever the inspected agent's data changes. */
export interface AgentDetailMessage {
  type: "agent_detail";
  agentId: string;
  agent: Agent;
  memories: Memory[];
  llmCalls: LlmCallRecord[];
  personalityHistory: PersonalityChange[];
  /** Tile indexes (y * width + x) for the debug overlay, computed by the server's perception code. */
  perceptionView: { visibleTiles: number[]; speechReachTiles: number[] } | null;
}

/** Sent in reply to load_seed_file: the seed file as it is on disk, and what it is checked against. */
export interface SeedFileMessage {
  type: "seed_file";
  /** Null when the file on disk could not be read; `loadError` says why. */
  seedFile: SeedFile | null;
  loadError: string | null;
  rules: SeedRules;
  /** Starting values for a character added in the editor, from the server config. */
  newAgentTemplate: SeedAgent;
}

/** Sent in reply to save_seed_file. Nothing is written when `problems` has an error. */
export interface SeedFileSavedMessage {
  type: "seed_file_saved";
  isSaved: boolean;
  isWorldReset: boolean;
  problems: SeedProblem[];
}

/** Sent in reply to load_item_file: `items.json` as it is on disk, and what else uses it. */
export interface ItemFileMessage {
  type: "item_file";
  /** Null when the file on disk could not be read or parsed; `loadError` says why. */
  itemFile: ItemFile | null;
  loadError: string | null;
  /** Definitions the map and the seed inventories use, so deleting one shows as an error. */
  references: ItemReference[];
  currencyDefinitionId: string;
}

/** Sent in reply to save_item_file. Nothing is written when `problems` has an error. */
export interface ItemFileSavedMessage {
  type: "item_file_saved";
  isSaved: boolean;
  problems: ItemProblem[];
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
  | EntitiesChangedMessage
  | EventLoggedMessage
  | MomentMessage
  | AgentDetailMessage
  | SeedFileMessage
  | SeedFileSavedMessage
  | ItemFileMessage
  | ItemFileSavedMessage;

export const SERVER_MESSAGE_TYPES = [
  "snapshot",
  "tick",
  "paused",
  "settings",
  "agent_moved",
  "said",
  "interacted",
  "state_changed",
  "entities_changed",
  "event_logged",
  "moment",
  "agent_detail",
  "seed_file",
  "seed_file_saved",
  "item_file",
  "item_file_saved",
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
