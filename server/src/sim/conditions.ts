import type { ConditionDefinition, WorldEventKind } from "@village/shared";
import { config } from "../config";
import { addComponent, removeComponent } from "../items/thing-writes";
import {
  createThingEvent,
  listThings,
  readComponents,
  readThingChanges,
  type ThingRef,
} from "../items/things";
import { describeConditionKilling, hasComponentEnded } from "../status/conditions";
import { isDead } from "../status/health";
import { getAgentRuntime, requestDecision } from "./agent-runtime";
import { applyEffect } from "./effects/effect-registry";
import type { EffectRun } from "./effects/effect-run";
import { broadcastEvent } from "./event-broadcast";
import type { TickContext } from "./tick-context";
import { findAgent, rememberBriefly } from "./world-access";

/*
 * A condition is a component that has a `conditions` entry in items.json: while a thing has it,
 * its `everyMinute` effects run, and when its end tick comes it is removed and its `onEnd` effects
 * run. Any other component can be added and removed the same way, silently.
 */

const { minutesPerTick } = config.clock;

type ConditionChange = "started" | "ended";

const DEFAULT_EVENT_KINDS: Record<ConditionChange, WorldEventKind> = {
  started: "condition_started",
  ended: "condition_ended",
};

function findConditionDefinition(
  context: TickContext,
  name: string,
): ConditionDefinition | undefined {
  return context.state.items.conditionsByName.get(name);
}

function describeChange(
  context: TickContext,
  definition: ConditionDefinition,
  change: ConditionChange,
): string {
  const fallback =
    change === "started"
      ? config.conditions.defaultStartedPhrase
      : config.conditions.defaultEndedPhrase;
  const words = context.state.items.declarations[definition.name]?.words ?? definition.name;
  return (definition.phrases[change] ?? fallback).split("{words}").join(words);
}

/**
 * Others see a visible condition start or end as an event; the agent carrying any condition
 * notices it themselves and gets a decision.
 */
function announceChange(
  context: TickContext,
  thing: ThingRef,
  definition: ConditionDefinition,
  change: ConditionChange,
): void {
  const { state, result } = context;
  const description = describeChange(context, definition, change);
  const livingAgent =
    thing.kind === "agent" && !isDead(findAgent(state, thing.agentId))
      ? findAgent(state, thing.agentId)
      : null;
  if (state.items.declarations[definition.name]?.isVisible) {
    const kind =
      config.conditions.eventKinds[definition.name]?.[change] ?? DEFAULT_EVENT_KINDS[change];
    const event = createThingEvent(state, thing, { kind, description });
    if (event !== null) broadcastEvent(state, event, result);
  } else if (livingAgent !== null) {
    rememberBriefly(state, livingAgent.id, `I ${description}`);
  }
  if (livingAgent !== null) {
    requestDecision(getAgentRuntime(state, livingAgent.id), `I ${description}`, true);
  }
}

export interface ConditionStart {
  /** The condition's own length when omitted; none for a component with no condition entry. */
  minutes?: number;
  sourceAgentId: string | null;
}

/** Adds the component, or extends one already there to the later end; announces a new condition. */
export function startCondition(
  context: TickContext,
  thing: ThingRef,
  name: string,
  start: ConditionStart,
): void {
  const definition = findConditionDefinition(context, name);
  const minutes = start.minutes ?? definition?.defaultMinutes ?? null;
  const isNew = addComponent(context, thing, name, {
    minutes,
    sourceAgentId: start.sourceAgentId,
  });
  if (isNew === true && definition !== undefined) {
    announceChange(context, thing, definition, "started");
  }
}

function buildConditionRun(
  context: TickContext,
  thing: ThingRef,
  definition: ConditionDefinition,
  sourceAgentId: string | null,
): EffectRun {
  return {
    context,
    verb: null,
    run: null,
    text: "",
    self: thing,
    sourceAgentId,
    killed: describeConditionKilling(definition.phrases.killed ?? "", sourceAgentId),
    reactionDepth: 0,
  };
}

function readSourceAgentId(context: TickContext, thing: ThingRef, name: string): string | null {
  return readThingChanges(context.state, thing)?.[name]?.sourceAgentId ?? null;
}

/** Removes the component, whether it ran out or was taken off, and runs its onEnd effects. */
export function endCondition(context: TickContext, thing: ThingRef, name: string): void {
  const sourceAgentId = readSourceAgentId(context, thing, name);
  if (!removeComponent(context, thing, name)) return;
  const definition = findConditionDefinition(context, name);
  if (definition === undefined) return;
  announceChange(context, thing, definition, "ended");
  const conditionRun = buildConditionRun(context, thing, definition, sourceAgentId);
  for (const effect of definition.onEnd) applyEffect(conditionRun, effect);
}

/** One condition tick: it runs out, or its everyMinute effects run once per sim-minute. */
function advanceCondition(
  context: TickContext,
  thing: ThingRef,
  definition: ConditionDefinition,
): void {
  const { name } = definition;
  const isPresent = (): boolean => readComponents(context.state, thing)?.[name] !== undefined;
  if (!isPresent()) return;
  const instance = readThingChanges(context.state, thing)?.[name] ?? null;
  if (hasComponentEnded(instance, context.state.tick)) {
    endCondition(context, thing, name);
    return;
  }
  for (let minute = 0; minute < minutesPerTick; minute += 1) {
    if (!isPresent()) return;
    const sourceAgentId = readSourceAgentId(context, thing, name);
    const conditionRun = buildConditionRun(context, thing, definition, sourceAgentId);
    for (const effect of definition.everyMinute) applyEffect(conditionRun, effect);
  }
}

/**
 * Mechanics: every component on every thing that is a condition runs its minutes or runs out. A
 * condition added while this runs starts on the next tick.
 */
export function advanceConditions(context: TickContext): void {
  const { state } = context;
  const due = listThings(state).flatMap((thing) =>
    Object.keys(readComponents(state, thing) ?? {}).flatMap((name) => {
      const definition = state.items.conditionsByName.get(name);
      return definition === undefined ? [] : [{ thing, definition }];
    }),
  );
  for (const { thing, definition } of due) advanceCondition(context, thing, definition);
}
