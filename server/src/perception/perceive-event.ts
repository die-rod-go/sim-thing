import type { Position, WorldEvent } from "@village/shared";
import { config } from "../config";
import { describeDirection } from "./direction";
import { isOwnNameMentioned } from "./interrupts";
import { canSee } from "./sight";
import {
  classifyHearing,
  computeMuffledReach,
  computeSoundCosts,
  readSoundCost,
  type SoundCosts,
} from "./sound";
import type { EventPerception, Hearing, PerceptionWorld, Perceiver } from "./types";

function isLoudEnoughToWake(loudness: number): boolean {
  return loudness >= config.perception.sleeperHearingLoudness;
}

function canSleeperHear(event: WorldEvent, perceiver: Perceiver): boolean {
  if (event.loudness !== null && isLoudEnoughToWake(event.loudness)) return true;
  return event.speech !== undefined && isOwnNameMentioned(event.speech.words, perceiver.name);
}

function computeHearing(
  world: PerceptionWorld,
  event: WorldEvent,
  perceiver: Perceiver,
  soundCosts: SoundCosts | null,
): Hearing {
  if (event.loudness === null || soundCosts === null) return "none";
  if (perceiver.isAsleep && !canSleeperHear(event, perceiver)) return "none";
  const pathCost = readSoundCost(soundCosts, world.grid, perceiver.pos);
  return classifyHearing(pathCost, event.loudness);
}

/**
 * The perceivers who would clearly hear a sound of this loudness made at the source: walls block
 * it, muffling tiles cost it more, and a sleeper hears only one loud enough to wake them.
 */
export function listClearHearers(
  world: PerceptionWorld,
  source: Position,
  loudness: number,
  perceivers: readonly Perceiver[],
): Perceiver[] {
  const soundCosts = computeSoundCosts(world, source, loudness);
  return perceivers.filter((perceiver) => {
    if (perceiver.isAsleep && !isLoudEnoughToWake(loudness)) return false;
    const pathCost = readSoundCost(soundCosts, world.grid, perceiver.pos);
    return classifyHearing(pathCost, loudness) === "clear";
  });
}

function perceiveByOne(
  world: PerceptionWorld,
  event: WorldEvent,
  perceiver: Perceiver,
  soundCosts: SoundCosts | null,
): EventPerception {
  const isInSight =
    !perceiver.isAsleep &&
    canSee(world, perceiver.pos, event.pos, config.perception.sightRangeTiles);
  const hearing = computeHearing(world, event, perceiver, soundCosts);
  const isHeard = hearing !== "none";
  let via: EventPerception["via"] = null;
  if (isInSight) via = "saw";
  else if (hearing === "clear") via = "heard";
  else if (hearing === "muffled") via = "heard_muffled";
  return {
    agentId: perceiver.agentId,
    via,
    isInSight,
    hearing,
    direction: isHeard && !isInSight ? describeDirection(perceiver.pos, event.pos) : null,
  };
}

/** How each perceiver other than the actor took in the event; those who perceive nothing are omitted. */
export function perceiveEvent(
  world: PerceptionWorld,
  event: WorldEvent,
  perceivers: Perceiver[],
): EventPerception[] {
  const soundCosts =
    event.loudness === null
      ? null
      : computeSoundCosts(world, event.pos, computeMuffledReach(event.loudness));
  return perceivers
    .filter((perceiver) => perceiver.agentId !== event.actorId)
    .map((perceiver) => perceiveByOne(world, event, perceiver, soundCosts))
    .filter((perception) => perception.via !== null);
}
