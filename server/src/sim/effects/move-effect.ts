import type {
  EffectOfType,
  Entity,
  EntityLocation,
  Position,
  WorldEventKind,
} from "@village/shared";
import { config } from "../../config";
import { isNestedIn, listContents, readContainerCapacity } from "../../items/containers";
import {
  describeEntityName,
  findEntityIfPresent,
  getDefinition,
  moveEntity,
  resolveEntityPosition,
} from "../../items/entity-store";
import { isWalkable } from "../../world/pathfinding";
import { findPlaceAt } from "../../world/map-loader";
import { describeItemCounts } from "../action-phrases";
import { broadcastEvent } from "../event-broadcast";
import { createEvent } from "../event-factory";
import {
  buildWalkingGrid,
  describeAgentAsSeen,
  findAgent,
  markEntityChanged,
} from "../world-access";
import type { WorldState } from "../world-state";
import { findEffectEntity, type EffectHandler, type EffectRun } from "./effect-run";
import { sendStimulus } from "./stimulus";

type MoveEffect = EffectOfType<"move">;

const NEIGHBOR_OFFSETS: readonly Position[] = [-1, 0, 1].flatMap((offsetY) =>
  [-1, 0, 1].flatMap((offsetX) =>
    offsetX === 0 && offsetY === 0 ? [] : [{ x: offsetX, y: offsetY }],
  ),
);

/** Everything the effect moves: all the chosen things for `on: chosen`, otherwise one entity. */
function listMovedEntities(effectRun: EffectRun, effect: MoveEffect): Entity[] {
  if (effect.on === "chosen") {
    return (effectRun.run.chosenEntityIds ?? []).flatMap((entityId) => {
      const entity = findEntityIfPresent(effectRun.context.state, entityId);
      return entity ? [entity] : [];
    });
  }
  const entity = findEffectEntity(effectRun, effect);
  return entity ? [entity] : [];
}

function locateOnTile(state: WorldState, pos: Position): EntityLocation {
  return { kind: "tile", place: findPlaceAt(state.map, pos), pos: { ...pos } };
}

function findAimTile(state: WorldState, effectRun: EffectRun): Position | null {
  const { aim } = effectRun.run;
  if (!aim) return null;
  if (aim.kind === "agent") return findAgent(state, aim.agentId).pos;
  const entity = findEntityIfPresent(state, aim.entityId);
  return entity ? (resolveEntityPosition(state, entity)?.pos ?? null) : null;
}

/** A hit lands on the target's tile; a miss on a random free tile next to it, if there is one. */
function findLandingTile(state: WorldState, effectRun: EffectRun): Position | null {
  const aimTile = findAimTile(state, effectRun);
  if (aimTile === null || effectRun.isHit !== false) return aimTile;
  const grid = buildWalkingGrid(state);
  const freeTiles = NEIGHBOR_OFFSETS.map((offset) => ({
    x: aimTile.x + offset.x,
    y: aimTile.y + offset.y,
  })).filter((tile) => isWalkable(grid, tile));
  return freeTiles.length > 0 ? state.random.pick(freeTiles) : aimTile;
}

/** Where the effect moves things to; null when it can't (`to: item` on something that isn't a container). */
function findDestination(effectRun: EffectRun, effect: MoveEffect): EntityLocation | null {
  const { state } = effectRun.context;
  const { run } = effectRun;
  const user = findAgent(state, run.agentId);
  switch (effect.to) {
    case "user":
      return { kind: "inventory", agentId: run.agentId };
    case "ground":
      return locateOnTile(state, user.pos);
    case "item":
      if (run.usedBodyId !== undefined) return { kind: "inventory", agentId: run.usedBodyId };
      return run.usedEntityId === null ? null : { kind: "inside", containerId: run.usedEntityId };
    case "target_tile": {
      const tile = findLandingTile(state, effectRun);
      return locateOnTile(state, tile ?? user.pos);
    }
  }
}

function describeHolder(state: WorldState, location: EntityLocation): string {
  if (location.kind === "inventory") return describeAgentAsSeen(findAgent(state, location.agentId));
  if (location.kind !== "inside") return "";
  const container = findEntityIfPresent(state, location.containerId);
  return container ? `the ${describeEntityName(state, container)}` : "it";
}

/** Why the things can't go into the container: it is one of them, inside one of them, or full. */
function findContainerProblem(
  state: WorldState,
  containerId: string,
  moved: readonly Entity[],
): string | null {
  const container = findEntityIfPresent(state, containerId);
  if (!container) return null;
  const name = describeEntityName(state, container);
  const isSelfNesting = moved.some(
    (entity) => entity.id === containerId || isNestedIn(state, container, entity.id),
  );
  if (isSelfNesting) return `the ${name} can't go inside itself`;
  const capacity = readContainerCapacity(state, container);
  if (capacity === null) return `the ${name} can't hold anything`;
  const room = capacity - listContents(state, containerId).length;
  if (room <= 0) return `the ${name} was full`;
  return moved.length > room ? `the ${name} only had room for ${room} more` : null;
}

type MoveEventKind = keyof typeof config.verbs.movePhrases & WorldEventKind;

interface MoveAnnouncement {
  kind: MoveEventKind;
  holderLocation: EntityLocation | null;
}

/** The event a move makes, from where the things were and where they went. */
function classifyMove(
  effect: MoveEffect,
  origin: EntityLocation,
  destination: EntityLocation,
): MoveAnnouncement {
  if (effect.to === "target_tile") return { kind: "threw", holderLocation: null };
  if (effect.to === "item") return { kind: "put", holderLocation: destination };
  if (effect.to === "ground") return { kind: "dropped", holderLocation: null };
  if (origin.kind === "tile") return { kind: "picked_up", holderLocation: null };
  return { kind: "took", holderLocation: origin };
}

function fillMovePhrase(phrase: string, names: Record<string, string>): string {
  return Object.entries(names).reduce(
    (text, [placeholder, value]) => text.split(`{${placeholder}}`).join(value),
    phrase,
  );
}

function announceMove(
  effectRun: EffectRun,
  effect: MoveEffect,
  moved: readonly Entity[],
  origin: EntityLocation,
  destination: EntityLocation,
): void {
  const { state, result } = effectRun.context;
  const { run } = effectRun;
  const { kind, holderLocation } = classifyMove(effect, origin, destination);
  const [first] = moved;
  const counts: Record<string, number> = {};
  for (const entity of moved) counts[entity.definitionId] = (counts[entity.definitionId] ?? 0) + 1;
  const itemText = describeItemCounts(state.items, counts);
  const holder = holderLocation === null ? "" : describeHolder(state, holderLocation);
  const phrase = config.verbs.movePhrases[kind];
  const description = fillMovePhrase(phrase, {
    items: itemText,
    holder,
    target: run.aimName ?? "",
  });
  const holderId =
    holderLocation?.kind === "inside"
      ? holderLocation.containerId
      : holderLocation?.kind === "inventory"
        ? holderLocation.agentId
        : null;
  const event = createEvent(state, findAgent(state, run.agentId), {
    kind,
    description,
    targetId: holderId,
    targetName: holder || null,
    item: first ? getDefinition(state, first).name : undefined,
    amount: moved.length,
    itemText,
  });
  broadcastEvent(state, event, result);
}

/**
 * Moves things into the user's hands, onto the ground at their feet, into the container used, or
 * to where a throw lands (hit or miss), which then receives the landing stimulus. Moving into a
 * container respects its capacity and never puts a container inside itself or its own contents.
 */
export const moveEffect: EffectHandler<"move"> = {
  findBlocker(effectRun, effect) {
    if (effect.to !== "item") return null;
    const destination = findDestination(effectRun, effect);
    if (destination?.kind !== "inside") return null;
    const moved = listMovedEntities(effectRun, effect);
    return findContainerProblem(effectRun.context.state, destination.containerId, moved);
  },
  apply(effectRun, effect) {
    const { state, result } = effectRun.context;
    const moved = listMovedEntities(effectRun, effect);
    const destination = findDestination(effectRun, effect);
    const [first] = moved;
    if (!first || destination === null) return {};
    const origin = first.location;
    for (const entity of moved) {
      moveEntity(state, entity.id, destination);
      markEntityChanged(result, entity.id);
      if (effect.to === "target_tile") {
        sendStimulus(
          effectRun,
          { kind: "entity", entityId: entity.id },
          config.verbs.landingStimulus,
        );
      }
    }
    const isShownByHitRoll = effect.to === "target_tile" && effectRun.isAttackAnnounced === true;
    if (isShownByHitRoll) return {};
    announceMove(effectRun, effect, moved, origin, destination);
    return { isStartAnnounced: true, isFinishAnnounced: true };
  },
};
