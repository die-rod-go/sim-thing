import type { AgentMemory } from "@village/shared";
import { config } from "../config";

/*
 * When an agent next takes stock, and when it owes a reality pass: the reflection runs on the
 * agent's own clock (hours awake, how much has happened, falling asleep for the night) and soon
 * after something owes it; the reality pass runs every few episodes, and sooner on a signal that the
 * agent is stuck.
 */

const MINUTES_PER_HOUR = 60;

/** Falling asleep for the night, a reckoning or a moment marked to remember: take stock soon. */
export function oweReflection(memory: AgentMemory): AgentMemory {
  return { ...memory, reflection: { ...memory.reflection, isOwed: true } };
}

function hasBeenAwakeLongEnough(memory: AgentMemory): boolean {
  const ticksPerHour = MINUTES_PER_HOUR / config.clock.minutesPerTick;
  const { awakeTicksSince, streamEntriesSince } = memory.reflection;
  return (
    awakeTicksSince >= config.reflection.everyHoursAwake * ticksPerHour &&
    streamEntriesSince >= config.reflection.minNewEntries
  );
}

/** Owed, or long enough awake with enough happened, and never within the least gap of the last. */
export function isReflectionDue(memory: AgentMemory, tick: number): boolean {
  const { lastTick, isOwed } = memory.reflection;
  if (lastTick !== null && tick - lastTick < config.reflection.minGapTicks) return false;
  return isOwed || hasBeenAwakeLongEnough(memory);
}

/** The memory once a reflection has been applied: the clock starts again, and nothing is owed. */
export function markReflected(memory: AgentMemory, tick: number): AgentMemory {
  return {
    ...memory,
    reflection: { lastTick: tick, awakeTicksSince: 0, streamEntriesSince: 0, isOwed: false },
  };
}

export function noteAwakeTick(memory: AgentMemory): AgentMemory {
  const { reflection } = memory;
  return {
    ...memory,
    reflection: { ...reflection, awakeTicksSince: reflection.awakeTicksSince + 1 },
  };
}

export function noteStreamEntry(memory: AgentMemory): AgentMemory {
  const { reflection } = memory;
  return {
    ...memory,
    reflection: { ...reflection, streamEntriesSince: reflection.streamEntriesSince + 1 },
  };
}

/** A merged repeat as large as `realityPass.repeatCountSignal` owes a reality pass. */
export function noteRepeatCount(memory: AgentMemory, count: number): AgentMemory {
  if (count !== config.realityPass.repeatCountSignal) return memory;
  return { ...memory, isRealityPassOwed: true };
}

/** One more act failed; `realityPass.failureCountSignal` of them in a row owe a reality pass. */
export function noteFailedAct(memory: AgentMemory): AgentMemory {
  const failedActsInARow = memory.failedActsInARow + 1;
  const isRealityPassOwed =
    memory.isRealityPassOwed || failedActsInARow >= config.realityPass.failureCountSignal;
  return { ...memory, failedActsInARow, isRealityPassOwed };
}

/** An act went through, which ends any run of failures. */
export function noteActDone(memory: AgentMemory): AgentMemory {
  return memory.failedActsInARow === 0 ? memory : { ...memory, failedActsInARow: 0 };
}

function realityPassEpisodeInterval(): number {
  return Math.max(1, Math.floor(config.memory.episodesMax / config.realityPass.episodesMaxDivisor));
}

/** One more episode made; every `realityPassEpisodeInterval` of them owe a reality pass. */
export function noteEpisodeMade(memory: AgentMemory): AgentMemory {
  const episodesSinceRealityPass = memory.episodesSinceRealityPass + 1;
  const isRealityPassOwed =
    memory.isRealityPassOwed || episodesSinceRealityPass >= realityPassEpisodeInterval();
  return { ...memory, episodesSinceRealityPass, isRealityPassOwed };
}

export function markRealityPassDone(memory: AgentMemory): AgentMemory {
  return {
    ...memory,
    isRealityPassOwed: false,
    failedActsInARow: 0,
    episodesSinceRealityPass: 0,
  };
}
