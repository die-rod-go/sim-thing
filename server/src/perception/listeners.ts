import { config } from "../config";
import { canSee } from "./sight";
import { computeSoundCosts, readSoundCost } from "./sound";
import type { ObviousListeners, PerceptionWorld, Perceiver } from "./types";

/**
 * Agents the speaker can see who would clearly hear normal speech, and the subset close enough
 * for a whisper. Sleepers are left out: they would not hear ordinary speech.
 */
export function findObviousListeners(
  world: PerceptionWorld,
  speaker: Perceiver,
  others: Perceiver[],
): ObviousListeners {
  const { speechLoudness, sightRangeTiles } = config.perception;
  const soundCosts = computeSoundCosts(world, speaker.pos, speechLoudness.normal);
  const wouldHearNormal: string[] = [];
  const wouldHearWhisper: string[] = [];
  for (const other of others) {
    if (other.agentId === speaker.agentId || other.isAsleep) continue;
    if (!canSee(world, speaker.pos, other.pos, sightRangeTiles)) continue;
    const pathCost = readSoundCost(soundCosts, world.grid, other.pos);
    if (pathCost > speechLoudness.normal) continue;
    wouldHearNormal.push(other.agentId);
    if (pathCost <= speechLoudness.whisper) wouldHearWhisper.push(other.agentId);
  }
  return { wouldHearNormal, wouldHearWhisper };
}
