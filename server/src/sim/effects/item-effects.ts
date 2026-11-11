import type { EntityLocation } from "@village/shared";
import { createEntity, moveEntity, removeEntity } from "../../items/entity-store";
import { resolveNumber } from "../../items/verb-numbers";
import type { WorldState } from "../world-state";
import { findAgent, markEntityChanged, markEntityRemoved } from "../world-access";
import { findEffectEntity, findUsedDefinition, type EffectHandler } from "./effect-run";

function locateAtFeet(state: WorldState, agentId: string): EntityLocation {
  const agent = findAgent(state, agentId);
  return { kind: "tile", place: agent.place, pos: { ...agent.pos } };
}

function locateWith(state: WorldState, agentId: string, into: "user" | "ground"): EntityLocation {
  return into === "user" ? { kind: "inventory", agentId } : locateAtFeet(state, agentId);
}

/** Makes new entities, in the user's hands or at their feet (baking makes 4 bread). */
export const produceEffect: EffectHandler<"produce"> = {
  apply(effectRun, effect) {
    const { state, result } = effectRun.context;
    const count = Math.max(
      0,
      Math.round(resolveNumber(effect.count, findUsedDefinition(effectRun))),
    );
    for (let made = 0; made < count; made += 1) {
      const location = locateWith(state, effectRun.run.agentId, effect.into);
      markEntityChanged(result, createEntity(state, effect.item, location).id);
    }
    return { made: { definitionId: effect.item, count } };
  },
};

/** Removes the entity for good (eating the bread, using up a bandage, a door smashed apart). */
export const destroyEffect: EffectHandler<"destroy"> = {
  apply(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return {};
    removeEntity(effectRun.context.state, entity.id);
    markEntityRemoved(effectRun.context.result, entity.id);
    return {};
  },
};

/** Moves the entity into the user's hands or onto the ground at their feet. */
export const moveEffect: EffectHandler<"move"> = {
  apply(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return {};
    if (effect.to !== "user" && effect.to !== "ground") {
      throw new Error(`"${effectRun.verb.name}": move to ${effect.to} isn't built yet`);
    }
    const { state, result } = effectRun.context;
    moveEntity(state, entity.id, locateWith(state, effectRun.run.agentId, effect.to));
    markEntityChanged(result, entity.id);
    return {};
  },
};
