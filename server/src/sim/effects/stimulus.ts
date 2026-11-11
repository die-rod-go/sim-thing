import { matchesThing } from "@village/shared";
import { config } from "../../config";
import { createLogger } from "../../logger";
import { describeThingName, viewThing, type ThingRef } from "../../items/things";
import { describeConditionKilling } from "../../status/conditions";
import { applyEffect } from "./effect-registry";
import type { EffectRun } from "./effect-run";

const logger = createLogger("reactions");

/**
 * A stimulus (`cut`, `impact`, `fire`) reaches what it was sent to and sets off every matching
 * reaction, with the receiver as `self`. All are judged against the receiver as it was when the
 * stimulus arrived, in file order, so one reaction's effects can't stop or start another for the
 * same stimulus. The agent behind the run stays the source along the chain, so a fire spread from
 * Tobias's torch gives each new `burning` Tobias as its cause. A chain deeper than
 * `reactions.maxDepth` stops there.
 */
export function sendStimulus(effectRun: EffectRun, receiver: ThingRef, stimulus: string): void {
  const { context } = effectRun;
  const { state } = context;
  const view = viewThing(state, receiver);
  if (view === null) return;
  const reactions = state.items.file.reactions.filter(
    (reaction) => reaction.stimulus === stimulus && matchesThing(reaction.if, view),
  );
  if (reactions.length === 0) return;
  const reactionDepth = effectRun.reactionDepth + 1;
  if (reactionDepth > config.reactions.maxDepth) {
    const message =
      `tick ${state.tick}: a chain of reactions reached the depth cap of ` +
      `${config.reactions.maxDepth} at ${stimulus} on ${describeThingName(state, receiver)}`;
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
