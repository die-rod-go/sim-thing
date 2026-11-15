import type { ComponentValues, StepOfType } from "@village/shared";
import { config } from "../../config";
import { addComponent, removeComponent, writeField } from "../../items/thing-writes";
import { readField, readNumberField, type ThingRef } from "../../items/things";
import { resolveFieldInput, resolveNumber, scopeOf, type ValueScope } from "../../items/values";
import { scaleByStrength } from "../../status/combat";
import { isDead } from "../../status/health";
import { broadcastEvent } from "../event-broadcast";
import { createEvent } from "../event-factory";
import { findAgent } from "../world-access";
import { readUserStats } from "../verb-user";
import { describeRunCause, findStepThings } from "./step-roles";
import { DONE, type StepHandler, type StepRun } from "./step-run";

/** Adds `by` to a number field; a thing without the field is skipped. */
export const changeStep: StepHandler<"change"> = {
  isVerbOnly: false,
  run(run, step) {
    const by = resolveNumber(scopeOf(run), step.by);
    for (const thing of findStepThings(run, step.on ?? "self")) {
      const current = readNumberField(run.context.state, thing, step.field);
      if (current === null) continue;
      writeField(run.context, thing, step.field, current + by, describeRunCause(run));
    }
    return DONE;
  },
};

/** Writes a field; a thing without the component is skipped. */
export const setStep: StepHandler<"set"> = {
  isVerbOnly: false,
  run(run, step) {
    const value = resolveFieldInput(scopeOf(run), step.to);
    for (const thing of findStepThings(run, step.on ?? "self")) {
      if (readField(run.context.state, thing, step.field) === undefined) continue;
      writeField(run.context, thing, step.field, value, describeRunCause(run));
    }
    return DONE;
  },
};

function rollDamage(run: StepRun, step: StepOfType<"damage">): number {
  const amount = resolveNumber(scopeOf(run), step.amount);
  const { verbRun } = run;
  if (!step.scaledByStrength || verbRun === null) return amount;
  return scaleByStrength(amount, readUserStats(run.context.state, verbRun.userId).strength);
}

/** In a verb, an agent hurt with no `attacked` event showing it is seen as `hurt`. A rule's damage makes none. */
function isHurtShown(run: StepRun, agentId: string): boolean {
  const { verbRun } = run;
  if (verbRun === null) return false;
  const target = verbRun.target;
  const isShownByHitRoll =
    verbRun.isHit !== null && target?.kind === "agent" && target.agentId === agentId;
  return !isShownByHitRoll;
}

function showHurt(run: StepRun, agentId: string): void {
  const { state, result } = run.context;
  const description = config.combat.hurtDescription;
  const hurt = findAgent(state, agentId);
  broadcastEvent(state, createEvent(state, hurt, { kind: "hurt", description }), result);
}

function damageThing(run: StepRun, thing: ThingRef, field: string, amount: number): void {
  const { state } = run.context;
  const current = readNumberField(state, thing, field);
  if (current === null) return;
  const isAgentHealth = thing.kind === "agent" && field === state.items.world.agentHealth;
  if (isAgentHealth) {
    if (isDead(findAgent(state, thing.agentId))) return;
    if (isHurtShown(run, thing.agentId)) showHurt(run, thing.agentId);
  }
  writeField(run.context, thing, field, current - amount, describeRunCause(run));
}

/** Lowers a number field, scaled by the user's strength if asked; breaking is a `becomes` rule's job. */
export const damageStep: StepHandler<"damage"> = {
  isVerbOnly: false,
  run(run, step) {
    const things = findStepThings(run, step.on ?? "self");
    if (things.length === 0) return DONE;
    const amount = rollDamage(run, step);
    for (const thing of things) damageThing(run, thing, step.field, amount);
    return DONE;
  },
};

function resolveFields(scope: ValueScope, fields: StepOfType<"add">["fields"]): ComponentValues {
  const resolved: ComponentValues = {};
  for (const [name, input] of Object.entries(fields ?? {})) {
    resolved[name] = resolveFieldInput(scope, input);
  }
  return resolved;
}

/** Adds the component for `minutes` or until removed, stamped with the agent behind the run. */
export const addStep: StepHandler<"add"> = {
  isVerbOnly: false,
  run(run, step) {
    const scope = scopeOf(run);
    const minutes = step.minutes === undefined ? null : resolveNumber(scope, step.minutes);
    const fields = resolveFields(scope, step.fields);
    for (const thing of findStepThings(run, step.on ?? "self")) {
      addComponent(run.context, thing, step.component, { minutes, fields }, describeRunCause(run));
    }
    return DONE;
  },
};

export const removeStep: StepHandler<"remove"> = {
  isVerbOnly: false,
  run(run, step) {
    for (const thing of findStepThings(run, step.on ?? "self")) {
      removeComponent(run.context, thing, step.component, describeRunCause(run));
    }
    return DONE;
  },
};
