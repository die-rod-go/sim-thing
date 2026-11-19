import { z } from "zod";
import type { VerbTake } from "./items/item-file";
import type { Volume } from "./types";

/*
 * The player: the person at the browser who plays one agent. What they choose for it goes to the
 * server as a `PlayerAct`; what the agent perceives and can do comes back as a `PlayerView`.
 */

const tilePositionSchema = z.object({ x: z.number().int(), y: z.number().int() });

/** The acts an agent's decision has, plus `move`: one tile in any direction, announced to no one. */
export const PLAYER_ACTIONS = [
  "walk_to",
  "move",
  "interact",
  "give",
  "wait",
  "follow",
  "continue",
] as const;

export type PlayerAction = (typeof PLAYER_ACTIONS)[number];

const VOLUMES: readonly [Volume, ...Volume[]] = ["whisper", "normal", "shout"];

const playerActFields = z.object({
  action: z.enum(PLAYER_ACTIONS),
  /** Who or where, by name: a walk's destination, whom to give to or follow, a verb's aim. */
  target: z.string().trim().min(1).optional(),
  /** A tile instead of a name: where a walk ends, or the tile next to the agent a move goes to. */
  pos: tilePositionSchema.optional(),
  verb: z.string().trim().min(1).optional(),
  /** The thing the verb is done with or to, or the thing given. */
  item: z.string().trim().min(1).optional(),
  /** The holder the item is inside, when it is inside something. */
  from: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1).optional(),
  amount: z.number().int().positive().optional(),
  /** For a give: what is asked back, by name, and how many. */
  inReturn: z.string().trim().min(1).optional(),
  inReturnAmount: z.number().int().positive().optional(),
  minutes: z.number().positive().optional(),
  /** Words spoken as the act starts. */
  say: z.string().trim().min(1).optional(),
  volume: z.enum(VOLUMES).optional(),
  /** The answer to the offer the player was shown, named by the offer's event id. */
  offer: z.object({ eventId: z.number().int(), answer: z.enum(["accept", "decline"]) }).optional(),
});

type PlayerActFields = z.infer<typeof playerActFields>;

function requireFieldsForAction(act: PlayerActFields, context: z.RefinementCtx): void {
  const missing = (field: keyof PlayerActFields) =>
    context.addIssue({ code: "custom", path: [field], message: `${act.action} needs ${field}` });
  if (act.action === "walk_to" && act.target === undefined && act.pos === undefined) {
    missing("target");
  }
  if (act.action === "move" && act.pos === undefined) missing("pos");
  if (act.action === "move" && act.offer !== undefined) {
    context.addIssue({ code: "custom", path: ["offer"], message: "a move can't answer an offer" });
  }
  if (act.action === "interact" && act.verb === undefined) missing("verb");
  if ((act.action === "give" || act.action === "follow") && act.target === undefined) {
    missing("target");
  }
  if (act.action === "give" && act.item === undefined) missing("item");
  if (act.action === "give" && act.amount === undefined) missing("amount");
}

/** What the player chose for their agent: one act, with its words and an answer to an offer. */
export const playerActSchema = playerActFields.superRefine(requireFieldsForAction);

export type PlayerAct = z.infer<typeof playerActSchema>;

/** One thing the player can do with a thing, ready to send back as an `interact`. */
export interface PlayerVerbOption {
  /** What the button says: "eat", "bake bread", "chop down the tree". */
  label: string;
  verb: string;
  /** The act's `item`: what the verb is done with or to; null for a bare-handed verb. */
  item: string | null;
  /** The act's `from`: the holder the item is inside, when it is inside something. */
  from: string | null;
  /** The names it can be aimed at, when it is aimed at someone or something; null otherwise. */
  targets: string[] | null;
  /** What else it asks for. */
  takes: VerbTake[];
}

/** A thing the player's agent can see here or carries, or a body in sight. */
export interface PlayerThing {
  /** The name acts use for it: "bread", "tavern chest", "Mara's body". */
  name: string;
  /** How it reads: "3 bread", "a knife", "tavern chest". */
  text: string;
  /** How many the line stands for. */
  count: number;
  /** What shows of it: "burning", "on the floor", "holding 2 bread". */
  details: string[];
  options: PlayerVerbOption[];
  /** What the agent can see inside it. */
  contents: PlayerThing[];
}

/** Someone the player's agent can see. */
export interface PlayerPerson {
  /** As seen: "Jess", or "Jess's body". */
  name: string;
  pronouns: string;
  distanceTiles: number;
  /** Close enough to hand things to. */
  isInReach: boolean;
  /** Would plainly hear normal speech, and a whisper. */
  canHearYou: boolean;
  canHearWhisper: boolean;
  /** "baking bread at the oven". */
  doing: string;
  isDead: boolean;
}

export interface PlayerCreature {
  name: string;
  distanceTiles: number;
}

/** Someone in reach offering the player's agent something, waiting for an answer. */
export interface PlayerOffer {
  /** The offer's event id, which an answer names. */
  eventId: number;
  giverName: string;
  /** "3 coins", or for a trade "1 bread for 10 coins". */
  itemText: string;
}

/** Everything the player's agent perceives and can do, rebuilt by the server after every change. */
export interface PlayerView {
  agentId: string;
  isDead: boolean;
  /** The clock is waiting for the player: nothing happens until they act. */
  isYourTurn: boolean;
  /** What stopped the clock for the player, as the agent took it in; null when it was idle. */
  turnReason: string | null;
  /** What the agent is in the middle of ("walking to the bakery"); null when idle. */
  doing: string | null;
  /** Where the agent is: "the bakery", "the road by the smithy". */
  place: string;
  /** Things at the agent's place, and bodies in sight. */
  here: PlayerThing[];
  carrying: PlayerThing[];
  /** Verbs done with no item ("punch"). */
  bareHanded: PlayerVerbOption[];
  /** Everyone in sight, nearest first. */
  people: PlayerPerson[];
  creatures: PlayerCreature[];
  /** The places a walk can name. */
  destinations: string[];
  offer: PlayerOffer | null;
  /** What the agent is offering someone, waiting for their answer. */
  ownOffer: { recipientName: string; itemText: string } | null;
  /** What just went wrong, in the agent's words. */
  lastFailure: string | null;
  /** The acts the player chose that the clock hasn't reached yet, in a few words each. */
  pendingActs: string[];
  /** The agent's stream, oldest first, as its prompts read it. */
  journal: string[];
  /** Map tile indexes (y * width + x) the agent can see. */
  visibleTiles: number[];
}

/** How the played agent took in a line of speech: null when nobody is played. */
export type PlayerHearing = "clear" | "muffled" | "none";
