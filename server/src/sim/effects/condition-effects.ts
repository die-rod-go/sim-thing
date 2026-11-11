import { config } from "../../config";
import { resolveNumber, resolveText } from "../../items/verb-numbers";
import { endCondition, startCondition } from "../conditions";
import { broadcastEvent } from "../event-broadcast";
import { findEffectSubject, findUsedDefinition, type EffectHandler } from "./effect-run";
import { sendStimulus } from "./stimulus";
import { createSubjectEvent } from "./subjects";

/** Starts a condition on the subject, caused by whoever is behind the run. */
export const addConditionEffect: EffectHandler<"add_condition"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    const minutes =
      effect.minutes === undefined
        ? undefined
        : resolveNumber(effect.minutes, findUsedDefinition(effectRun));
    startCondition(effectRun.context, subject, effect.condition, {
      minutes,
      sourceAgentId: effectRun.sourceAgentId,
    });
    return {};
  },
};

/** Ends a condition the subject has, running its `onEnd` effects. */
export const removeConditionEffect: EffectHandler<"remove_condition"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject !== null) endCondition(effectRun.context, subject, effect.condition);
    return {};
  },
};

/** Sends a stimulus without damage (`water`, `fire`). */
export const emitEffect: EffectHandler<"emit"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    sendStimulus(effectRun, subject, resolveText(effect.stimulus, findUsedDefinition(effectRun)));
    return {};
  },
};

/** A one-off sound from where the subject is (a crash, a creak of hinges). */
export const makeSoundEffect: EffectHandler<"make_sound"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    const { state, result } = effectRun.context;
    const event = createSubjectEvent(state, subject, {
      kind: "sound",
      description: config.effects.soundDescription,
      loudness: resolveNumber(effect.loudness, findUsedDefinition(effectRun)),
    });
    if (event !== null) broadcastEvent(state, event, result);
    return {};
  },
};
