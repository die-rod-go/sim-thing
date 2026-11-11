import type { Effect } from "@village/shared";
import { config } from "../../config";
import { describeEntityName, findEntityIfPresent, getDefinition } from "../../items/entity-store";
import { writeField } from "../../items/thing-writes";
import { createThingEvent, readNumberField, type ThingRef } from "../../items/things";
import { broadcastEvent } from "../event-broadcast";
import { createEvent } from "../event-factory";
import { findAgent } from "../world-access";
import { applyEffect } from "./effect-registry";
import type { EffectRun } from "./effect-run";

const DESTROY_WHEN_BROKEN: readonly Effect[] = [{ type: "destroy" }];

/**
 * Changes an entity's health field by `change`, within the field's own bounds. Something without
 * the field is skipped. When the field reaches 0 the entity breaks.
 */
export function changeEntityHealth(effectRun: EffectRun, entityId: string, change: number): void {
  const { context } = effectRun;
  const { state } = context;
  const thing: ThingRef = { kind: "entity", entityId };
  const healthPath = state.items.world.agentHealth;
  const health = readNumberField(state, thing, healthPath);
  if (health === null || change === 0 || health <= 0) return;
  writeField(context, thing, healthPath, health + change);
  const after = readNumberField(state, thing, healthPath);
  if (after !== null && after <= 0) breakEntity(effectRun, entityId);
}

/** The `broke` event: by whoever broke it in a verb, or of the thing itself for a condition or reaction. */
function announceBreaking(effectRun: EffectRun, entityId: string, name: string): void {
  const { state, result } = effectRun.context;
  const event =
    effectRun.run === null
      ? createThingEvent(
          state,
          { kind: "entity", entityId },
          { kind: "broke", description: config.effects.thingBrokeDescription },
        )
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
  const event = createThingEvent(
    state,
    { kind: "entity", entityId },
    { kind: "broke", description: config.effects.thingBrokeDescription },
  );
  if (event !== null) broadcastEvent(state, event, result);
}
