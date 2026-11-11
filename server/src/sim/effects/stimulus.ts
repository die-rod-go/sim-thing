import { config } from "../../config";
import { createLogger } from "../../logger";
import { findMatchingReactions } from "../../items/reactions";
import { describeConditionKilling } from "../../status/conditions";
import { applyEffect } from "./effect-registry";
import type { EffectRun, EffectSubjectRef } from "./effect-run";
import { describeSubjectName, listSubjectTraits } from "./subjects";

const logger = createLogger("reactions");

/**
 * A stimulus (`cut`, `impact`, `fire`) reaches what it was sent to and sets off every matching
 * reaction, with the receiver as `self`. The agent behind the run stays the source along the
 * chain, so a fire spread from Tobias's torch gives each new `burning` Tobias as its cause. A
 * chain deeper than `reactions.maxDepth` stops there.
 */
export function sendStimulus(
  effectRun: EffectRun,
  receiver: EffectSubjectRef,
  stimulus: string,
): void {
  const { context } = effectRun;
  const { state } = context;
  const traits = listSubjectTraits(state, receiver);
  if (traits === null) return;
  const reactions = findMatchingReactions(state.items.file.reactions, stimulus, traits);
  if (reactions.length === 0) return;
  const reactionDepth = effectRun.reactionDepth + 1;
  if (reactionDepth > config.reactions.maxDepth) {
    const message =
      `tick ${state.tick}: a chain of reactions reached the depth cap of ` +
      `${config.reactions.maxDepth} at ${stimulus} on ${describeSubjectName(state, receiver)}`;
    logger.warn(message);
    context.result.reactionCapHits.push(message);
    return;
  }
  for (const reaction of reactions) {
    const reactionRun: EffectRun = {
      context,
      verb: null,
      run: null,
      text: "",
      self: receiver,
      sourceAgentId: effectRun.sourceAgentId,
      killed: describeConditionKilling(reaction.phrases.killed ?? "", effectRun.sourceAgentId),
      reactionDepth,
    };
    for (const effect of reaction.effects) applyEffect(reactionRun, effect);
  }
}
