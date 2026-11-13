import { matchesThing, type Verb } from "@village/shared";
import { findEntityIfPresent } from "../items/entity-store";
import { resolveNumber, scopeOf } from "../items/values";
import type { VerbRun } from "./agent-runtime";
import { findStepListRefusal } from "./steps/step-registry";
import type { StepRun } from "./steps/step-run";
import { isThingInReach, isThingInSight, viewThingFrom } from "./thing-where";

/** The first reason any step from `fromIndex` on can't run now, or null. Changes nothing. */
export function findStepsRefusal(run: StepRun, verb: Verb, fromIndex: number): string | null {
  return findStepListRefusal(run, verb.steps.slice(fromIndex));
}

function holderOf(entityId: string, run: StepRun): string | null | undefined {
  const entity = findEntityIfPresent(run.context.state, entityId);
  if (!entity) return undefined;
  return entity.location.kind === "tile" ? null : entity.location.holderId;
}

/** Whether the item the verb works with is gone or someone else has it now. */
function findItemProblem(run: StepRun, verbRun: VerbRun): string | null {
  const untouchedIds = verbRun.itemIds.filter((entityId) => !verbRun.touchedIds.includes(entityId));
  for (const entityId of untouchedIds) {
    const holderId = holderOf(entityId, run);
    if (holderId === undefined) return `I no longer had the ${verbRun.itemName}`;
    if (holderId !== verbRun.itemHolderIds[entityId]) return "someone got to it first";
  }
  return null;
}

export interface ResumeProblem {
  reason: string;
  /** The only trouble is the target being out of reach, which a `roll_hit` takes as a miss. */
  isOnlyOutOfReach: boolean;
}

/** Why the target can't be acted on now: gone, no longer fitting the verb, out of sight or reach. */
function findTargetProblem(run: StepRun, verb: Verb, verbRun: VerbRun): ResumeProblem | null {
  const { target } = verbRun;
  if (target === null || verb.target === undefined) return null;
  const { state } = run.context;
  const name = verbRun.targetName ?? "it";
  const view = viewThingFrom(state, verbRun.agentId, target);
  const refused = (reason: string, isOnlyOutOfReach = false): ResumeProblem => ({
    reason,
    isOnlyOutOfReach,
  });
  if (view === null) return refused(`${name} was gone`);
  if (!matchesThing(verb.target, view)) {
    return refused(`I couldn't ${verb.name} ${name} any more`);
  }
  if (!isThingInSight(state, verbRun.agentId, target)) return refused(`${name} was out of sight`);
  const reach = resolveNumber(scopeOf(run), verb.reach);
  if (!isThingInReach(state, verbRun.agentId, target, reach)) {
    return refused(`${name} was out of reach`, true);
  }
  return null;
}

/** Why a verb that paused can't go on: its item was taken or its target is no longer reachable. */
export function findResumeProblem(run: StepRun, verb: Verb): ResumeProblem | null {
  const { verbRun } = run;
  if (verbRun === null) return null;
  const itemReason = findItemProblem(run, verbRun);
  if (itemReason !== null) return { reason: itemReason, isOnlyOutOfReach: false };
  return findTargetProblem(run, verb, verbRun);
}
