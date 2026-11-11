import type { Effect, EffectOfType, EffectType } from "@village/shared";
import {
  addConditionEffect,
  emitEffect,
  makeSoundEffect,
  removeConditionEffect,
} from "./condition-effects";
import { damageEffect, healEffect, transformEffect, wearEffect } from "./combat-effects";
import type { EffectHandler, EffectOutcome, EffectRegistry, EffectRun } from "./effect-run";
import { destroyEffect, moveEffect, produceEffect } from "./item-effects";
import { changeNeedEffect } from "./need-effects";
import { listNearbySubjects } from "./nearby";
import { setOpenEffect, takeStockEffect } from "./object-effects";
import { postNoteEffect, readNotesEffect, sleepEffect } from "./special-effects";

/**
 * Effect types are code; which ones a verb runs, in what order and with what numbers is data in
 * `items.json`. A type missing here parses and validates but can't run yet, and the server refuses
 * an `items.json` that uses it.
 */
export const EFFECT_REGISTRY: EffectRegistry = {
  change_need: changeNeedEffect,
  damage: damageEffect,
  heal: healEffect,
  wear: wearEffect,
  transform: transformEffect,
  produce: produceEffect,
  destroy: destroyEffect,
  move: moveEffect,
  take_stock: takeStockEffect,
  set_open: setOpenEffect,
  sleep: sleepEffect,
  read_notes: readNotesEffect,
  post_note: postNoteEffect,
  add_condition: addConditionEffect,
  remove_condition: removeConditionEffect,
  emit: emitEffect,
  make_sound: makeSoundEffect,
};

export function isEffectBuilt(type: EffectType): boolean {
  return EFFECT_REGISTRY[type] !== undefined;
}

function findHandler<Type extends EffectType>(type: Type): EffectHandler<Type> {
  const handler = EFFECT_REGISTRY[type] as EffectHandler<Type> | undefined;
  if (!handler) throw new Error(`The ${type} effect isn't built yet`);
  return handler;
}

export function findEffectBlocker(effectRun: EffectRun, effect: Effect): string | null {
  const handler = findHandler(effect.type) as EffectHandler<EffectType>;
  return handler.findBlocker?.(effectRun, effect as EffectOfType<EffectType>) ?? null;
}

function applyOnce(effectRun: EffectRun, effect: Effect): EffectOutcome {
  const { random } = effectRun.context.state;
  if (effect.chance !== undefined && random.next() >= effect.chance) return {};
  const handler = findHandler(effect.type) as EffectHandler<EffectType>;
  return handler.apply(effectRun, effect as EffectOfType<EffectType>);
}

/**
 * Runs one effect, after its `chance` roll on the seeded generator. `on: nearby` runs it on each
 * agent and entity in `radius`, each with its own roll, as that subject's `self`.
 */
export function applyEffect(effectRun: EffectRun, effect: Effect): EffectOutcome {
  if (effect.on !== "nearby") return applyOnce(effectRun, effect);
  const nearbyEffect: Effect = { ...effect, on: "self" };
  for (const subject of listNearbySubjects(effectRun, effect.radius ?? 0)) {
    applyOnce({ ...effectRun, self: subject }, nearbyEffect);
  }
  return {};
}
