import type { Agent, Note, WorldObject } from "@village/shared";
import { config, type InteractionRecipe } from "../config";
import { addItems, countItem, findMissingItems, removeItems, type Inventory } from "./inventory";
import { applyNeedEffects } from "./needs";
import { postNote, readNoticeBoard } from "./noticeBoard";
import {
  addObjectUser,
  countOtherUsers,
  countWholeStock,
  removeObjectUser,
  setDoorOpen,
  takeStock,
} from "./objectState";
import { SLEEP_INTERACTION, startSleep } from "./sleep";
import { capitalize, failWith, type InteractionRecord, type MechanicResult } from "./types";

/** An object in the world, or the name of an item the agent carries. */
export type InteractionTarget = WorldObject | string;

export interface InteractionOption {
  name: string;
  targetName: string;
  recipe: InteractionRecipe;
  missingInputs: Inventory;
  isStockEmpty: boolean;
}

export interface StartInteractionRequest {
  agent: Agent;
  target: InteractionTarget;
  interaction: string;
  tick: number;
  text?: string;
  /** Nap length for sleep; omitted means sleep until a wake reason. */
  minutesChosen?: number;
}

export interface StartedInteraction {
  agent: Agent;
  /** The updated object; null for held items. */
  object: WorldObject | null;
  record: InteractionRecord;
  /** Notes read from a notice board; empty for every other interaction. */
  notesRead: Note[];
}

export interface InteractionProgress {
  agent: Agent;
  object: WorldObject | null;
  record: InteractionRecord;
}

const PLAY_CARDS_INTERACTION = "play cards";

export function listAvailableInteractions(
  agent: Agent,
  target: InteractionTarget,
): InteractionOption[] {
  return listInteractionNames(target).map((name) => {
    const recipe = findRecipe(name);
    return {
      name,
      targetName: describeTargetName(target),
      recipe,
      missingInputs: findMissingItems(agent.inventory, recipe.inputs),
      isStockEmpty: typeof target !== "string" && isStockShort(target, recipe),
    };
  });
}

/** "bake bread (needs 2 wheat, 1 wood; you are missing 1 wood)" for the interact prompt. */
export function describeInteractionOption(option: InteractionOption): string {
  const details: string[] = [];
  if (Object.keys(option.recipe.inputs).length > 0) {
    details.push(`needs ${describeItems(option.recipe.inputs)}`);
  }
  if (Object.keys(option.missingInputs).length > 0) {
    details.push(`you are missing ${describeItems(option.missingInputs)}`);
  }
  if (option.isStockEmpty) {
    details.push(`the ${option.targetName} is empty`);
  }
  return details.length === 0 ? option.name : `${option.name} (${details.join("; ")})`;
}

/**
 * Starts an interaction. Inputs and stock are consumed now, so a cancelled interaction loses
 * them. Reading, posting and doors take effect at the start; outputs and need effects come at
 * `finishInteraction`.
 */
export function startInteraction(
  request: StartInteractionRequest,
): MechanicResult<StartedInteraction> {
  const { agent, target, tick } = request;
  const interaction = findInteractionName(listInteractionNames(target), request.interaction);
  if (interaction === undefined) {
    return failWith(describeUnknownInteraction(target, request.interaction));
  }
  if (typeof target !== "string" && interaction === SLEEP_INTERACTION) {
    const slept = startSleep(agent, target, tick, request.minutesChosen);
    return slept.isSuccess
      ? {
          isSuccess: true,
          agent: slept.agent,
          object: slept.bed,
          record: slept.record,
          notesRead: [],
        }
      : slept;
  }
  const recipe = findRecipe(interaction);
  const shortfall = describeShortfall(agent.inventory, recipe.inputs);
  if (shortfall !== null) {
    return failWith(shortfall);
  }
  const record: InteractionRecord = {
    agentId: agent.id,
    interaction,
    targetName: describeTargetName(target),
    objectId: typeof target === "string" ? null : target.id,
    startedAtTick: tick,
  };
  const busyAgent: Agent = {
    ...agent,
    inventory: removeItems(agent.inventory, recipe.inputs),
    currentAction: {
      kind: "interact",
      target: record.targetName,
      endsAtTick: recipe.ticks === null ? null : tick + recipe.ticks,
    },
  };
  if (typeof target === "string") {
    return { isSuccess: true, agent: busyAgent, object: null, record, notesRead: [] };
  }
  const objectChange = applyObjectEffect(target, request, interaction, recipe);
  if (!objectChange.isSuccess) {
    return objectChange;
  }
  return {
    isSuccess: true,
    agent: busyAgent,
    object: addObjectUser(objectChange.object, agent.id),
    record,
    notesRead: interaction === "read" ? readNoticeBoard(target) : [],
  };
}

/** Completes an interaction: outputs go to the inventory and need effects apply. */
export function finishInteraction(progress: InteractionProgress): {
  agent: Agent;
  object: WorldObject | null;
} {
  const { agent, object, record } = progress;
  const recipe = findRecipe(record.interaction);
  const otherPlayers =
    object !== null && record.interaction === PLAY_CARDS_INTERACTION
      ? countOtherUsers(object, agent.id)
      : 0;
  const funBonus = otherPlayers * config.playCards.funPerOtherPlayer;
  const needs = applyNeedEffects(agent.needs, {
    ...recipe.needEffects,
    fun: (recipe.needEffects.fun ?? 0) + funBonus,
  });
  return {
    agent: {
      ...agent,
      inventory: addItems(agent.inventory, recipe.outputs),
      needs,
      currentAction: null,
    },
    object: object === null ? null : removeObjectUser(object, agent.id),
  };
}

/**
 * Stops an interaction early when the agent chooses something else. Consumed inputs and stock
 * are not refunded and no outputs or need effects are given: the work was spent.
 */
export function cancelInteraction(progress: InteractionProgress): {
  agent: Agent;
  object: WorldObject | null;
} {
  const { agent, object } = progress;
  return {
    agent: { ...agent, currentAction: null },
    object: object === null ? null : removeObjectUser(object, agent.id),
  };
}

function applyObjectEffect(
  object: WorldObject,
  request: StartInteractionRequest,
  interaction: string,
  recipe: InteractionRecipe,
): MechanicResult<{ object: WorldObject }> {
  if (isStockShort(object, recipe)) {
    return failWith(`The ${object.name} is empty`);
  }
  if (interaction === "open" || interaction === "close") {
    return setDoorOpen(object, interaction === "open");
  }
  if (interaction === "post a note") {
    return postNote(object, request.agent, request.text ?? "", request.tick);
  }
  return { isSuccess: true, object: takeStock(object, recipe.stockUsed) };
}

function listInteractionNames(target: InteractionTarget): string[] {
  if (typeof target === "string") {
    return config.heldItems[normalizeName(target)]?.interactions ?? [];
  }
  return config.objects[target.kind].interactions;
}

function findInteractionName(names: string[], requested: string): string | undefined {
  return names.find((name) => normalizeName(name) === normalizeName(requested));
}

function findRecipe(interaction: string): InteractionRecipe {
  const recipe = config.interactions[interaction];
  if (recipe === undefined) {
    throw new Error(`No recipe in config.interactions for "${interaction}"`);
  }
  return recipe;
}

function isStockShort(object: WorldObject, recipe: InteractionRecipe): boolean {
  return recipe.stockUsed > 0 && countWholeStock(object) < recipe.stockUsed;
}

function describeTargetName(target: InteractionTarget): string {
  return typeof target === "string" ? normalizeName(target) : target.name;
}

function describeUnknownInteraction(target: InteractionTarget, requested: string): string {
  if (typeof target !== "string") {
    return `The ${target.name} doesn't do '${requested}'`;
  }
  const item = normalizeName(target);
  if (config.heldItems[item] === undefined) {
    return `${capitalize(item)} isn't something I can use`;
  }
  return `I can't '${requested}' ${item}`;
}

function describeShortfall(inventory: Inventory, required: Inventory): string | null {
  const reasons = Object.keys(findMissingItems(inventory, required)).map((item) => {
    const held = countItem(inventory, item);
    const needed = required[item] ?? 0;
    return held === 0
      ? `I don't have any ${item}: I need ${needed}`
      : `I don't have enough ${item}: I need ${needed} and have ${held}`;
  });
  return reasons.length === 0 ? null : reasons.join("; ");
}

function describeItems(items: Inventory): string {
  return Object.entries(items)
    .map(([item, amount]) => `${amount} ${item}`)
    .join(", ");
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
