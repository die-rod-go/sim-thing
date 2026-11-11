import type { ActiveCondition, WorldEvent } from "@village/shared";
import {
  describeEntityName,
  findEntityIfPresent,
  getDefinition,
  replaceEntity,
  resolveEntityPosition,
  type EntityPosition,
} from "../../items/entity-store";
import { computeChebyshevDistance } from "../../economy/give";
import { describeBodyName, isDead } from "../../status/health";
import { createEvent, type EventFields } from "../event-factory";
import { takeNextEventId, type WorldState, type TickResult } from "../world-state";
import { findAgent, markAgentChanged, markEntityChanged, replaceAgent } from "../world-access";
import type { EffectSubjectRef } from "./effect-run";

/*
 * Agents and entities alike can carry conditions, receive stimuli and be `nearby`. These read and
 * write them through one reference.
 */

/** The subject's conditions; null when it no longer exists. */
export function readSubjectConditions(
  state: WorldState,
  subject: EffectSubjectRef,
): ActiveCondition[] | null {
  if (subject.kind === "agent") return findAgent(state, subject.agentId).conditions;
  return findEntityIfPresent(state, subject.entityId)?.state.conditions ?? null;
}

export function writeSubjectConditions(
  state: WorldState,
  result: TickResult,
  subject: EffectSubjectRef,
  conditions: ActiveCondition[],
): void {
  if (subject.kind === "agent") {
    replaceAgent(state, { ...findAgent(state, subject.agentId), conditions });
    markAgentChanged(result, subject.agentId);
    return;
  }
  const entity = findEntityIfPresent(state, subject.entityId);
  if (!entity) return;
  replaceEntity(state, { ...entity, state: { ...entity.state, conditions } });
  markEntityChanged(result, subject.entityId);
}

/** What reactions match on: the subject's properties (agents have the `person` ones) and conditions. */
export function listSubjectTraits(
  state: WorldState,
  subject: EffectSubjectRef,
): Set<string> | null {
  const conditionNames = (conditions: readonly ActiveCondition[]) =>
    conditions.map((condition) => condition.name);
  if (subject.kind === "agent") {
    const agent = findAgent(state, subject.agentId);
    return new Set([...state.items.file.person.properties, ...conditionNames(agent.conditions)]);
  }
  const entity = findEntityIfPresent(state, subject.entityId);
  if (!entity) return null;
  const { properties } = getDefinition(state, entity);
  return new Set([...properties, ...conditionNames(entity.state.conditions)]);
}

/** Where the subject is; a carried or contained entity is where its holder or container is. */
export function locateSubject(state: WorldState, subject: EffectSubjectRef): EntityPosition | null {
  if (subject.kind === "agent") {
    const agent = findAgent(state, subject.agentId);
    return { place: agent.place, pos: agent.pos };
  }
  const entity = findEntityIfPresent(state, subject.entityId);
  return entity ? resolveEntityPosition(state, entity) : null;
}

export function isSameSubject(first: EffectSubjectRef, second: EffectSubjectRef): boolean {
  if (first.kind === "agent") return second.kind === "agent" && first.agentId === second.agentId;
  return second.kind === "entity" && first.entityId === second.entityId;
}

/** Every agent (the dead too) and entity within `radius` tiles of `center`, agents first. */
export function listSubjectsWithin(
  state: WorldState,
  center: EntityPosition,
  radius: number,
): EffectSubjectRef[] {
  const isWithin = (position: EntityPosition | null) =>
    position !== null && computeChebyshevDistance(center.pos, position.pos) <= radius;
  const agents: EffectSubjectRef[] = state.agents
    .filter((agent) => isWithin({ place: agent.place, pos: agent.pos }))
    .map((agent) => ({ kind: "agent", agentId: agent.id }));
  const entities: EffectSubjectRef[] = state.entities
    .filter((entity) => isWithin(resolveEntityPosition(state, entity)))
    .map((entity) => ({ kind: "entity", entityId: entity.id }));
  return [...agents, ...entities];
}

/** "the bakery door", "Mara's body", or the agent's name. */
export function describeSubjectName(state: WorldState, subject: EffectSubjectRef): string {
  if (subject.kind === "agent") {
    const agent = findAgent(state, subject.agentId);
    return isDead(agent) ? describeBodyName(agent.name) : agent.name;
  }
  const entity = findEntityIfPresent(state, subject.entityId);
  return entity ? `the ${describeEntityName(state, entity)}` : "something";
}

/**
 * An event whose subject is the given agent or thing. A living agent acts and remembers it; a
 * thing or a body is only seen. Null for a thing that is no longer anywhere.
 */
export function createSubjectEvent(
  state: WorldState,
  subject: EffectSubjectRef,
  fields: EventFields,
): WorldEvent | null {
  if (subject.kind === "agent") {
    const agent = findAgent(state, subject.agentId);
    if (!isDead(agent)) return createEvent(state, agent, fields);
  }
  const position = locateSubject(state, subject);
  if (position === null) return null;
  const actorId = subject.kind === "agent" ? subject.agentId : subject.entityId;
  return {
    id: takeNextEventId(state),
    tick: state.tick,
    actorId,
    actorName: describeSubjectName(state, subject),
    kind: fields.kind,
    targetId: fields.targetId ?? null,
    targetName: fields.targetName ?? null,
    place: position.place,
    pos: { ...position.pos },
    description: fields.description,
    loudness: fields.loudness ?? null,
    isActorThing: true,
  };
}
