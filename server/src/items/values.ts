import {
  isValueRead,
  mapFieldTerms,
  parseValuePath,
  readFieldComparison,
  type Matcher,
  type ChoiceName,
  type DefinitionValue,
  type FieldValue,
  type FieldValueInput,
  type NumberRange,
  type NumberValue,
  type ResolvedComponents,
  type Step,
  type TextValue,
} from "@village/shared";
import type { VerbRun } from "../sim/agent-runtime";
import type { StepRun } from "../sim/steps/step-run";
import { pickWithinRange } from "../status/combat";
import { takeFreshId, type WorldState } from "../sim/world-state";
import { describeEntityName, findEntityIfPresent } from "./entity-store";
import { readComponents, refThingById, type ThingRef } from "./things";

/*
 * A value is a literal, a read of somebody's field, or a roll. Validation makes sure a read is
 * guaranteed, so a missing field here is a bug and throws. A thing that is gone (the bread eaten
 * by an earlier step) is read from the snapshot the run keeps of it.
 */

export interface ValueScope {
  state: WorldState;
  /** Null in a rule. */
  verbRun: VerbRun | null;
  /** The thing a rule fired on (or a nearby thing, in a fan-out). */
  self: ThingRef | null;
}

export function scopeOf(run: StepRun): ValueScope {
  return { state: run.context.state, verbRun: run.verbRun, self: run.self };
}

function requireVerbRun(scope: ValueScope, who: string): VerbRun {
  if (scope.verbRun === null) throw new Error(`"${who}" was read where no verb is running`);
  return scope.verbRun;
}

function toEntityRef(entityId: string): ThingRef {
  return { kind: "entity", entityId };
}

/** The live thing a role or `as` name stands for: `item` is the first of the stack still present. */
export function findScopeThing(scope: ValueScope, who: string): ThingRef | null {
  const { state, verbRun } = scope;
  if (who === "self") return scope.self;
  if (verbRun === null) return null;
  switch (who) {
    case "user":
      return refThingById(verbRun.userId);
    case "item": {
      const presentId = verbRun.itemIds.find((entityId) => findEntityIfPresent(state, entityId));
      return presentId === undefined ? null : toEntityRef(presentId);
    }
    case "target":
      return verbRun.target;
    default: {
      const namedId = verbRun.namedIds[who];
      return namedId !== undefined && findEntityIfPresent(state, namedId)
        ? toEntityRef(namedId)
        : null;
    }
  }
}

/** The thing's components now, else as last seen (`item`, `target` and `as` names only). */
function findScopeComponents(scope: ValueScope, who: string): ResolvedComponents | null {
  const thing = findScopeThing(scope, who);
  const live = thing === null ? null : readComponents(scope.state, thing);
  return live ?? scope.verbRun?.snapshots[who]?.components ?? null;
}

/** The thing's display name without "the": what phrases call it. */
export function readThingName(scope: ValueScope, who: string): string {
  const { state, verbRun } = scope;
  if (who === "item" && verbRun !== null) return verbRun.itemName;
  if (who === "target" && verbRun !== null && verbRun.targetName !== null) {
    return verbRun.targetName;
  }
  const thing = findScopeThing(scope, who);
  if (thing?.kind === "agent") {
    return state.agents.find((agent) => agent.id === thing.agentId)?.name ?? "someone";
  }
  const entity = thing === null ? undefined : findEntityIfPresent(state, thing.entityId);
  if (entity) return describeEntityName(state, entity);
  const snapshot = requireVerbRun(scope, who).snapshots[who];
  if (snapshot === undefined) throw new Error(`"${who}.name" was read but there is no ${who}`);
  return snapshot.name;
}

/**
 * The value a path names, or undefined when there is none to read: a thing that isn't there and
 * has no snapshot (an `as` not picked yet), a field it lacks, or a choice the decision didn't give.
 */
function findValuePathValue(scope: ValueScope, path: string): FieldValue | undefined {
  const parsed = parseValuePath(path);
  if (parsed === null) throw new Error(`Bad value path "${path}"`);
  if (parsed.kind === "choice") return scope.verbRun?.choice[parsed.choice];
  if (parsed.kind === "name") {
    const isNameKnown =
      findScopeThing(scope, parsed.who) !== null ||
      scope.verbRun?.snapshots[parsed.who] !== undefined;
    return isNameKnown ? readThingName(scope, parsed.who) : undefined;
  }
  return findScopeComponents(scope, parsed.who)?.[parsed.component]?.[parsed.field];
}

/** Validation makes sure every read is there, so a missing one is a bug. */
function readValuePath(scope: ValueScope, path: string): FieldValue {
  const value = findValuePathValue(scope, path);
  if (value === undefined) throw new Error(`"${path}" was read but there is nothing there`);
  return value;
}

function isRange(value: unknown): value is NumberRange {
  return typeof value === "object" && value !== null && "min" in value && "max" in value;
}

function rollRange(scope: ValueScope, range: NumberRange): number {
  return pickWithinRange(range, scope.state.random.next());
}

function readNumber(scope: ValueScope, path: string): number {
  const value = readValuePath(scope, path);
  if (isRange(value)) return rollRange(scope, value);
  if (typeof value !== "number") throw new Error(`"${path}" is not a number`);
  return value;
}

function resolveFactor(scope: ValueScope, times: number | string | undefined): number {
  if (times === undefined) return 1;
  return typeof times === "number" ? times : readNumber(scope, times);
}

/** A number: a literal, a field (a `range` field is rolled), or a roll within `min` and `max`. */
export function resolveNumber(scope: ValueScope, value: NumberValue): number {
  if (typeof value === "number") return value;
  if ("from" in value) return readNumber(scope, value.from) * resolveFactor(scope, value.times);
  const roll = rollRange(scope, { min: value.min, max: value.max });
  return roll * resolveFactor(scope, value.times);
}

function readText(scope: ValueScope, path: string): string {
  const value = readValuePath(scope, path);
  if (typeof value !== "string") throw new Error(`"${path}" is not text`);
  return value;
}

export function resolveText(scope: ValueScope, value: TextValue): string {
  return typeof value === "string" ? value : readText(scope, value.from);
}

export function resolveDefinitionId(scope: ValueScope, value: DefinitionValue): string {
  return typeof value === "string" ? value : readText(scope, value.from);
}

/** A field value: a literal, a text or boolean read as it is, a number read or roll, or a fresh id. */
export function resolveFieldInput(scope: ValueScope, value: FieldValueInput): FieldValue {
  if (typeof value !== "object") return value;
  if ("newId" in value) return takeFreshId(scope.state);
  if ("from" in value && value.times === undefined) {
    const read = readValuePath(scope, value.from);
    if (!isRange(read)) return read;
  }
  return resolveNumber(scope, value);
}

/** What a run's matcher looks like with its reads resolved, and whether every read had a value. */
export interface ResolvedMatcher {
  matcher: Matcher;
  /** False when a read named something not there yet: an `as` a later step picks. */
  isFullyResolved: boolean;
}

const NEVER_MATCHES: Matcher = { anyOf: [] };

/**
 * The matcher with each comparison's value read replaced by the value now (from a snapshot when
 * the thing is gone). A comparison whose read has no value never matches.
 */
export function resolveMatcherReads(scope: ValueScope, matcher: Matcher): ResolvedMatcher {
  let isFullyResolved = true;
  const resolved = mapFieldTerms(matcher, (term) => {
    const compared = readFieldComparison(term);
    if (compared === null || !isValueRead(compared.value)) return term;
    const value = findValuePathValue(scope, compared.value.from);
    if (value === undefined || isRange(value)) {
      isFullyResolved = false;
      return NEVER_MATCHES;
    }
    return { field: term.field, [compared.comparison]: value };
  });
  return { matcher: resolved, isFullyResolved };
}

function isBlankText(value: FieldValue): boolean {
  return typeof value === "string" && value.trim().length === 0;
}

function isChoiceMissing(scope: ValueScope, choice: ChoiceName): boolean {
  const value = scope.verbRun?.choice[choice];
  return value === undefined || isBlankText(value);
}

/** Every `choice.*` a settings tree reads, in `from` and `times`. */
function listChoiceReads(settings: unknown): ChoiceName[] {
  if (Array.isArray(settings)) return settings.flatMap(listChoiceReads);
  if (typeof settings !== "object" || settings === null) return [];
  return Object.entries(settings).flatMap(([key, value]) => {
    if ((key === "from" || key === "times") && typeof value === "string") {
      const parsed = parseValuePath(value);
      return parsed?.kind === "choice" ? [parsed.choice] : [];
    }
    return listChoiceReads(value);
  });
}

/** The first `choice.*` the settings read that the decision didn't give, or null. */
export function findMissingChoiceName(scope: ValueScope, settings: unknown): ChoiceName | null {
  if (scope.verbRun === null) return null;
  return listChoiceReads(settings).find((choice) => isChoiceMissing(scope, choice)) ?? null;
}

/**
 * "I didn't say what/how long" when a step reads a choice the verb lacks. A `sleep` reading a
 * missing `choice.minutes` isn't missing: it means until woken.
 */
export function findMissingChoice(scope: ValueScope, step: Step): string | null {
  const settings = step.step === "sleep" ? { ...step, minutes: undefined } : step;
  const missing = findMissingChoiceName(scope, settings);
  if (missing === null) return null;
  return missing === "minutes" ? "I didn't say how long" : "I didn't say what";
}
