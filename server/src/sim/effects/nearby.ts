import type { EffectRun, EffectSubjectRef } from "./effect-run";
import { isSameSubject, listSubjectsWithin, locateSubject } from "./subjects";

/**
 * What `nearby` is measured from: `self` in a condition or reaction; in a verb, the target, else
 * the thing used, else the user.
 */
function findNearbyCenter(effectRun: EffectRun): EffectSubjectRef | null {
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
export function listNearbySubjects(effectRun: EffectRun, radius: number): EffectSubjectRef[] {
  const { state } = effectRun.context;
  const center = findNearbyCenter(effectRun);
  const position = center === null ? null : locateSubject(state, center);
  if (center === null || position === null) return [];
  const { self } = effectRun;
  return listSubjectsWithin(state, position, radius).filter(
    (subject) => self === undefined || !isSameSubject(subject, self),
  );
}
