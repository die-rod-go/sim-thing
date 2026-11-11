import { config } from "../../config";
import { addComponent, removeComponent } from "../../items/thing-writes";
import { createThingEvent } from "../../items/things";
import { resolveNumber, resolveText } from "../../items/verb-numbers";
import { broadcastEvent } from "../event-broadcast";
import { sendStimulus } from "../rule-engine";
import {
  describeRunCause,
  findEffectSubject,
  findValueSources,
  type EffectHandler,
} from "./effect-run";

/** Adds a component to the subject for `minutes`, or until removed; the run's agent is its source. */
export const addConditionEffect: EffectHandler<"add_condition"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    const minutes =
      effect.minutes === undefined
        ? null
        : resolveNumber(effect.minutes, findValueSources(effectRun));
    addComponent(
      effectRun.context,
      subject,
      effect.condition,
      { minutes },
      describeRunCause(effectRun),
    );
    return {};
  },
};

/** Removes a component the subject has. */
export const removeConditionEffect: EffectHandler<"remove_condition"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject !== null) {
      removeComponent(effectRun.context, subject, effect.condition, describeRunCause(effectRun));
    }
    return {};
  },
};

/** Sends a stimulus without damage (`water`, `fire`). */
export const emitEffect: EffectHandler<"emit"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    sendStimulus(effectRun, subject, resolveText(effect.stimulus, findValueSources(effectRun)));
    return {};
  },
};

/** A one-off sound from where the subject is (a crash, a creak of hinges). */
export const makeSoundEffect: EffectHandler<"make_sound"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    const { state, result } = effectRun.context;
    const event = createThingEvent(state, subject, {
      kind: "sound",
      description: config.effects.soundDescription,
      loudness: resolveNumber(effect.loudness, findValueSources(effectRun)),
    });
    if (event !== null) broadcastEvent(state, event, result);
    return {};
  },
};
