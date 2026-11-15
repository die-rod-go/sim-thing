import { matchesThing, type Rule } from "@village/shared";
import { config } from "../config";
import { createLogger } from "../logger";
import { describeConditionKilling } from "../status/conditions";
import {
  findThingDefinitionId,
  describeThingName,
  viewThing,
  type ThingRef,
} from "../items/things";
import type { RuleCause } from "./rule-cause";
import { applyStep } from "./steps/step-registry";
import { describeRunCause } from "./steps/step-roles";
import type { StepRun } from "./steps/step-run";
import type { TickContext } from "./tick-context";

const logger = createLogger("rules");

/*
 * Rules run on three triggers. `stimulus` and `becomes` are set off here; `every` and expiring
 * components are driven by the tick in rule-timers.ts. A rule that sets off another is one level
 * deeper, and a chain deeper than `rules.maxDepth` is dropped.
 */

/** A rule that matched a thing, with what the thing was then, to tell if it changed since. */
export interface CollectedRule {
  thing: ThingRef;
  definitionId: string;
  rule: Rule;
}

/** The `becomes` rules that matched a thing before a write, kept to see which ones are new after. */
export interface BecomesSnapshot {
  thing: ThingRef;
  component: string;
  matchedBefore: ReadonlySet<Rule>;
}

/** What a rule's run carries: its own `killed` phrase if it has one, else the cause's. */
export function deriveRuleCause(rule: Rule, parent: RuleCause, depth: number): RuleCause {
  const killed = rule.killed
    ? describeConditionKilling(rule.killed, parent.sourceId)
    : parent.killed;
  return { killed, sourceId: parent.sourceId, depth };
}

/** False, and logged into the tick's result, when a firing at `depth` is past `rules.maxDepth`. */
export function isWithinDepthCap(
  context: TickContext,
  depth: number,
  thing: ThingRef,
  trigger: string,
): boolean {
  if (depth <= config.rules.maxDepth) return true;
  const { state } = context;
  const message =
    `tick ${state.tick}: a chain of rules reached the depth cap of ${config.rules.maxDepth} ` +
    `at ${trigger} on ${describeThingName(state, thing)}`;
  logger.warn(message);
  context.result.ruleDepthCapHits.push(message);
  return false;
}

/** Whether the thing still exists as what it was when the rule was collected. */
function isUnchanged(context: TickContext, collected: CollectedRule): boolean {
  return findThingDefinitionId(context.state, collected.thing) === collected.definitionId;
}

export function runRule(context: TickContext, thing: ThingRef, rule: Rule, cause: RuleCause): void {
  const run: StepRun = {
    context,
    verbRun: null,
    self: thing,
    sourceId: cause.sourceId,
    killedPhrase: cause.killed,
    depth: cause.depth,
    isInPassing: false,
  };
  for (const step of rule.steps) {
    const outcome = applyStep(run, step);
    if (outcome.kind === "refused") {
      logger.warn(`a ${rule.trigger} rule's ${step.step} step was refused: ${outcome.reason}`);
    }
  }
}

/** Runs rules that were all judged at one moment, skipping any whose thing an earlier one changed. */
export function runCollectedRules(
  context: TickContext,
  collected: readonly CollectedRule[],
  parent: RuleCause,
  depth: number,
): void {
  for (const item of collected) {
    if (!isUnchanged(context, item)) continue;
    runRule(context, item.thing, item.rule, deriveRuleCause(item.rule, parent, depth));
  }
}

function collect(context: TickContext, thing: ThingRef, rules: readonly Rule[]): CollectedRule[] {
  const view = viewThing(context.state, thing);
  if (view === null) return [];
  return rules
    .filter((rule) => matchesThing(rule.if, view))
    .map((rule) => ({ thing, definitionId: view.definitionId, rule }));
}

/**
 * A stimulus reaches the receiver and sets off every matching `stimulus` rule, with the receiver as
 * `self`. All are judged against the receiver as it was when the stimulus arrived, in file order,
 * so one rule's steps can't stop or start another for the same stimulus.
 */
export function sendStimulus(run: StepRun, receiver: ThingRef, stimulus: string): void {
  const { context } = run;
  const indexed = context.state.items.rules.stimulusByName.get(stimulus) ?? [];
  const collected = collect(
    context,
    receiver,
    indexed.map((entry) => entry.rule),
  );
  if (collected.length === 0) return;
  const parent = describeRunCause(run);
  const depth = parent.depth + 1;
  if (!isWithinDepthCap(context, depth, receiver, `the ${stimulus} stimulus`)) return;
  runCollectedRules(context, collected, parent, depth);
}

function listBecomesRules(context: TickContext, component: string): Rule[] {
  return (context.state.items.rules.becomesByComponent.get(component) ?? []).map(
    (entry) => entry.rule,
  );
}

/** Before a write to `component`: which `becomes` rules that mention it match the thing now. */
export function collectBecomes(
  context: TickContext,
  thing: ThingRef,
  component: string,
): BecomesSnapshot | null {
  const matched = collect(context, thing, listBecomesRules(context, component));
  const view = viewThing(context.state, thing);
  if (view === null) return null;
  return {
    thing,
    component,
    matchedBefore: new Set(matched.map((item) => item.rule)),
  };
}

/** After the write: the rules that match now and didn't before fire, in file order. */
export function fireBecomes(
  context: TickContext,
  snapshot: BecomesSnapshot | null,
  cause: RuleCause,
): void {
  if (snapshot === null) return;
  const fresh = collect(
    context,
    snapshot.thing,
    listBecomesRules(context, snapshot.component),
  ).filter((item) => !snapshot.matchedBefore.has(item.rule));
  if (fresh.length === 0) return;
  const depth = cause.depth + 1;
  if (!isWithinDepthCap(context, depth, snapshot.thing, `a change to ${snapshot.component}`))
    return;
  runCollectedRules(context, fresh, cause, depth);
}
