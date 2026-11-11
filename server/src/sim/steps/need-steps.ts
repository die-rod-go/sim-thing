import {
  describeCount,
  findDefinition,
  matchesThing,
  type Entity,
  type Matcher,
  type StepOfType,
} from "@village/shared";
import { listContents } from "../../items/entity-store";
import { describeThingName, viewThing, type ThingRef } from "../../items/things";
import { readThingName, scopeOf } from "../../items/values";
import { destroyEntities } from "./step-entities";
import { findRoleThing, findStepThings, snapshotThing } from "./step-roles";
import { DONE, type StepHandler, type StepOutcome, type StepRun } from "./step-run";

type PickStep = StepOfType<"require"> | StepOfType<"use_up">;

function toHolderId(thing: ThingRef): string {
  return thing.kind === "agent" ? thing.agentId : thing.entityId;
}

/** Entities directly inside `in` that the rule matches, oldest first, never one of the run's items. */
function listMatching(run: StepRun, holder: ThingRef, rule: Matcher): Entity[] {
  const { state } = run.context;
  const itemIds = run.verbRun?.itemIds ?? [];
  return listContents(state, toHolderId(holder))
    .filter((entity) => !itemIds.includes(entity.id))
    .filter((entity) => {
      const view = viewThing(state, { kind: "entity", entityId: entity.id });
      return view !== null && matchesThing(rule, view);
    });
}

function describeHolder(run: StepRun, step: PickStep, holder: ThingRef): string {
  if (holder.kind === "agent" && step.in !== "user") return readThingName(scopeOf(run), step.in);
  if (step.in === "item" || step.in === "target") {
    return `the ${readThingName(scopeOf(run), step.in)}`;
  }
  return describeThingName(run.context.state, holder);
}

function describeShortfall(run: StepRun, step: PickStep, holder: ThingRef, held: number): string {
  const isUser = step.in === "user";
  if (!("definition" in step.rule)) {
    return isUser
      ? "I don't have what I need for that"
      : `there wasn't what it needs in ${describeHolder(run, step, holder)}`;
  }
  const definition = findDefinition(run.context.state.items, step.rule.definition);
  const plural = definition.plural ?? definition.name;
  const needed = describeCount(definition, step.count);
  const owner = isUser ? "I" : describeHolder(run, step, holder);
  if (held === 0) {
    return isUser ? `I don't have any ${plural}: I need ${needed}` : `${owner} has no ${plural}`;
  }
  return isUser
    ? `I don't have enough ${plural}: I need ${needed} and have ${held}`
    : `${owner} doesn't have enough ${plural}: it needs ${needed} and has ${held}`;
}

interface Picked {
  found: Entity[];
  refusal: string | null;
}

/** What the step would take; a holder that isn't there yet (an unset `as`) can't be judged. */
function pick(run: StepRun, step: PickStep, isJudgedLate: boolean): Picked {
  const holder = findRoleThing(run, step.in);
  if (holder === null) {
    const refusal = isJudgedLate ? "there was nothing to look in" : null;
    return { found: [], refusal };
  }
  const matching = listMatching(run, holder, step.rule);
  const found = matching.slice(0, step.count);
  const refusal =
    found.length < step.count ? describeShortfall(run, step, holder, matching.length) : null;
  return { found, refusal };
}

function nameFirst(run: StepRun, step: PickStep, first: Entity | undefined): void {
  const { verbRun } = run;
  if (step.as === undefined || verbRun === null || first === undefined) return;
  verbRun.namedIds[step.as] = first.id;
  const snapshot = snapshotThing(run.context.state, { kind: "entity", entityId: first.id });
  if (snapshot !== null) verbRun.snapshots[step.as] = snapshot;
}

export const requireStep: StepHandler<"require"> = {
  isVerbOnly: true,
  findRefusal: (run, step) => pick(run, step, false).refusal,
  run(run, step) {
    const { found, refusal } = pick(run, step, true);
    if (refusal !== null) return { kind: "refused", reason: refusal };
    nameFirst(run, step, found[0]);
    return DONE;
  },
};

/** As `require`, and destroys what it found: the first is kept by name, as it was, for later steps. */
export const useUpStep: StepHandler<"use_up"> = {
  isVerbOnly: true,
  findRefusal: (run, step) => pick(run, step, false).refusal,
  run(run, step) {
    const { found, refusal } = pick(run, step, true);
    if (refusal !== null) return { kind: "refused", reason: refusal };
    nameFirst(run, step, found[0]);
    destroyEntities(run, found);
    return DONE;
  },
};

function fillCheckText(run: StepRun, text: string): string {
  const scope = scopeOf(run);
  const item = run.verbRun === null ? "" : readThingName(scope, "item");
  const target = run.verbRun?.targetName ?? "";
  return text.split("{item}").join(item).split("{target}").join(target);
}

function findCheckFailure(run: StepRun, step: StepOfType<"check">): string | null {
  const { state } = run.context;
  const things = findStepThings(run, step.on ?? "self");
  const failed = things.some((thing) => {
    const view = viewThing(state, thing);
    return view === null || !matchesThing(step.if, view);
  });
  return failed ? fillCheckText(run, step.otherwise) : null;
}

export const checkStep: StepHandler<"check"> = {
  isVerbOnly: true,
  findRefusal: findCheckFailure,
  run(run, step): StepOutcome {
    const reason = findCheckFailure(run, step);
    return reason === null ? DONE : { kind: "refused", reason };
  },
};
