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
import { createSubjectEvent } from "./subjects";

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

/** The `broke` event: by whoever broke it in a verb, or of the thing itself for a condition or reaction. */
function announceBreaking(effectRun: EffectRun, entityId: string, name: string): void {
  const { state, result } = effectRun.context;
  const subject = { kind: "entity" as const, entityId };
  const event =
    effectRun.run === null
      ? createSubjectEvent(state, subject, {
          kind: "broke",
          description: config.effects.thingBrokeDescription,
        })
      : createEvent(state, findAgent(state, effectRun.run.agentId), {
          kind: "broke",
          description: config.combat.brokePhrase.split("{target}").join(name),
          targetId: entityId,
          targetName: name,
        });
  if (event !== null) broadcastEvent(state, event, result);
}

/**
 * The entity breaks: it is seen breaking, then its definition's `onBroken` effects run with
 * `self` as the broken entity (without any, it is destroyed). A destroyed door no longer blocks
 * sight or muffles sound, so it counts as open.
 */
export function breakEntity(effectRun: EffectRun, entityId: string): void {
  const { state } = effectRun.context;
  const entity = findEntityIfPresent(state, entityId);
  if (!entity) return;
  announceBreaking(effectRun, entityId, describeEntityName(state, entity));
  const onBroken = getDefinition(state, entity).onBroken ?? DESTROY_WHEN_BROKEN;
  const breakingRun: EffectRun = {
    ...effectRun,
    self: { kind: "entity", entityId },
    isBreakAnnounced: true,
  };
  for (const effect of onBroken) applyEffect(breakingRun, effect);
}

/**
 * A condition or reaction transforming or destroying a thing (a jar shattering into shards) is
 * seen as it breaking; a verb's own events, or its breaking, already show it.
 */
export function announceUnverbedBreaking(effectRun: EffectRun, entityId: string): void {
  if (effectRun.run !== null || effectRun.isBreakAnnounced === true) return;
  const { state, result } = effectRun.context;
  const event = createSubjectEvent(
    state,
    { kind: "entity", entityId },
    { kind: "broke", description: config.effects.thingBrokeDescription },
  );
  if (event !== null) broadcastEvent(state, event, result);
}
