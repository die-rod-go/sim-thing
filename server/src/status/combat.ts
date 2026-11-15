import type { NumberRange } from "@village/shared";
import { config } from "../config";

/** What the hit roll knows about who or what is on the receiving end. */
export type Defender =
  { kind: "dodging"; agility: number; isAsleep: boolean; isUser: boolean } | { kind: "still" };

/**
 * The chance a hit-roll verb lands: the base chance moved by the agility difference, clamped. A
 * sleeper, the user itself and an object (anything but an agent or a creature) can't get out of the
 * way, so they are always hit.
 */
export function computeHitChance(
  baseHitChance: number,
  attackerAgility: number,
  defender: Defender,
): number {
  if (defender.kind === "still" || defender.isAsleep || defender.isUser) return 1;
  const { agilitySpread, minHitChance, maxHitChance } = config.combat;
  const chance = baseHitChance + (attackerAgility - defender.agility) * agilitySpread;
  return Math.min(maxHitChance, Math.max(minHitChance, chance));
}

/** Damage multiplied by how strong the attacker is: 0.7x to 1.3x with the default spread. */
export function scaleByStrength(amount: number, strength: number): number {
  const { strengthSpread, strengthMidpoint } = config.combat;
  return amount * (1 + (strength - strengthMidpoint) * strengthSpread);
}

/** A value within the range, from a 0-1 roll of the seeded generator. */
export function pickWithinRange(range: NumberRange, roll: number): number {
  return range.min + (range.max - range.min) * roll;
}
