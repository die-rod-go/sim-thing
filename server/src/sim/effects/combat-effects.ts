import type { EffectOfType } from "@village/shared";
import { config } from "../../config";
import { replaceDefinition, writeField } from "../../items/thing-writes";
import { readNumberField, type ThingRef } from "../../items/things";
import {
  resolveDefinitionId,
  resolveNumber,
  resolveRange,
  resolveText,
} from "../../items/verb-numbers";
import { pickWithinRange, scaleByStrength } from "../../status/combat";
import { isDead } from "../../status/health";
import { broadcastEvent } from "../event-broadcast";
import { createEvent } from "../event-factory";
import { sendStimulus } from "../rule-engine";
import { findAgent } from "../world-access";
import {
  describeRunCause,
  findEffectAgentId,
  findEffectEntity,
  findEffectSubject,
  findValueSources,
  type EffectHandler,
  type EffectRun,
} from "./effect-run";

function rollDamageAmount(effectRun: EffectRun, effect: EffectOfType<"damage">): number {
  const { state } = effectRun.context;
  const range = resolveRange(effect.amount, findValueSources(effectRun));
  const amount = pickWithinRange(range, state.random.next());
  const { run } = effectRun;
  if (!effect.scaledByStrength || run === null) return amount;
  return scaleByStrength(amount, findAgent(state, run.agentId).body.strength);
}

/**
 * Damage that no attack event already shows (a verb hurting its own user) is seen as `hurt`. A
 * rule's damage makes none: its own announcements show it, not every minute.
 */
function isHurtShown(effectRun: EffectRun, agentId: string): boolean {
  const { run } = effectRun;
  if (run === null) return true;
  const { aim } = run;
  return effectRun.isAttackAnnounced === true && aim?.kind === "agent" && aim.agentId === agentId;
}

/** Adds `change` to the subject's health field; a thing without the field is skipped. */
function changeHealth(effectRun: EffectRun, subject: ThingRef, change: number): void {
  const { context } = effectRun;
  const { state } = context;
  const healthPath = state.items.world.agentHealth;
  const health = readNumberField(state, subject, healthPath);
  if (health === null) return;
  writeField(context, subject, healthPath, health + change, describeRunCause(effectRun));
}

function hurtAgent(effectRun: EffectRun, agentId: string, amount: number): void {
  const { state, result } = effectRun.context;
  if (isDead(findAgent(state, agentId))) return;
  if (!isHurtShown(effectRun, agentId)) {
    const hurt = findAgent(state, agentId);
    const description = config.combat.hurtDescription;
    broadcastEvent(state, createEvent(state, hurt, { kind: "hurt", description }), result);
  }
  changeHealth(effectRun, { kind: "agent", agentId }, -amount);
}

/**
 * Lowers the health field of whatever it hits, if it has one; breaking is a `becomes` rule's job.
 * Then sends the stimulus, if any, even to things without health.
 */
export const damageEffect: EffectHandler<"damage"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    const amount = rollDamageAmount(effectRun, effect);
    if (subject.kind === "agent") hurtAgent(effectRun, subject.agentId, amount);
    else changeHealth(effectRun, subject, -amount);
    if (effect.stimulus !== undefined) {
      const stimulus = resolveText(effect.stimulus, findValueSources(effectRun));
      sendStimulus(effectRun, subject, stimulus);
    }
    return {};
  },
};

/** Raises the health field of a living agent or a thing; the dead aren't healed. */
export const healEffect: EffectHandler<"heal"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    if (subject.kind === "agent" && findEffectAgentId(effectRun, effect) === null) return {};
    changeHealth(effectRun, subject, resolveNumber(effect.amount, findValueSources(effectRun)));
    return {};
  },
};

/** Lowers an entity's health field with no stimulus: a blade dulling with use. */
export const wearEffect: EffectHandler<"wear"> = {
  apply(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return {};
    const amount = resolveNumber(effect.amount, findValueSources(effectRun));
    changeHealth(effectRun, { kind: "entity", entityId: entity.id }, -amount);
    return {};
  },
};

/**
 * Turns the entity into another definition where it is, untouched: its changes go with the old
 * form, and a map label no longer fits it.
 */
export const transformEffect: EffectHandler<"transform"> = {
  apply(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return {};
    replaceDefinition(
      effectRun.context,
      entity.id,
      resolveDefinitionId(effect.into, findValueSources(effectRun)),
    );
    return {};
  },
};
