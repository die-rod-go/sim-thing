import { formatSimTime, type PersonalityChange } from "@village/shared";
import { config } from "../config";
import type { StructuredCaller } from "../llm/call-structured";
import { createLogger } from "../logger";
import { runMorningPass } from "../reflection/morning";
import { runNightPass } from "../reflection/night";
import { selectLatestNightReflections } from "../reflection/reflection-memories";
import {
  createReflectionSchedule,
  isMorningPassDue,
  isNightPassDue,
  isWeeklyPassDue,
  recordNightPass,
  recordSleepStart,
  recordWake,
  type ReflectionSchedule,
} from "../reflection/schedule";
import { runWeeklyPass } from "../reflection/weekly";
import {
  buildDailyPlanMoment,
  buildGoalMoments,
  buildNightReflectionMoment,
  buildPersonalityMoments,
  recordMoments,
} from "./moments";
import type { ReflectionHook } from "./reflection-hook";
import { findAgent, listKnownNames, markAgentChanged, replaceAgent } from "./world-access";
import type { TickResult, WorldState } from "./world-state";

const logger = createLogger("reflection");

export interface ReflectionPassDependencies {
  callStructured: StructuredCaller;
  /** Writes one personality change to `personality_history`. */
  recordPersonalityChange: (change: Omit<PersonalityChange, "id">) => void;
}

function getSchedule(state: WorldState, agentId: string): ReflectionSchedule {
  const schedule = state.reflectionSchedules[agentId] ?? createReflectionSchedule();
  state.reflectionSchedules[agentId] = schedule;
  return schedule;
}

function setSchedule(state: WorldState, agentId: string, schedule: ReflectionSchedule): void {
  state.reflectionSchedules[agentId] = schedule;
}

/**
 * Connects the reflection passes to the tick. Sleep callbacks only note what is due; `afterTick`
 * runs the due passes (morning after a long sleep; night on falling asleep or at the forced hour;
 * weekly after every seventh night), all agents in parallel, and the clock waits for them.
 * Pending passes live only within one tick, so nothing extra needs saving.
 */
export function createReflectionHook(dependencies: ReflectionPassDependencies): ReflectionHook {
  const morningDue = new Set<string>();
  const nightDueOnSleep = new Set<string>();

  async function runMorning(state: WorldState, agentId: string, result: TickResult) {
    const agent = await runMorningPass({
      agent: findAgent(state, agentId),
      recentReflections: selectLatestNightReflections(state.memoryStore, agentId),
      callStructured: dependencies.callStructured,
      tick: state.tick,
      timeText: formatSimTime(state.tick, config.clock),
    });
    const before = findAgent(state, agentId);
    replaceAgent(state, { ...before, dailyPlan: agent.dailyPlan, mood: agent.mood });
    markAgentChanged(result, agentId);
    if (agent.dailyPlan !== before.dailyPlan) {
      recordMoments(state, result, [buildDailyPlanMoment(before, state.tick, agent.dailyPlan)]);
    }
  }

  async function runWeekly(state: WorldState, agentId: string, result: TickResult) {
    const weekly = await runWeeklyPass({
      agent: findAgent(state, agentId),
      store: state.memoryStore,
      callStructured: dependencies.callStructured,
      tick: state.tick,
    });
    const current = findAgent(state, agentId);
    replaceAgent(state, {
      ...current,
      personality: weekly.agent.personality,
      goals: weekly.agent.goals,
    });
    for (const change of weekly.changes) dependencies.recordPersonalityChange(change);
    markAgentChanged(result, agentId);
    recordMoments(state, result, [
      ...buildPersonalityMoments(current, weekly.changes),
      ...buildGoalMoments(current, state.tick, current.goals, weekly.agent.goals),
    ]);
  }

  async function runNight(state: WorldState, agentId: string, result: TickResult) {
    const night = await runNightPass({
      agent: findAgent(state, agentId),
      store: state.memoryStore,
      idGenerator: state.memoryIds,
      callStructured: dependencies.callStructured,
      tick: state.tick,
      knownNames: listKnownNames(state),
      otherAgentNames: state.agents
        .filter((other) => other.id !== agentId)
        .map((other) => other.name),
    });
    if (!night.succeeded) logger.warn(`night pass for ${agentId} failed at tick ${state.tick}`);
    const sleeper = findAgent(state, agentId);
    replaceAgent(state, { ...sleeper, mood: night.agent.mood });
    markAgentChanged(result, agentId);
    if (night.reflection) {
      recordMoments(state, result, [
        buildNightReflectionMoment(sleeper, state.tick, night.reflection),
      ]);
    }
    const schedule = recordNightPass(getSchedule(state, agentId), state.tick);
    setSchedule(state, agentId, schedule);
    if (isWeeklyPassDue(schedule)) await runWeekly(state, agentId, result);
  }

  async function runDuePasses(state: WorldState, agentId: string, result: TickResult) {
    if (morningDue.delete(agentId)) await runMorning(state, agentId, result);
    const isStartingSleep = nightDueOnSleep.delete(agentId);
    if (isNightPassDue(getSchedule(state, agentId), state.tick, { isStartingSleep })) {
      await runNight(state, agentId, result);
    }
  }

  return {
    onSleepStarted(state, agentId, tick) {
      setSchedule(state, agentId, recordSleepStart(getSchedule(state, agentId), tick));
      nightDueOnSleep.add(agentId);
    },
    onWoke(state, agentId, tick) {
      const schedule = getSchedule(state, agentId);
      if (isMorningPassDue(schedule, tick)) morningDue.add(agentId);
      setSchedule(state, agentId, recordWake(schedule));
    },
    async afterTick(state, result) {
      await Promise.all(state.agents.map((agent) => runDuePasses(state, agent.id, result)));
    },
  };
}
