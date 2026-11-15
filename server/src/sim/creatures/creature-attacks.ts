import { config } from "../../config";
import { locateThing, refThingById, type ThingRef } from "../../items/things";
import { getCreatureRuntime, type VerbRun } from "../agent-runtime";
import type { WorldState } from "../world-state";
import { isCreatureId } from "./creature-instincts";

/** A creature remembers who just went for it, hit or missed, so it can strike back. */
export function noteAttackOnCreature(state: WorldState, verbRun: VerbRun): void {
  const { target } = verbRun;
  if (target?.kind !== "entity" || target.entityId === verbRun.userId) return;
  if (!isCreatureId(state, target.entityId)) return;
  getCreatureRuntime(state, target.entityId).lastAttack = {
    attackerId: verbRun.userId,
    tick: state.tick,
  };
}

/** Whoever attacked the creature within `attackMemoryMinutes`, if they are still in the world. */
export function findRecentAttacker(state: WorldState, entityId: string): ThingRef | null {
  const lastAttack = state.creatureRuntimes[entityId]?.lastAttack ?? null;
  if (lastAttack === null) return null;
  const memoryTicks = config.creatures.attackMemoryMinutes / config.clock.minutesPerTick;
  if (state.tick - lastAttack.tick > memoryTicks) return null;
  const attacker = refThingById(lastAttack.attackerId);
  return locateThing(state, attacker) === null ? null : attacker;
}
