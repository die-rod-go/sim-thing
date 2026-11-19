import { z } from "zod";
import type {
  Agent,
  AgentMemory,
  ClockState,
  LlmCallRecord,
  Moment,
  PersonalityChange,
  Position,
  SimStats,
  Volume,
  WorldEvent,
} from "./types";
import type { Entity } from "./items/entity";
import type { ComponentDeclarations } from "./items/component-schema";
import type { ItemDefinition, ItemFile, WorldSettings } from "./items/item-file";
import type { ItemProblem, ItemReference } from "./items/item-problems";
import type { MapProblem, MapReferences } from "./map-file";
import { playerActSchema, type PlayerHearing, type PlayerView } from "./player";
import {
  seedFileSchema,
  type SeedAgent,
  type SeedFile,
  type SeedProblem,
  type SeedRules,
} from "./seed-file";
import type { SimTimeSettings } from "./time";

const tilePositionSchema = z.object({ x: z.number().int(), y: z.number().int() });

/** Where god mode puts an entity: on a map tile, or into an agent's hands. */
const godDestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tile"), pos: tilePositionSchema }),
  z.object({ kind: z.literal("agent"), agentId: z.string() }),
]);

export type GodDestination = z.infer<typeof godDestinationSchema>;

/** A change the viewer makes to the paused world by hand. */
export const godActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move_agent"), agentId: z.string(), pos: tilePositionSchema }),
  z.object({
    kind: z.literal("place_entity"),
    definitionId: z.string(),
    destination: godDestinationSchema,
  }),
  z.object({
    kind: z.literal("move_entity"),
    entityId: z.string(),
    destination: godDestinationSchema,
  }),
  z.object({ kind: z.literal("delete_entity"), entityId: z.string() }),
  /** Words every living agent hears from the sky. */
  z.object({ kind: z.literal("speak"), words: z.string() }),
]);

export type GodAction = z.infer<typeof godActionSchema>;

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
  z.object({ type: z.literal("load_map_file") }),
  /** Checked by the server's map editor, which reports a malformed map as a problem. */
  z.object({
    type: z.literal("save_map_file"),
    mapFile: z.unknown(),
    shouldResetWorld: z.boolean(),
  }),
  z.object({ type: z.literal("god_action"), action: godActionSchema }),
  /** Starts playing this agent, handing any other played agent back to the LLM; null stops. */
  z.object({ type: z.literal("play_as"), agentId: z.string().nullable() }),
  /** An act for the played agent, carried out when the clock next reaches decisions. */
  z.object({ type: z.literal("player_act"), act: playerActSchema }),
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
  /** Every component declaration, so the client can resolve what each thing has and how it reads. */
  componentDeclarations: ComponentDeclarations;
  /** The world settings: the agents' body, their health field and what the physics reads. */
  world: WorldSettings;
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
  /** How the played agent heard it; null when nobody is played. */
  playerHearing: PlayerHearing | null;
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
  memory: AgentMemory;
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
}

/** Sent in reply to save_item_file. Nothing is written when `problems` has an error. */
export interface ItemFileSavedMessage {
  type: "item_file_saved";
  isSaved: boolean;
  problems: ItemProblem[];
}

/** Sent in reply to load_map_file: the Tiled map as it is on disk, and what it may name. */
export interface MapFileMessage {
  type: "map_file";
  /** The Tiled JSON, or null when the file could not be read; `loadError` says why. */
  mapFile: unknown;
  loadError: string | null;
  references: MapReferences;
}

/** Sent in reply to save_map_file. Nothing is written when `problems` has an error. */
export interface MapFileSavedMessage {
  type: "map_file_saved";
  isSaved: boolean;
  isWorldReset: boolean;
  problems: MapProblem[];
}

/** Sent in reply to god_action. The change itself arrives as the usual world messages. */
export interface GodActionResultMessage {
  type: "god_action_result";
  /** Why nothing was changed, or null when the action was applied. */
  refusal: string | null;
}

/** Broadcast when the viewer spoke from the sky, so every viewer sees what the village heard. */
export interface VoiceSpokeMessage {
  type: "voice_spoke";
  words: string;
  tick: number;
}

/** Broadcast whenever what the played agent perceives or can do changes; null when nobody is played. */
export interface PlayerViewMessage {
  type: "player_view";
  view: PlayerView | null;
}

/** Sent in reply to play_as and player_act. What the act did arrives in the player view. */
export interface PlayerActResultMessage {
  type: "player_act_result";
  /** Why it was turned down, or null when it was taken. */
  refusal: string | null;
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
  | ItemFileSavedMessage
  | MapFileMessage
  | MapFileSavedMessage
  | GodActionResultMessage
  | VoiceSpokeMessage
  | PlayerViewMessage
  | PlayerActResultMessage;

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
  "map_file",
  "map_file_saved",
  "god_action_result",
  "voice_spoke",
  "player_view",
  "player_act_result",
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
