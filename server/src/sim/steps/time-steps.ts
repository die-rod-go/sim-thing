import type { StepOfType } from "@village/shared";
import { config } from "../../config";
import { findSleepBlocker, isAsleep, startSleep } from "../../economy/sleep";
import { readComponents } from "../../items/things";
import { findMissingChoiceName, readThingName, resolveNumber, scopeOf } from "../../items/values";
import { computeHitChance, type Defender } from "../../status/combat";
import { broadcastEvent } from "../event-broadcast";
import { createEvent } from "../event-factory";
import { findAgent, markAgentChanged, replaceAgent } from "../world-access";
import { findRoleThing, requireVerbRun } from "./step-roles";
import { DONE, type StepHandler, type StepOutcome, type StepRun } from "./step-run";

/** Pauses the verb for `minutes`, rounded up to whole ticks and at least one; in passing it takes none. */
export const waitStep: StepHandler<"wait"> = {
  isVerbOnly: true,
  run(run, step): StepOutcome {
    if (run.isInPassing) return DONE;
    const minutes = resolveNumber(scopeOf(run), step.minutes);
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
    const agent = findAgent(run.context.state, verbRun.agentId);
    return findSleepBlocker(agent, resolveNapMinutes(run, step));
  },
  run(run, step): StepOutcome {
    const { context } = run;
    const { state, result } = context;
    const verbRun = requireVerbRun(run, "sleep");
    const agent = findAgent(state, verbRun.agentId);
    const blocker = findSleepBlocker(agent, resolveNapMinutes(run, step));
    if (blocker !== null) return { kind: "refused", reason: blocker };
    const placeName = readThingName(scopeOf(run), "item");
    const slept = startSleep(agent, placeName, state.tick, resolveNapMinutes(run, step));
    if (!slept.isSuccess) throw new Error(`sleep started despite its check: ${slept.reason}`);
    replaceAgent(state, slept.agent);
    markAgentChanged(result, verbRun.agentId);
    const place = findRoleThing(run, "item");
    const event = createEvent(state, slept.agent, {
      kind: "fell_asleep",
      description: `fell asleep in the ${placeName}`,
      targetId: place?.kind === "entity" ? place.entityId : null,
      targetName: placeName,
    });
    broadcastEvent(state, event, result);
    context.dependencies.reflectionHook.onSleepStarted(state, verbRun.agentId, state.tick);
    return { kind: "pause", untilTick: slept.agent.currentAction?.endsAtTick ?? null };
  },
};

function describeDefender(run: StepRun): Defender {
  const { state } = run.context;
  const target = run.verbRun?.target ?? null;
  if (target?.kind !== "agent") return { kind: "entity" };
  const defender = findAgent(state, target.agentId);
  return {
    kind: "agent",
    agility: defender.body.agility,
    isAsleep: isAsleep(defender),
    isUser: target.agentId === run.verbRun?.agentId,
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
    const attacker = findAgent(state, verbRun.agentId);
    const chance = hasTarget
      ? computeHitChance(baseHitChance, attacker.body.agility, describeDefender(run))
      : 1;
    verbRun.isHit = state.random.next() < chance;
    return DONE;
  },
};
