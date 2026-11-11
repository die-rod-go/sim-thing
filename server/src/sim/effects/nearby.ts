import { isSameThing, listThingsWithin, locateThing, type ThingRef } from "../../items/things";
import type { EffectRun } from "./effect-run";

/**
 * What `nearby` is measured from: `self` in a rule; in a verb, the target, else
 * the thing used, else the user.
 */
function findNearbyCenter(effectRun: EffectRun): ThingRef | null {
  if (effectRun.self !== undefined) return effectRun.self;
  const { run } = effectRun;
  if (run === null) return null;
  if (run.aim !== undefined) return run.aim;
  if (run.usedEntityId !== null) return { kind: "entity", entityId: run.usedEntityId };
  return { kind: "agent", agentId: run.agentId };
}

/**
 * Every agent and entity within `radius` tiles, not counting `self`. Carried and contained things
 * are where their holder or container is, so a torch in a hand is next to its holder.
 */
export function listNearbyThings(effectRun: EffectRun, radius: number): ThingRef[] {
  const { state } = effectRun.context;
  const center = findNearbyCenter(effectRun);
  const position = center === null ? null : locateThing(state, center);
  if (center === null || position === null) return [];
  const { self } = effectRun;
  return listThingsWithin(state, position, radius).filter(
    (thing) => self === undefined || !isSameThing(thing, self),
  );
}
