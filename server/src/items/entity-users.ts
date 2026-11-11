import type { Entity } from "@village/shared";

/** Agents using an entity right now: players at the card table, a sleeper in a bed. */

export function addEntityUser(entity: Entity, agentId: string): Entity {
  const userIds = entity.state.userIds ?? [];
  if (userIds.includes(agentId)) return entity;
  return { ...entity, state: { ...entity.state, userIds: [...userIds, agentId] } };
}

export function removeEntityUser(entity: Entity, agentId: string): Entity {
  const userIds = entity.state.userIds ?? [];
  if (!userIds.includes(agentId)) return entity;
  const remaining = userIds.filter((userId) => userId !== agentId);
  return { ...entity, state: { ...entity.state, userIds: remaining } };
}

export function countOtherUsers(entity: Entity, agentId: string): number {
  return (entity.state.userIds ?? []).filter((userId) => userId !== agentId).length;
}
