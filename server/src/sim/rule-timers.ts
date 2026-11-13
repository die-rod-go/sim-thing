import {
  compareEntityAge,
  isBodyInWorld,
  listGuaranteedComponents,
  listMatcherTerms,
  matchesThing,
  type ItemCatalog,
  type Rule,
  type RuleOfTrigger,
} from "@village/shared";
import { removeComponent } from "../items/thing-writes";
import { findThingDefinitionId, readThingChanges, viewThing, type ThingRef } from "../items/things";
import { describeConditionKilling, hasComponentEnded } from "../status/conditions";
import { NO_RULE_CAUSE } from "./rule-cause";
import { runRule } from "./rule-engine";
import type { TickContext } from "./tick-context";

/*
 * What the tick drives: components that run out are removed (so `becomes` rules see it), then
 * `every` rules fire on the things that match them.
 */

type EveryRule = RuleOfTrigger<"every">;

interface DueRule {
  thing: ThingRef;
  definitionId: string;
  rule: EveryRule;
  count: number;
}

/** Bodies in agent order, then entities by id, whatever order the world keeps them in. */
function listThingsInRuleOrder(context: TickContext): ThingRef[] {
  const { state } = context;
  const agents = state.agents
    .filter(isBodyInWorld)
    .map((agent): ThingRef => ({ kind: "agent", agentId: agent.id }));
  const entities = [...state.entities]
    .sort(compareEntityAge)
    .map((entity): ThingRef => ({ kind: "entity", entityId: entity.id }));
  return [...agents, ...entities];
}

/** Removes every component whose end has come, with no one behind it and no death phrase. */
export function expireComponents(context: TickContext): void {
  const { state } = context;
  for (const thing of listThingsInRuleOrder(context)) {
    for (const name of Object.keys(readThingChanges(state, thing) ?? {})) {
      const instance = readThingChanges(state, thing)?.[name] ?? null;
      if (hasComponentEnded(instance, state.tick)) {
        removeComponent(context, thing, name, NO_RULE_CAUSE);
      }
    }
  }
}

/**
 * How many multiples of `everyMinutes` fall in the sim-minutes this tick covers, which is
 * ((tick - 1) * minutesPerTick, tick * minutesPerTick]. So a rule fires as often per hour at any
 * tick length.
 */
export function countEveryFirings(
  tick: number,
  minutesPerTick: number,
  everyMinutes: number,
): number {
  const lastMinute = Math.max(0, tick * minutesPerTick);
  const previousMinute = Math.max(0, (tick - 1) * minutesPerTick);
  return Math.floor(lastMinute / everyMinutes) - Math.floor(previousMinute / everyMinutes);
}

const requiredComponentsByCatalog = new WeakMap<ItemCatalog, Map<Rule, string[]>>();

/** What a thing must have for the rule's `if` to match at all, so most things are skipped unseen. */
function listRequiredComponents(items: ItemCatalog, rule: Rule): string[] {
  let byRule = requiredComponentsByCatalog.get(items);
  if (byRule === undefined) {
    byRule = new Map();
    requiredComponentsByCatalog.set(items, byRule);
  }
  let required = byRule.get(rule);
  if (required === undefined) {
    required = [...listGuaranteedComponents(rule.if, items.definitionsById)];
    byRule.set(rule, required);
  }
  return required;
}

function listDueRules(context: TickContext, minutesPerTick: number): DueRule[] {
  const { state } = context;
  const timed = state.items.rules.every
    .map(({ rule }) => ({
      rule,
      count: countEveryFirings(state.tick, minutesPerTick, rule.minutes),
    }))
    .filter(({ count }) => count > 0);
  if (timed.length === 0) return [];
  const due: DueRule[] = [];
  for (const thing of listThingsInRuleOrder(context)) {
    const view = viewThing(state, thing);
    if (view === null) continue;
    for (const { rule, count } of timed) {
      const hasRequired = listRequiredComponents(state.items, rule).every((name) =>
        Object.hasOwn(view.components, name),
      );
      if (hasRequired && matchesThing(rule.if, view)) {
        due.push({ thing, definitionId: view.definitionId, rule, count });
      }
    }
  }
  return due;
}

/** The agent behind the first component the rule's `if` names that the thing has with a source. */
function findEverySource(context: TickContext, thing: ThingRef, rule: EveryRule): string | null {
  const changes = readThingChanges(context.state, thing) ?? {};
  for (const term of listMatcherTerms(rule.if)) {
    const source = "has" in term ? (changes[term.has]?.sourceAgentId ?? null) : null;
    if (source !== null) return source;
  }
  return null;
}

function isStillDue(context: TickContext, due: DueRule): boolean {
  const { state } = context;
  if (findThingDefinitionId(state, due.thing) !== due.definitionId) return false;
  const view = viewThing(state, due.thing);
  return view !== null && matchesThing(due.rule.if, view);
}

/**
 * Mechanics phase, after expired components are removed. What is due is worked out first, so a
 * component added during this phase is first seen next tick; each firing checks the thing still
 * matches (a fire put out mid-phase stops).
 */
export function runEveryRules(context: TickContext, minutesPerTick: number): void {
  for (const due of listDueRules(context, minutesPerTick)) {
    for (let firing = 0; firing < due.count; firing += 1) {
      if (!isStillDue(context, due)) break;
      const sourceAgentId = findEverySource(context, due.thing, due.rule);
      runRule(context, due.thing, due.rule, {
        killed: describeConditionKilling(due.rule.killed ?? "", sourceAgentId),
        sourceAgentId,
        depth: 0,
      });
    }
  }
}
