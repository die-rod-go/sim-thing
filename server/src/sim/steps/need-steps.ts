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
import { readThingName, resolveMatcherReads, scopeOf } from "../../items/values";
import { describePlace } from "../../memory/filing";
import { destroyEntities } from "./step-entities";
import { judgeCondition } from "./step-condition";
import { findRoleThing, nameEntity } from "./step-roles";
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
    .filter((entity) => !run.setAsideIds?.has(entity.id))
    .filter((entity) => {
      const view = viewThing(state, { kind: "entity", entityId: entity.id });
      return view !== null && matchesThing(rule, view);
    });
}

function describeHolder(run: StepRun, step: PickStep, holder: ThingRef): string {
  if (holder.kind === "agent" && step.in !== "user") return readThingName(scopeOf(run), step.in);
  if (step.in === "item" || step.in === "target") {
    return describePlace(readThingName(scopeOf(run), step.in));
  }
  return describeThingName(run.context.state, holder);
}

/** How many kinds of thing a refusal names as ones that would do. */
const SUGGESTED_KIND_COUNT = 3;

/** "an axe", "an axe or a sword": the kinds of thing that, as first made, the rule would accept. */
function describeWhatWouldDo(run: StepRun, rule: Matcher): string | null {
  const { items } = run.context.state;
  const fitting = [...items.definitionsById.values()].filter((definition) => {
    const components = items.definitionComponentsById.get(definition.id);
    return (
      components !== undefined && matchesThing(rule, { definitionId: definition.id, components })
    );
  });
  if (fitting.length === 0) return null;
  const kinds = fitting
    .slice(0, SUGGESTED_KIND_COUNT)
    .map((definition) => describeCount(definition, 1));
  const last = kinds[kinds.length - 1] ?? "";
  return kinds.length === 1 ? last : `${kinds.slice(0, -1).join(", ")} or ${last}`;
}

/** A rule that names no one definition: the refusal names the kinds of thing that would do. */
function describeUnnamedShortfall(
  run: StepRun,
  step: PickStep,
  holder: ThingRef,
  rule: Matcher,
): string {
  const wouldDo = describeWhatWouldDo(run, rule);
  if (step.in === "user") {
    return wouldDo === null
      ? "I don't have what I need for that"
      : `I need ${wouldDo} for that and have none`;
  }
  const holderName = describeHolder(run, step, holder);
  return wouldDo === null
    ? `there wasn't what it needs in ${holderName}`
    : `there wasn't what it needs in ${holderName}: it needs ${wouldDo}`;
}

function describeShortfall(
  run: StepRun,
  step: PickStep,
  holder: ThingRef,
  held: number,
  rule: Matcher,
): string {
  const isUser = step.in === "user";
  if (!("definition" in step.rule)) return describeUnnamedShortfall(run, step, holder, rule);
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

/**
 * What the step would take. A holder that isn't there yet (an unset `as`), or a `rule` reading a
 * name not picked yet, can't be judged before the verb runs.
 */
function pick(run: StepRun, step: PickStep, isJudgedLate: boolean): Picked {
  const holder = findRoleThing(run, step.in);
  if (holder === null) {
    const refusal = isJudgedLate ? "there was nothing to look in" : null;
    return { found: [], refusal };
  }
  const rule = resolveMatcherReads(scopeOf(run), step.rule);
  if (!rule.isFullyResolved && !isJudgedLate) return { found: [], refusal: null };
  const matching = listMatching(run, holder, rule.matcher);
  const found = matching.slice(0, step.count);
  const refusal =
    found.length < step.count
      ? describeShortfall(run, step, holder, matching.length, rule.matcher)
      : null;
  return { found, refusal };
}

export const requireStep: StepHandler<"require"> = {
  isVerbOnly: true,
  findRefusal: (run, step) => pick(run, step, false).refusal,
  run(run, step) {
    const { found, refusal } = pick(run, step, true);
    if (refusal !== null) return { kind: "refused", reason: refusal };
    nameEntity(run, step.as, found[0]);
    return DONE;
  },
};

/** As `require`, and destroys what it found: the first is kept by name, as it was, for later steps. */
export const useUpStep: StepHandler<"use_up"> = {
  isVerbOnly: true,
  findRefusal: (run, step) => pick(run, step, false).refusal,
  listTakenIds: (run, step) => pick(run, step, false).found.map((entity) => entity.id),
  run(run, step) {
    const { found, refusal } = pick(run, step, true);
    if (refusal !== null) return { kind: "refused", reason: refusal };
    nameEntity(run, step.as, found[0]);
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

/** What can't be judged before the verb runs doesn't refuse then. */
function findCheckFailure(
  run: StepRun,
  step: StepOfType<"check">,
  isJudgedLate: boolean,
): string | null {
  const isMatched = judgeCondition(run, step.on ?? "self", step.if, isJudgedLate);
  return isMatched === false ? fillCheckText(run, step.otherwise) : null;
}

export const checkStep: StepHandler<"check"> = {
  isVerbOnly: true,
  findRefusal: (run, step) => findCheckFailure(run, step, false),
  run(run, step): StepOutcome {
    const reason = findCheckFailure(run, step, true);
    return reason === null ? DONE : { kind: "refused", reason };
  },
};
