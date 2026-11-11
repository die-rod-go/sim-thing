import { countWholeStock, takeStock } from "../../items/stock";
import { resolveNumber } from "../../items/verb-numbers";
import {
  describeEffectEntity,
  findEffectEntity,
  findUsedComponents,
  type EffectHandler,
} from "./effect-run";

/** Takes from a stock (the wheat field); fails when there isn't enough. */
export const takeStockEffect: EffectHandler<"take_stock"> = {
  findBlocker(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return null;
    const amount = resolveNumber(effect.amount, findUsedComponents(effectRun));
    return countWholeStock(effectRun.context.state, entity) < amount
      ? `The ${describeEffectEntity(effectRun, entity)} is empty`
      : null;
  },
  apply(effectRun, effect) {
    const entity = findEffectEntity(effectRun, effect);
    if (!entity) return {};
    takeStock(
      effectRun.context,
      entity,
      resolveNumber(effect.amount, findUsedComponents(effectRun)),
    );
    return {};
  },
};
