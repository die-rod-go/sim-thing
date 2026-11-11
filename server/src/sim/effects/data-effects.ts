import { writeField } from "../../items/thing-writes";
import { createThingEvent, readField, type ThingRef } from "../../items/things";
import { resolveNumber } from "../../items/verb-numbers";
import { isDead } from "../../status/health";
import { getAgentRuntime, requestDecision } from "../agent-runtime";
import { broadcastEvent } from "../event-broadcast";
import { findAgent, rememberBriefly } from "../world-access";
import {
  describeRunCause,
  findEffectSubject,
  findValueSources,
  type EffectHandler,
  type EffectRun,
} from "./effect-run";

/** Writes a literal into a field; a thing without the component is skipped. */
export const setEffect: EffectHandler<"set"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    writeField(effectRun.context, subject, effect.field, effect.to, describeRunCause(effectRun));
    return {};
  },
};

/** Adds `by` to a number field; a thing without the field is skipped. */
export const changeEffect: EffectHandler<"change"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    const current = readField(effectRun.context.state, subject, effect.field);
    if (typeof current !== "number") return {};
    const by = resolveNumber(effect.by, findValueSources(effectRun));
    writeField(effectRun.context, subject, effect.field, current + by, describeRunCause(effectRun));
    return {};
  },
};

function findLivingAgentId(effectRun: EffectRun, subject: ThingRef): string | null {
  if (subject.kind !== "agent") return null;
  const { state } = effectRun.context;
  return isDead(findAgent(state, subject.agentId)) ? null : subject.agentId;
}

/**
 * An `announced` event whose subject is the thing, seen by whoever sees it unless private. A
 * living agent's own body is that agent's own: they remember it in the first person (when nobody
 * else's event would have told them) and get an urgent decision.
 */
export const announceEffect: EffectHandler<"announce"> = {
  apply(effectRun, effect) {
    const subject = findEffectSubject(effectRun, effect);
    if (subject === null) return {};
    const { state, result } = effectRun.context;
    const agentId = findLivingAgentId(effectRun, subject);
    if (!effect.isPrivate) {
      const event = createThingEvent(state, subject, {
        kind: "announced",
        description: effect.text,
      });
      if (event !== null) broadcastEvent(state, event, result);
    } else if (agentId !== null) {
      rememberBriefly(state, agentId, `I ${effect.text}`);
    }
    if (agentId !== null) {
      requestDecision(getAgentRuntime(state, agentId), `I ${effect.text}`, true);
    }
    return {};
  },
};
