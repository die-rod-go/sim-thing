import type { Entity, EntityLocation } from "@village/shared";
import {
  createEntity,
  listContents,
  locateInside,
  moveEntity,
  removeEntity,
  resolveEntityPosition,
} from "../../items/entity-store";
import { resolveNumber } from "../../items/verb-numbers";
import type { TickResult, WorldState } from "../world-state";
import { findAgent, markEntityChanged, markEntityRemoved } from "../world-access";
import {
  findEffectEntity,
  findValueSources,
  requireVerbRun,
  type EffectHandler,
} from "./effect-run";

function locateAtFeet(state: WorldState, agentId: string): EntityLocation {
  const agent = findAgent(state, agentId);
  return { kind: "tile", place: agent.place, pos: { ...agent.pos } };
}

function locateWith(state: WorldState, agentId: string, into: "user" | "ground"): EntityLocation {
  return into === "user" ? locateInside(agentId) : locateAtFeet(state, agentId);
}

/** Makes new entities, in the user's hands or at their feet (baking makes 4 bread). */
export const produceEffect: EffectHandler<"produce"> = {
  apply(effectRun, effect) {
    const { state, result } = effectRun.context;
    const count = Math.max(0, Math.round(resolveNumber(effect.count, findValueSources(effectRun))));
    for (let made = 0; made < count; made += 1) {
      const location = locateWith(state, requireVerbRun(effectRun, effect).agentId, effect.into);
      markEntityChanged(result, createEntity(state, effect.item, location).id);
    }
    return { made: { definitionId: effect.item, count } };
  },
};

/** What a destroyed container held falls where it stood, so nothing is lost with it. */
function spillContents(state: WorldState, result: TickResult, container: Entity): void {
  const position = resolveEntityPosition(state, container);
  if (!position) return;
  for (const entity of listContents(state, container.id)) {
    moveEntity(state, entity.id, { kind: "tile", place: position.place, pos: { ...position.pos } });
    markEntityChanged(result, entity.id);
  }
}

/** Removes the entity for good (eating the bread, using up a bandage). */
export const destroyEffect: EffectHandler<"destroy"> = {
  apply(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return {};
    spillContents(effectRun.context.state, effectRun.context.result, entity);
    removeEntity(effectRun.context.state, entity.id);
    markEntityRemoved(effectRun.context.result, entity.id);
    return {};
  },
};

export { moveEffect } from "./move-effect";
