import { capitalize } from "../../economy/types";
import { replaceEntity } from "../../items/entity-store";
import { countWholeStock, takeStock } from "../../items/stock";
import { resolveNumber } from "../../items/verb-numbers";
import { markEntityChanged } from "../world-access";
import {
  describeEffectEntity,
  findEffectEntity,
  findUsedDefinition,
  type EffectHandler,
} from "./effect-run";

/** Takes from a `stock` component (the wheat field); fails when there isn't enough. */
export const takeStockEffect: EffectHandler<"take_stock"> = {
  findBlocker(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return null;
    const amount = resolveNumber(effect.amount, findUsedDefinition(effectRun));
    return countWholeStock(entity) < amount
      ? `The ${describeEffectEntity(effectRun, entity)} is empty`
      : null;
  },
  apply(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return {};
    const amount = resolveNumber(effect.amount, findUsedDefinition(effectRun));
    replaceEntity(effectRun.context.state, takeStock(entity, amount));
    markEntityChanged(effectRun.context.result, entity.id);
    return {};
  },
};

/** Opens or closes a door. */
export const setOpenEffect: EffectHandler<"set_open"> = {
  findBlocker(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return null;
    const name = describeEffectEntity(effectRun, entity);
    if (entity.state.isOpen === undefined) return `${capitalize(name)} doesn't open or close`;
    if (entity.state.isOpen === effect.isOpen) {
      return `The ${name} is already ${effect.isOpen ? "open" : "closed"}`;
    }
    return null;
  },
  apply(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return {};
    const opened = { ...entity, state: { ...entity.state, isOpen: effect.isOpen } };
    replaceEntity(effectRun.context.state, opened);
    markEntityChanged(effectRun.context.result, entity.id);
    return {};
  },
};
