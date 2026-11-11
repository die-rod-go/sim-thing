import { listPossibleLocations, matchesRule } from "./applies-to";
import type { Effect, ItemDefinition, ItemFile } from "./item-file";
import type { ProblemList } from "./item-problems";

function removesSomething(effect: Effect): boolean {
  return effect.type === "destroy" || effect.type === "transform";
}

function makesCurrency(effect: Effect, currencyId: string): boolean {
  return (
    (effect.type === "produce" && effect.item === currencyId) ||
    (effect.type === "transform" && effect.into === currencyId)
  );
}

function canMatchCurrency(file: ItemFile, verbIndex: number, currency: ItemDefinition): boolean {
  const verb = file.verbs[verbIndex];
  if (!verb) return false;
  return listPossibleLocations(currency.form).some((location) =>
    matchesRule(verb.appliesTo, { kind: "entity", definition: currency, location }),
  );
}

/** Whether an effect in a verb could remove the currency it was used on, chose or aimed at. */
function couldRemoveCurrencyInVerb(effect: Effect, isCurrencyUsed: boolean): boolean {
  if (!removesSomething(effect)) return false;
  return (
    (effect.on === "item" && isCurrencyUsed) || effect.on === "chosen" || effect.on === "target"
  );
}

function checkVerbSupply(file: ItemFile, currency: ItemDefinition, problems: ProblemList) {
  file.verbs.forEach((verb, index) => {
    const path = `verbs.${index} (${verb.name})`;
    const isCurrencyUsed = canMatchCurrency(file, index, currency);
    if (Object.hasOwn(verb.inputs, currency.id)) {
      problems.warning(`${path}.inputs`, `Uses up ${currency.id}, so the supply isn't closed.`);
    }
    verb.effects.forEach((effect, effectIndex) => {
      const effectPath = `${path}.effects.${effectIndex}`;
      if (makesCurrency(effect, currency.id)) {
        problems.warning(effectPath, `Makes ${currency.id}, so the supply isn't closed.`);
      } else if (couldRemoveCurrencyInVerb(effect, isCurrencyUsed)) {
        problems.warning(effectPath, `Could destroy ${currency.id}, so the supply isn't closed.`);
      }
    });
  });
}

function checkReactionSupply(file: ItemFile, currency: ItemDefinition, problems: ProblemList) {
  file.reactions.forEach((reaction, index) => {
    const reachesCurrency =
      reaction.property === undefined || currency.properties.includes(reaction.property);
    reaction.effects.forEach((effect, effectIndex) => {
      const path = `reactions.${index}.effects.${effectIndex}`;
      if (makesCurrency(effect, currency.id)) {
        problems.warning(path, `Makes ${currency.id}, so the supply isn't closed.`);
      } else if (reachesCurrency && removesSomething(effect)) {
        problems.warning(path, `Could destroy ${currency.id}, so the supply isn't closed.`);
      }
    });
  });
}

function checkDefinitionSupply(file: ItemFile, currency: ItemDefinition, problems: ProblemList) {
  file.definitions.forEach((definition, index) => {
    const path = `definitions.${index} (${definition.id})`;
    (definition.onBroken ?? []).forEach((effect, effectIndex) => {
      if (makesCurrency(effect, currency.id)) {
        problems.warning(`${path}.onBroken.${effectIndex}`, `Makes ${currency.id} when it breaks.`);
      }
    });
  });
  if (Object.hasOwn(currency.components, "durability")) {
    problems.warning(
      `definitions (${currency.id}).components.durability`,
      `${currency.id} can break, so the supply isn't closed.`,
    );
  }
}

/**
 * Warns about anything that could make or destroy the currency. Coins are a closed supply: they
 * only change hands.
 */
export function checkCurrencySupply(
  file: ItemFile,
  currencyId: string,
  problems: ProblemList,
): void {
  const currency = file.definitions.find((definition) => definition.id === currencyId);
  if (!currency) {
    problems.error("definitions", `The currency "${currencyId}" has no definition.`);
    return;
  }
  checkVerbSupply(file, currency, problems);
  checkReactionSupply(file, currency, problems);
  checkDefinitionSupply(file, currency, problems);
}
