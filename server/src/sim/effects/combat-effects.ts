import { config } from "../../config";
import type { EffectOfType } from "@village/shared";
import { replaceDefinition, writeField } from "../../items/thing-writes";
import { readNumberField, type ThingRef } from "../../items/things";
import { resolveNumber, resolveRange, resolveText } from "../../items/verb-numbers";
import { pickWithinRange, scaleByStrength } from "../../status/combat";
import { isDead } from "../../status/health";
import { describeVerbPhrase } from "../action-phrases";
import { broadcastEvent } from "../event-broadcast";
import { createEvent } from "../event-factory";
import { findAgent } from "../world-access";
import { announceUnverbedBreaking, changeEntityHealth } from "./breaking";
import {
  findEffectAgentId,
  findEffectEntity,
  findEffectSubject,
  findUsedComponents,
  type EffectHandler,
  type EffectRun,
} from "./effect-run";
import { sendStimulus } from "./stimulus";

function rollDamageAmount(effectRun: EffectRun, effect: EffectOfType<"damage">): number {
  const { state } = effectRun.context;
  const range = resolveRange(effect.amount, findUsedComponents(effectRun));
  const amount = pickWithinRange(range, state.random.next());
  const { run } = effectRun;
  if (!effect.scaledByStrength || run === null) return amount;
  return scaleByStrength(amount, findAgent(state, run.agentId).body.strength);
}

/**
 * The death this damage would cause: the verb's killed phrase, or the condition's or reaction's;
 * `{actor}` is filled in later.
 */
function describeKilling(effectRun: EffectRun): string {
  const { run, verb } = effectRun;
  if (verb === null || run === null) return effectRun.killed ?? "";
  return describeVerbPhrase(verb, "killed", { item: run.usedName, target: run.aimName });
}

/**
 * Damage that no attack event already shows (a verb hurting its own user) is seen as `hurt`. A
 * condition's or reaction's damage makes none: its start and end events show it, not every minute.
 */
function isHurtShown(effectRun: EffectRun, agentId: string): boolean {
  const { run } = effectRun;
  if (run === null) return true;
  const { aim } = run;
  return effectRun.isAttackAnnounced === true && aim?.kind === "agent" && aim.agentId === agentId;
}

function hurtAgent(effectRun: EffectRun, agentId: string, amount: number): void {
  const { context } = effectRun;
  const { state, result } = context;
  if (isDead(findAgent(state, agentId))) return;
  if (!isHurtShown(effectRun, agentId)) {
    const hurt = findAgent(state, agentId);
    const description = config.combat.hurtDescription;
    broadcastEvent(state, createEvent(state, hurt, { kind: "hurt", description }), result);
  }
  const healthPath = state.items.world.agentHealth;
  const health = readNumberField(state, { kind: "agent", agentId }, healthPath);
  if (health === null) return;
  writeField(context, { kind: "agent", agentId }, healthPath, health - amount, {
    killed: describeKilling(effectRun),
    sourceAgentId: effectRun.sourceAgentId,
  });
}

/**
 * Lowers the health field of whatever it hits: an agent's, with a death if it runs out, or an
 * entity's, which breaks at 0. Then sends the stimulus, if any, even to things without health.
 */
export const damageEffect: EffectHandler<"damage"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    const amount = rollDamageAmount(effectRun, effect);
    if (subject.kind === "agent") hurtAgent(effectRun, subject.agentId, amount);
    else changeEntityHealth(effectRun, subject.entityId, -amount);
    if (effect.stimulus !== undefined) {
      const stimulus = resolveText(effect.stimulus, findUsedComponents(effectRun));
      sendStimulus(effectRun, subject, stimulus);
    }
    return {};
  },
};

function raiseHealth(effectRun: EffectRun, subject: ThingRef, amount: number): void {
  const { context } = effectRun;
  const { state } = context;
  if (subject.kind === "entity") {
    changeEntityHealth(effectRun, subject.entityId, amount);
    return;
  }
  const healthPath = state.items.world.agentHealth;
  const health = readNumberField(state, subject, healthPath);
  if (health !== null) writeField(context, subject, healthPath, health + amount);
}

/** Raises the health field of a living agent or a thing; the dead aren't healed. */
export const healEffect: EffectHandler<"heal"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    if (subject.kind === "agent" && findEffectAgentId(effectRun, effect) === null) return {};
    raiseHealth(effectRun, subject, resolveNumber(effect.amount, findUsedComponents(effectRun)));
    return {};
  },
};

/** Lowers an entity's health field with no stimulus: a blade dulling with use. */
export const wearEffect: EffectHandler<"wear"> = {
  apply(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return {};
    const amount = resolveNumber(effect.amount, findUsedComponents(effectRun));
    changeEntityHealth(effectRun, entity.id, -amount);
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
    announceUnverbedBreaking(effectRun, entity.id);
    replaceDefinition(effectRun.context, entity.id, effect.into);
    return {};
  },
};
