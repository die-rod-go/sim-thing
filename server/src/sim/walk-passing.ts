import type { Entity, Position, Verb } from "@village/shared";
import { describeEntityName, findEntityIfPresent } from "../items/entity-store";
import { listVerbsDoneInPassing } from "../items/verb-offers";
import { blocksMovement } from "../items/world-physics";
import type { VerbRun } from "./agent-runtime";
import { describeVerbPhrase } from "./action-phrases";
import { applyEffect, findEffectBlocker } from "./effects/effect-registry";
import type { EffectRun } from "./effects/effect-run";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import type { TickContext } from "./tick-context";
import { computeLoudness } from "./verb-hits";
import { findAgent } from "./world-access";
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

function buildPassingRun(state: WorldState, agentId: string, verb: Verb, blocker: Entity): VerbRun {
  return {
    agentId,
    verb: verb.name,
    usedEntityId: blocker.id,
    usedDefinitionId: blocker.definitionId,
    usedName: describeEntityName(state, blocker),
    startedAtTick: state.tick,
  };
}

/**
 * Stepping onto a tile something blocks does what the blocker allows in passing (opening a door):
 * the verb's effects all run at once, start and finish, after every one has been checked, and it
 * is seen as the verb finishing. Returns why the walk can't go on, or null when the way is clear.
 */
export function clearTileInPassing(
  context: TickContext,
  agentId: string,
  tile: Position,
): string | null {
  const { state, result } = context;
  for (const blocker of listBlockersOnTile(state, tile)) {
    const name = describeEntityName(state, blocker);
    const [verb] = listVerbsDoneInPassing(state, agentId, blocker);
    if (!verb) return `the ${name} was in the way`;
    const run = buildPassingRun(state, agentId, verb, blocker);
    const effectRun: EffectRun = {
      context,
      verb,
      run,
      text: "",
      sourceAgentId: agentId,
      reactionDepth: 0,
    };
    const refusal = verb.effects
      .map((effect) => findEffectBlocker(effectRun, effect))
      .find((reason) => reason !== null);
    if (refusal) return refusal;
    for (const effect of verb.effects) applyEffect(effectRun, effect);
    const event = createEvent(state, findAgent(state, agentId), {
      kind: "action_finished",
      description: describeVerbPhrase(verb, "done", { item: name }),
      targetId: blocker.id,
      targetName: name,
      loudness: computeLoudness(state, verb, run),
    });
    broadcastEvent(state, event, result);
    const remaining = findEntityIfPresent(state, blocker.id);
    if (remaining && blocksMovement(state, remaining)) return `the ${name} was still in the way`;
  }
  return null;
}
