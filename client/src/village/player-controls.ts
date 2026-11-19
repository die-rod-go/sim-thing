import type { CurrentAction, PlayerAct, PlayerVerbOption, Position, Volume } from "@village/shared";

/** One tile each way: the arrow keys and WASD, with Q, E, Z and C for the diagonals. */
const MOVE_OFFSETS_BY_KEY: Readonly<Record<string, Position>> = {
  arrowup: { x: 0, y: -1 },
  w: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
  arrowleft: { x: -1, y: 0 },
  a: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  d: { x: 1, y: 0 },
  q: { x: -1, y: -1 },
  e: { x: 1, y: -1 },
  z: { x: -1, y: 1 },
  c: { x: 1, y: 1 },
};

/** The move a key makes, one tile that way; null for any other key. */
export function resolveMoveKey(key: string): PlayerAct | null {
  const direction = MOVE_OFFSETS_BY_KEY[key.toLowerCase()];
  return direction === undefined ? null : { action: "move", direction };
}

/** A click on a map tile: a move to a tile next door, a walk to one farther; null for its own. */
export function buildTileAct(agentPos: Position, tile: Position): PlayerAct | null {
  const direction = { x: tile.x - agentPos.x, y: tile.y - agentPos.y };
  const distance = Math.max(Math.abs(direction.x), Math.abs(direction.y));
  if (distance === 0) return null;
  return distance === 1 ? { action: "move", direction } : { action: "walk_to", pos: tile };
}

/**
 * Words the agent says. Busy walking or working, it says them and carries on; otherwise it says
 * them and waits a little for an answer. Null when there is nothing to say.
 */
export function buildTalkAct(
  words: string,
  volume: Volume,
  currentAction: CurrentAction | null,
): PlayerAct | null {
  const said = words.trim();
  if (said === "") return null;
  const isBusy = currentAction !== null && currentAction.kind !== "wait";
  return { action: isBusy ? "continue" : "wait", say: said, volume };
}

/** What the player picked for the extras an option asks for. */
export interface OptionChoices {
  target?: string;
  amount?: number;
  minutes?: number;
  text?: string;
}

/** Whether the option needs nothing more chosen, so a click does it at once. */
export function isOptionReady(option: PlayerVerbOption): boolean {
  return option.targets === null && option.takes.length === 0;
}

/** The option as an act, with the extras it takes and the player filled in. */
export function buildOptionAct(option: PlayerVerbOption, choices: OptionChoices): PlayerAct {
  const takes = new Set(option.takes);
  const text = choices.text?.trim() ?? "";
  return {
    action: "interact",
    verb: option.verb,
    ...(option.item === null ? {} : { item: option.item }),
    ...(option.from === null ? {} : { from: option.from }),
    ...(choices.target ? { target: choices.target } : {}),
    ...(takes.has("amount") && choices.amount ? { amount: choices.amount } : {}),
    ...(takes.has("minutes") && choices.minutes ? { minutes: choices.minutes } : {}),
    ...(takes.has("text") && text !== "" ? { text } : {}),
  };
}

/** What the player picked to hand over, and what, if anything, they ask back. */
export interface GiveChoices {
  person: string;
  item: string;
  amount: number;
  inReturn: string;
  inReturnAmount: number;
}

export function buildGiveAct(choices: GiveChoices): PlayerAct {
  const asked = choices.inReturn.trim();
  return {
    action: "give",
    target: choices.person,
    item: choices.item,
    amount: choices.amount,
    ...(asked === "" ? {} : { inReturn: asked, inReturnAmount: choices.inReturnAmount }),
  };
}
