import type { Entity, EntityLocation, ThingId } from "@village/shared";
import {
  createEntity,
  listContents,
  moveEntity,
  removeEntity,
  resolveEntityPosition,
} from "../../items/entity-store";
import { isDead } from "../../status/health";
import { findPlaceAt } from "../../world/map-loader";
import { getAgentRuntime } from "../agent-runtime";
import {
  findAgent,
  markAgentChanged,
  markEntityChanged,
  markEntityRemoved,
  replaceAgent,
} from "../world-access";
import type { TickContext } from "../tick-context";
import { recordTouched } from "./step-roles";
import type { StepRun } from "./step-run";

/** What the holder held falls onto the tile, so nothing is lost with it. */
function dropContents(context: TickContext, holderId: ThingId, tile: EntityLocation): void {
  const { state, result } = context;
  for (const entity of listContents(state, holderId)) {
    moveEntity(state, entity.id, structuredClone(tile));
    markEntityChanged(result, entity.id);
  }
}

/** Removes the entities for good; what was inside each goes to where it was. */
export function destroyEntities(run: StepRun, entities: readonly Entity[]): void {
  const { context } = run;
  for (const entity of entities) {
    const position = resolveEntityPosition(context.state, entity);
    if (position) dropContents(context, entity.id, { kind: "tile", ...position });
    removeEntity(context.state, entity.id);
    markEntityRemoved(context.result, entity.id);
  }
  recordTouched(
    run,
    entities.map((entity) => entity.id),
  );
}

/**
 * A dead agent's body becomes an entity of the definition on its tile (a grave): what it carried
 * drops there, as a `move at` would put it, and the body leaves the world. The agent stays dead,
 * with its death and memories. A body that is gone leaves everyone's sight at once. A living body,
 * or one already replaced, is left as it is.
 */
export function replaceBody(context: TickContext, agentId: string, definitionId: string): boolean {
  const { state, result } = context;
  const agent = findAgent(state, agentId);
  if (!isDead(agent) || agent.bodyReplacedById !== null) return false;
  const tile: EntityLocation = {
    kind: "tile",
    place: findPlaceAt(state.map, agent.pos),
    pos: { ...agent.pos },
  };
  const replacement = createEntity(state, definitionId, structuredClone(tile));
  markEntityChanged(result, replacement.id);
  dropContents(context, agentId, tile);
  replaceAgent(state, { ...agent, bodyReplacedById: replacement.id });
  markAgentChanged(result, agentId);
  for (const other of state.agents) {
    const runtime = getAgentRuntime(state, other.id);
    runtime.visibleAgentIds = runtime.visibleAgentIds.filter((visibleId) => visibleId !== agentId);
  }
  return true;
}
