import { readComponentField, type Effect } from "@village/shared";
import { config } from "../../config";
import {
  describeEntityName,
  findEntityIfPresent,
  getDefinition,
  replaceEntity,
} from "../../items/entity-store";
import { broadcastEvent } from "../event-broadcast";
import { createEvent } from "../event-factory";
import { findAgent, markEntityChanged } from "../world-access";
import { applyEffect } from "./effect-registry";
import type { EffectRun } from "./effect-run";

const DESTROY_WHEN_BROKEN: readonly Effect[] = [{ type: "destroy" }];

/**
 * Lowers an entity's durability by `amount` divided by its toughness. Something without a
 * `durability` component can't be damaged. At 0 it breaks.
 */
export function lowerDurability(effectRun: EffectRun, entityId: string, amount: number): void {
  const { state, result } = effectRun.context;
  const entity = findEntityIfPresent(state, entityId);
  const toughness = entity
    ? readComponentField(getDefinition(state, entity), "durability", "toughness")
    : undefined;
  if (!entity || typeof toughness !== "number" || entity.state.durability === undefined) return;
  if (amount <= 0 || entity.state.durability <= 0) return;
  const durability = Math.max(0, entity.state.durability - amount / toughness);
  replaceEntity(state, { ...entity, state: { ...entity.state, durability } });
  markEntityChanged(result, entityId);
  if (durability <= 0) breakEntity(effectRun, entityId);
}

/**
 * The entity breaks: whoever broke it is seen doing so, then its definition's `onBroken` effects
 * run with `self` as the broken entity (without any, it is destroyed). A destroyed door no longer
 * blocks sight or muffles sound, so it counts as open.
 */
export function breakEntity(effectRun: EffectRun, entityId: string): void {
  const { state, result } = effectRun.context;
  const entity = findEntityIfPresent(state, entityId);
  if (!entity) return;
  const name = describeEntityName(state, entity);
  const breaker = findAgent(state, effectRun.run.agentId);
  const event = createEvent(state, breaker, {
    kind: "broke",
    description: config.combat.brokePhrase.split("{target}").join(name),
    targetId: entity.id,
    targetName: name,
  });
  broadcastEvent(state, event, result);
  const onBroken = getDefinition(state, entity).onBroken ?? DESTROY_WHEN_BROKEN;
  const breakingRun: EffectRun = { ...effectRun, selfEntityId: entityId };
  for (const effect of onBroken) applyEffect(breakingRun, effect);
}
