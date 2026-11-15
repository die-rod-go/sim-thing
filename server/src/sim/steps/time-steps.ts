import type { StepOfType } from "@village/shared";
import { config } from "../../config";
import { findSleepBlocker, isAsleep, startSleep } from "../../economy/sleep";
import { readComponents } from "../../items/things";
import { findMissingChoiceName, readThingName, resolveNumber, scopeOf } from "../../items/values";
import { computeHitChance, type Defender } from "../../status/combat";
import { broadcastEvent } from "../event-broadcast";
import { createEvent } from "../event-factory";
import { stretchWaitMinutes } from "../verb-slowdown";
import { isCreatureId } from "../creatures/creature-instincts";
import { findUserAgent, readUserStats } from "../verb-user";

import { findAgent, markAgentChanged, replaceAgent } from "../world-access";
import { findRoleThing, requireVerbRun } from "./step-roles";
import { DONE, type StepHandler, type StepOutcome, type StepRun } from "./step-run";

/**
 * Pauses the verb for `minutes` (longer for a slowed run), rounded up to whole ticks and at least
 * one; in passing it takes none.
 */
export const waitStep: StepHandler<"wait"> = {
  isVerbOnly: true,
  run(run, step): StepOutcome {
    if (run.isInPassing) return DONE;
    const minutes = stretchWaitMinutes(run.verbRun, resolveNumber(scopeOf(run), step.minutes));
    const ticks = Math.max(1, Math.ceil(minutes / config.clock.minutesPerTick));
    return { kind: "pause", untilTick: run.context.state.tick + ticks };
  },
};

/** The nap length, or undefined for sleeping until woken (no `minutes`, or a `choice.minutes` not given). */
function resolveNapMinutes(run: StepRun, step: StepOfType<"sleep">): number | undefined {
  if (step.minutes === undefined) return undefined;
  const scope = scopeOf(run);
  if (findMissingChoiceName(scope, step.minutes) !== null) return undefined;
  return resolveNumber(scope, step.minutes);
}

/** Falls asleep in the run's item; the sleep ends by its own rules (rested, hungry, over, woken). */
export const sleepStep: StepHandler<"sleep"> = {
  isVerbOnly: true,
  findRefusal(run, step) {
    const verbRun = requireVerbRun(run, "sleep");
    const agent = findUserAgent(run.context.state, verbRun.userId);
    if (agent === null) return config.creatures.cannotSleepReason;
    return findSleepBlocker(agent, resolveNapMinutes(run, step));
  },
  run(run, step): StepOutcome {
    const { context } = run;
    const { state, result } = context;
    const verbRun = requireVerbRun(run, "sleep");
    const agent = findUserAgent(state, verbRun.userId);
    if (agent === null) return { kind: "refused", reason: config.creatures.cannotSleepReason };
    const blocker = findSleepBlocker(agent, resolveNapMinutes(run, step));
    if (blocker !== null) return { kind: "refused", reason: blocker };
    const placeName = readThingName(scopeOf(run), "item");
    const slept = startSleep(agent, placeName, state.tick, resolveNapMinutes(run, step));
    if (!slept.isSuccess) throw new Error(`sleep started despite its check: ${slept.reason}`);
    replaceAgent(state, slept.agent);
    markAgentChanged(result, verbRun.userId);
    const place = findRoleThing(run, "item");
    const event = createEvent(state, slept.agent, {
      kind: "fell_asleep",
      description: `fell asleep in the ${placeName}`,
      targetId: place?.kind === "entity" ? place.entityId : null,
      targetName: placeName,
    });
    broadcastEvent(state, event, result);
    return { kind: "pause", untilTick: slept.agent.currentAction?.endsAtTick ?? null };
  },
};

/** An agent or a creature dodges with its agility; anything else just stands there. */
function describeDefender(run: StepRun): Defender {
  const { state } = run.context;
  const target = run.verbRun?.target ?? null;
  if (target?.kind === "entity") {
    if (!isCreatureId(state, target.entityId)) return { kind: "still" };
    const { agility } = readUserStats(state, target.entityId);
    const isUser = target.entityId === run.verbRun?.userId;
    return { kind: "dodging", agility, isAsleep: false, isUser };
  }
  if (target === null) return { kind: "still" };
  const defender = findAgent(state, target.agentId);
  return {
    kind: "dodging",
    agility: defender.body.agility,
    isAsleep: isAsleep(defender),
    isUser: target.agentId === run.verbRun?.userId,
  };
}

/** Rolls with today's formula; the verb runner announces `attacked` or `missed` from `isHit`. */
export const rollHitStep: StepHandler<"roll_hit"> = {
  isVerbOnly: true,
  run(run, step): StepOutcome {
    const verbRun = requireVerbRun(run, "roll_hit");
    const { state } = run.context;
    const target = verbRun.target;
    const hasTarget = target !== null && readComponents(state, target) !== null;
    const baseHitChance = resolveNumber(scopeOf(run), step.chance);
    const { agility } = readUserStats(state, verbRun.userId);
    const chance = hasTarget ? computeHitChance(baseHitChance, agility, describeDefender(run)) : 1;
    verbRun.isHit = state.random.next() < chance;
    return DONE;
  },
};
