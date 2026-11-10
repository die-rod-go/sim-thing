import type { Agent, Position } from "@village/shared";
import { config } from "../config";
import { addItem, countItem, removeItem } from "./inventory";
import { failWith, type MechanicResult } from "./types";

export const COINS_ITEM = "coins";

export interface GiveRequest {
  giver: Agent;
  recipient: Agent;
  /** An item name or "coins". */
  item: string;
  amount: number;
  reachTiles?: number;
}

export interface GiveOutcome {
  giver: Agent;
  recipient: Agent;
  /** The normalized item name that changed hands. */
  item: string;
  amount: number;
}

/**
 * Hands items or coins from one agent to another nearby. Coins are a closed supply: whatever
 * leaves the giver arrives at the recipient, so none are created or destroyed.
 */
export function executeGive(request: GiveRequest): MechanicResult<GiveOutcome> {
  const { giver, recipient, amount } = request;
  const item = request.item.trim().toLowerCase();
  const reachTiles = request.reachTiles ?? config.economy.giveReachTiles;
  if (giver.id === recipient.id) {
    return failWith("I can't hand something to myself");
  }
  if (computeChebyshevDistance(giver.pos, recipient.pos) > reachTiles) {
    return failWith(`${recipient.name} is too far away to hand anything to`);
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return failWith("I can only hand over a whole number of things, at least one");
  }
  const held = item === COINS_ITEM ? giver.coins : countItem(giver.inventory, item);
  if (held < amount) {
    return failWith(held === 0 ? `I don't have any ${item}` : `I only have ${held} ${item}`);
  }
  if (item === COINS_ITEM) {
    return {
      isSuccess: true,
      giver: { ...giver, coins: giver.coins - amount },
      recipient: { ...recipient, coins: recipient.coins + amount },
      item,
      amount,
    };
  }
  return {
    isSuccess: true,
    giver: { ...giver, inventory: removeItem(giver.inventory, item, amount) },
    recipient: { ...recipient, inventory: addItem(recipient.inventory, item, amount) },
    item,
    amount,
  };
}

export function computeChebyshevDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
}
