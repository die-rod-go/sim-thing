import type { Entity, Position } from "@village/shared";
import { findEntityIfPresent } from "../items/entity-store";
import { listVerbsDoneInPassing } from "../items/verb-offers";
import { blocksMovement } from "../items/world-physics";
import { describeBlockingThing } from "./blocking-things";
import type { TickContext } from "./tick-context";
import { runVerbInPassing } from "./verb-runner";
import type { WorldState } from "./world-state";

function listBlockersOnTile(state: WorldState, tile: Position): Entity[] {
  return state.entities.filter(
    (entity) =>
      entity.location.kind === "tile" &&
      entity.location.pos.x === tile.x &&
      entity.location.pos.y === tile.y &&
      blocksMovement(state, entity),
  );
}

/**
 * Stepping onto a tile something blocks does what the blocker allows in passing (clearing its way):
 * the verb's steps are checked, then all run at once with no waiting, and it is seen as the verb
 * finishing. Returns why the walk can't go on, or null when the way is clear.
 */
export function clearTileInPassing(
  context: TickContext,
  agentId: string,
  tile: Position,
): string | null {
  const { state } = context;
  for (const blocker of listBlockersOnTile(state, tile)) {
    const [verb] = listVerbsDoneInPassing(state, agentId, blocker);
    if (!verb) return describeBlockingThing(state, blocker);
    const refusal = runVerbInPassing(context, agentId, state.items.verbs.indexOf(verb), blocker);
    if (refusal !== null) return refusal;
    const remaining = findEntityIfPresent(state, blocker.id);
    if (remaining && blocksMovement(state, remaining)) {
      return describeBlockingThing(state, remaining);
    }
  }
  return null;
}
