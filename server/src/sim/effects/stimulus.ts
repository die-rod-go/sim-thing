import type { EffectRun, EffectSubjectRef } from "./effect-run";

/**
 * Where a stimulus (`cut`, `impact`, `fire`) reaches what it was sent to. Nothing reacts to one
 * yet: reactions are matched and run here once they are built, carrying the run's user as the
 * source agent along any chain.
 */
export function sendStimulus(
  _effectRun: EffectRun,
  _receiver: EffectSubjectRef,
  _stimulus: string,
): void {}
