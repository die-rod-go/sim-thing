import type { Agent, Entity } from "@village/shared";
import { config } from "../config";
import { listTileEntitiesAt } from "../items/entity-store";
import { canSee } from "../perception/sight";
import { buildPerceptionWorld } from "./world-access";
import type { WorldState } from "./world-state";

/**
 * What is at the agent's place: placed objects and items on the ground. The open road spans the
 * whole map between named places, so there it is only what the agent can see.
 */
export function listHereEntities(state: WorldState, agent: Agent): Entity[] {
  const entities = listTileEntitiesAt(state, agent.place);
  if (agent.place !== config.map.defaultOutdoorPlace) return entities;
  const world = buildPerceptionWorld(state);
  return entities.filter(
    (entity) =>
      entity.location.kind === "tile" &&
      canSee(world, agent.pos, entity.location.pos, config.perception.sightRangeTiles),
  );
}
