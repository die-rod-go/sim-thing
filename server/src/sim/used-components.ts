import {
  resolveBodyComponents,
  resolveEntityComponents,
  type ResolvedComponents,
} from "@village/shared";
import { findEntityIfPresent } from "../items/entity-store";
import type { UsedThing, VerbRun } from "./agent-runtime";
import { findAgent } from "./world-access";
import type { WorldState } from "./world-state";

/**
 * What a verb's numbers read from: the components of the thing used right now. A thing a `start`
 * effect used up (the bread being eaten) is read as an untouched one of its definition.
 */
export function readRunComponents(state: WorldState, run: VerbRun): ResolvedComponents | null {
  if (run.usedBodyId !== undefined) {
    return resolveBodyComponents(state.items, findAgent(state, run.usedBodyId));
  }
  if (run.usedEntityId === null) return null;
  const entity = findEntityIfPresent(state, run.usedEntityId);
  if (entity) return resolveEntityComponents(state.items, entity);
  const untouched =
    run.usedDefinitionId === null
      ? undefined
      : state.items.definitionComponentsById.get(run.usedDefinitionId);
  return untouched ?? null;
}

/** The components of a thing a verb is about to be used with; null for a bare-handed verb. */
export function readUsedThingComponents(
  state: WorldState,
  used: UsedThing,
): ResolvedComponents | null {
  if (used.kind === "user") return null;
  if (used.kind === "body")
    return resolveBodyComponents(state.items, findAgent(state, used.agentId));
  const entity = findEntityIfPresent(state, used.entityId);
  return entity ? resolveEntityComponents(state.items, entity) : null;
}
