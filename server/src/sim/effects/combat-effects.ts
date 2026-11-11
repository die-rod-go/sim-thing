import { config } from "../../config";
import type { EffectOfType } from "@village/shared";
import { buildInitialEntityState, replaceEntity } from "../../items/entity-store";
import { resolveNumber, resolveRange, resolveText } from "../../items/verb-numbers";
import { pickWithinRange, scaleByStrength } from "../../status/combat";
import { clampHealth, isDead } from "../../status/health";
import { describeVerbPhrase } from "../action-phrases";
import { applyDamage } from "../damage";
import { broadcastEvent } from "../event-broadcast";
import { createEvent } from "../event-factory";
import { findAgent, markAgentChanged, markEntityChanged, replaceAgent } from "../world-access";
import { announceUnverbedBreaking, lowerDurability } from "./breaking";
import {
  findEffectAgentId,
  findEffectEntity,
  findEffectSubject,
  findUsedDefinition,
  type EffectHandler,
  type EffectRun,
} from "./effect-run";
import { sendStimulus } from "./stimulus";

function rollDamageAmount(effectRun: EffectRun, effect: EffectOfType<"damage">): number {
  const { state } = effectRun.context;
  const range = resolveRange(effect.amount, findUsedDefinition(effectRun));
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
  applyDamage(context, agentId, {
    amount,
    killed: describeKilling(effectRun),
    sourceAgentId: effectRun.sourceAgentId,
  });
}

/**
 * Lowers an agent's health, or an entity's durability divided by its toughness, then sends the
 * stimulus, if any, even to things that can't be damaged.
 */
export const damageEffect: EffectHandler<"damage"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    const amount = rollDamageAmount(effectRun, effect);
    if (subject.kind === "agent") hurtAgent(effectRun, subject.agentId, amount);
    else lowerDurability(effectRun, subject.entityId, amount);
    if (effect.stimulus !== undefined) {
      const stimulus = resolveText(effect.stimulus, findUsedDefinition(effectRun));
      sendStimulus(effectRun, subject, stimulus);
    }
    return {};
  },
};

/** Raises a living agent's health; things aren't healed. */
export const healEffect: EffectHandler<"heal"> = {
  apply(effectRun, effect) {
    const agentId = findEffectAgentId(effectRun, effect);
    if (agentId === null) return {};
    const { state, result } = effectRun.context;
    const amount = resolveNumber(effect.amount, findUsedDefinition(effectRun));
    const agent = findAgent(state, agentId);
    replaceAgent(state, { ...agent, health: clampHealth(agent.health + amount) });
    markAgentChanged(result, agentId);
    return {};
  },
};

/** Lowers durability divided by toughness, with no stimulus: a blade dulling with use. */
export const wearEffect: EffectHandler<"wear"> = {
  apply(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return {};
    const amount = resolveNumber(effect.amount, findUsedDefinition(effectRun));
    lowerDurability(effectRun, entity.id, amount);
    return {};
  },
};

/**
 * Turns the entity into another definition where it is, with that definition's fresh state. Its
 * conditions go with the old form, and a map label no longer fits it.
 */
export const transformEffect: EffectHandler<"transform"> = {
  apply(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return {};
    const { state, result } = effectRun.context;
    const definition = state.items.definitionsById.get(effect.into);
    if (!definition) throw new Error(`Unknown item "${effect.into}" to transform into`);
    announceUnverbedBreaking(effectRun, entity.id);
    replaceEntity(state, {
      ...entity,
      definitionId: definition.id,
      label: null,
      state: buildInitialEntityState(definition),
    });
    markEntityChanged(result, entity.id);
    return {};
  },
};
