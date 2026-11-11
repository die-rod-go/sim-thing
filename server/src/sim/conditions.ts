import type { ActiveCondition, ConditionDefinition, WorldEventKind } from "@village/shared";
import { config } from "../config";
import {
  addToConditions,
  computeConditionEndTick,
  describeConditionKilling,
  hasConditionEnded,
  removeFromConditions,
} from "../status/conditions";
import { isDead } from "../status/health";
import { getAgentRuntime, requestDecision } from "./agent-runtime";
import { applyEffect } from "./effects/effect-registry";
import type { EffectRun, EffectSubjectRef } from "./effects/effect-run";
import {
  createSubjectEvent,
  readSubjectConditions,
  writeSubjectConditions,
} from "./effects/subjects";
import { broadcastEvent } from "./event-broadcast";
import type { TickContext } from "./tick-context";
import { findAgent, rememberBriefly } from "./world-access";

const { minutesPerTick } = config.clock;

function findConditionDefinition(context: TickContext, name: string): ConditionDefinition {
  const definition = context.state.items.conditionsByName.get(name);
  if (!definition) throw new Error(`Unknown condition "${name}"`);
  return definition;
}

type ConditionChange = "started" | "ended";

const DEFAULT_EVENT_KINDS: Record<ConditionChange, WorldEventKind> = {
  started: "condition_started",
  ended: "condition_ended",
};

function describeChange(definition: ConditionDefinition, change: ConditionChange): string {
  const fallback =
    change === "started"
      ? config.conditions.defaultStartedPhrase
      : config.conditions.defaultEndedPhrase;
  return (definition.phrases[change] ?? fallback).split("{words}").join(definition.words);
}

/**
 * Others see a visible condition start or end as an event; the agent carrying any condition
 * notices it themselves and gets a decision.
 */
function announceChange(
  context: TickContext,
  subject: EffectSubjectRef,
  definition: ConditionDefinition,
  change: ConditionChange,
): void {
  const { state, result } = context;
  const description = describeChange(definition, change);
  const livingAgent =
    subject.kind === "agent" && !isDead(findAgent(state, subject.agentId))
      ? findAgent(state, subject.agentId)
      : null;
  if (definition.isVisible) {
    const kind =
      config.conditions.eventKinds[definition.name]?.[change] ?? DEFAULT_EVENT_KINDS[change];
    const event = createSubjectEvent(state, subject, { kind, description });
    if (event !== null) broadcastEvent(state, event, result);
  } else if (livingAgent !== null) {
    rememberBriefly(state, livingAgent.id, `I ${description}`);
  }
  if (livingAgent !== null) {
    requestDecision(getAgentRuntime(state, livingAgent.id), `I ${description}`, true);
  }
}

export interface ConditionStart {
  /** The condition's own length when omitted. */
  minutes?: number;
  sourceAgentId: string | null;
}

/** Starts a condition, or extends one already there to the later end. */
export function startCondition(
  context: TickContext,
  subject: EffectSubjectRef,
  name: string,
  start: ConditionStart,
): void {
  const { state, result } = context;
  const definition = findConditionDefinition(context, name);
  const conditions = readSubjectConditions(state, subject);
  if (conditions === null) return;
  const minutes = start.minutes ?? definition.defaultMinutes;
  const added: ActiveCondition = {
    name,
    endsAtTick: computeConditionEndTick(minutes, state.tick, minutesPerTick),
    sourceAgentId: start.sourceAgentId,
  };
  const addition = addToConditions(conditions, added);
  writeSubjectConditions(state, result, subject, addition.conditions);
  if (addition.isNew) announceChange(context, subject, definition, "started");
}

function buildConditionRun(
  context: TickContext,
  subject: EffectSubjectRef,
  definition: ConditionDefinition,
  condition: ActiveCondition,
): EffectRun {
  return {
    context,
    verb: null,
    run: null,
    text: "",
    self: subject,
    sourceAgentId: condition.sourceAgentId,
    killed: describeConditionKilling(definition.phrases.killed ?? "", condition.sourceAgentId),
    reactionDepth: 0,
  };
}

/** Ends a condition, whether it ran out or was removed, and runs its `onEnd` effects. */
export function endCondition(context: TickContext, subject: EffectSubjectRef, name: string): void {
  const { state, result } = context;
  const conditions = readSubjectConditions(state, subject);
  const condition = conditions?.find((candidate) => candidate.name === name);
  if (!conditions || !condition) return;
  const definition = findConditionDefinition(context, name);
  writeSubjectConditions(state, result, subject, removeFromConditions(conditions, name));
  announceChange(context, subject, definition, "ended");
  const conditionRun = buildConditionRun(context, subject, definition, condition);
  for (const effect of definition.onEnd) applyEffect(conditionRun, effect);
}

function findActiveCondition(
  context: TickContext,
  subject: EffectSubjectRef,
  name: string,
): ActiveCondition | undefined {
  return readSubjectConditions(context.state, subject)?.find(
    (condition) => condition.name === name,
  );
}

/** One condition's tick: it runs out, or its `everyMinute` effects run once per sim-minute. */
function advanceCondition(context: TickContext, subject: EffectSubjectRef, name: string): void {
  const condition = findActiveCondition(context, subject, name);
  if (!condition) return;
  if (hasConditionEnded(condition, context.state.tick)) {
    endCondition(context, subject, name);
    return;
  }
  const definition = findConditionDefinition(context, name);
  for (let minute = 0; minute < minutesPerTick; minute += 1) {
    const current = findActiveCondition(context, subject, name);
    if (!current) return;
    const conditionRun = buildConditionRun(context, subject, definition, current);
    for (const effect of definition.everyMinute) applyEffect(conditionRun, effect);
  }
}

/**
 * Mechanics: every condition on agents (bodies too) and entities runs its minutes or runs out.
 * Conditions added while this runs start on the next tick.
 */
export function advanceConditions(context: TickContext): void {
  const { state } = context;
  const due: { subject: EffectSubjectRef; name: string }[] = [
    ...state.agents.flatMap((agent) =>
      agent.conditions.map((condition) => ({
        subject: { kind: "agent" as const, agentId: agent.id },
        name: condition.name,
      })),
    ),
    ...state.entities.flatMap((entity) =>
      entity.state.conditions.map((condition) => ({
        subject: { kind: "entity" as const, entityId: entity.id },
        name: condition.name,
      })),
    ),
  ];
  for (const { subject, name } of due) advanceCondition(context, subject, name);
}
