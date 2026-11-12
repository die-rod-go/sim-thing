import { formatSimTime, readAgentHealth, type PersonalityChange } from "@village/shared";
import { config } from "../config";
import { listBodyWords } from "../status/conditions";
import type { StructuredCaller } from "../llm/call-structured";
import { createLogger } from "../logger";
import {
  applyDaytimeReply,
  requestDaytimeReply,
  type DaytimePassInput,
} from "../reflection/daytime";
import {
  applyMorningReply,
  requestMorningReply,
  type MorningPassInput,
} from "../reflection/morning";
import { applyNightReply, requestNightReply, type NightPassInput } from "../reflection/night";
import { selectLatestNightReflections } from "../reflection/reflection-memories";
import {
  createReflectionSchedule,
  findDaytimeWindowStart,
  isDaytimePassDue,
  isMorningPassDue,
  isNightPassDue,
  isWeeklyPassDue,
  recordDaytimePass,
  recordNightPass,
  recordSleepStart,
  recordWake,
  type ReflectionSchedule,
} from "../reflection/schedule";
import { applyWeeklyReply, requestWeeklyReply, type WeeklyPassInput } from "../reflection/weekly";
import { BackgroundWork } from "./background-work";
import {
  buildDailyPlanMoment,
  buildGoalMoments,
  buildNightReflectionMoment,
  buildPersonalityMoments,
  recordMoments,
} from "./moments";
import type { ReflectionHook } from "./reflection-hook";
import {
  findAgent,
  listKnownNames,
  listLivingAgents,
  markAgentChanged,
  rememberBriefly,
  replaceAgent,
} from "./world-access";
import type { TickResult, WorldState } from "./world-state";

const logger = createLogger("reflection");

export interface ReflectionPassDependencies {
  callStructured: StructuredCaller;
  /** Writes one personality change to `personality_history`. */
  recordPersonalityChange: (change: Omit<PersonalityChange, "id">) => void;
  /** Lets the clock run on while passes wait for the LLM; each lands on the first tick after it returns. */
  shouldRunInBackground?: boolean;
}

/** A pass whose reply has come back, ready to apply on the tick. */
interface FinishedPass {
  agentId: string;
  apply: (result: TickResult) => void;
}

function getSchedule(state: WorldState, agentId: string): ReflectionSchedule {
  const schedule = state.reflectionSchedules[agentId] ?? createReflectionSchedule();
  state.reflectionSchedules[agentId] = schedule;
  return schedule;
}

function setSchedule(state: WorldState, agentId: string, schedule: ReflectionSchedule): void {
  state.reflectionSchedules[agentId] = schedule;
}

function describeOwnConditions(state: WorldState, agentId: string): string[] {
  return listBodyWords(state.items, findAgent(state, agentId), false);
}

function readOwnHealth(state: WorldState, agentId: string): number {
  return readAgentHealth(state.items, findAgent(state, agentId));
}

function isLiving(state: WorldState, agentId: string): boolean {
  return listLivingAgents(state).some((agent) => agent.id === agentId);
}

/**
 * Connects the reflection passes to the tick. Sleep callbacks only note what is due; `afterTick`
 * starts the due passes (morning after a long sleep; night on falling asleep or at the forced hour;
 * weekly after every seventh night; daytime every few awake hours), one at a time per agent and all
 * agents in parallel. Each pass's LLM call runs on its own, but what it changes is applied on a
 * tick: the same tick when the tick waits, else the first tick after the reply arrives. A pass's
 * memories, schedule entry and personality changes carry the tick it started on.
 * Passes in flight are not saved with the world: after a restart an unfinished night or daytime
 * pass is due again, and an unfinished morning pass is skipped.
 */
export function createReflectionHook(dependencies: ReflectionPassDependencies): ReflectionHook {
  const { callStructured } = dependencies;
  const morningDue = new Set<string>();
  const nightDueOnSleep = new Set<string>();
  const work = new BackgroundWork<FinishedPass>("reflection pass");

  function buildMorningInput(state: WorldState, agentId: string): MorningPassInput {
    return {
      agent: findAgent(state, agentId),
      health: readOwnHealth(state, agentId),
      conditionWords: describeOwnConditions(state, agentId),
      recentReflections: selectLatestNightReflections(state.memoryStore, agentId),
      callStructured,
      tick: state.tick,
      timeText: formatSimTime(state.tick, config.clock),
    };
  }

  function buildWeeklyInput(state: WorldState, agentId: string): WeeklyPassInput {
    return {
      agent: findAgent(state, agentId),
      health: readOwnHealth(state, agentId),
      conditionWords: describeOwnConditions(state, agentId),
      store: state.memoryStore,
      callStructured,
      tick: state.tick,
    };
  }

  function buildNightInput(state: WorldState, agentId: string, tick: number): NightPassInput {
    return {
      agent: findAgent(state, agentId),
      health: readOwnHealth(state, agentId),
      conditionWords: describeOwnConditions(state, agentId),
      store: state.memoryStore,
      idGenerator: state.memoryIds,
      callStructured,
      tick,
      knownNames: listKnownNames(state),
      otherAgentNames: state.agents
        .filter((other) => other.id !== agentId)
        .map((other) => other.name),
    };
  }

  function buildDaytimeInput(
    state: WorldState,
    agentId: string,
    tick: number,
    sinceTick: number,
  ): DaytimePassInput {
    return {
      agent: findAgent(state, agentId),
      health: readOwnHealth(state, agentId),
      conditionWords: describeOwnConditions(state, agentId),
      store: state.memoryStore,
      idGenerator: state.memoryIds,
      callStructured,
      tick,
      sinceTick,
      knownNames: listKnownNames(state),
    };
  }

  async function runMorning(state: WorldState, agentId: string): Promise<FinishedPass> {
    const reply = await requestMorningReply(buildMorningInput(state, agentId));
    return {
      agentId,
      apply(result) {
        const before = findAgent(state, agentId);
        const agent = applyMorningReply(before, reply);
        replaceAgent(state, { ...before, dailyPlan: agent.dailyPlan, mood: agent.mood });
        markAgentChanged(result, agentId);
        if (agent.dailyPlan !== before.dailyPlan) {
          recordMoments(state, result, [buildDailyPlanMoment(before, state.tick, agent.dailyPlan)]);
        }
      },
    };
  }

  async function runWeekly(state: WorldState, agentId: string): Promise<FinishedPass> {
    const startTick = state.tick;
    const reply = await requestWeeklyReply(buildWeeklyInput(state, agentId));
    return {
      agentId,
      apply(result) {
        const current = findAgent(state, agentId);
        const weekly = applyWeeklyReply(current, startTick, reply);
        replaceAgent(state, {
          ...current,
          profession: weekly.agent.profession,
          personality: weekly.agent.personality,
          goals: weekly.agent.goals,
        });
        for (const change of weekly.changes) dependencies.recordPersonalityChange(change);
        markAgentChanged(result, agentId);
        recordMoments(state, result, [
          ...buildPersonalityMoments(current, weekly.changes),
          ...buildGoalMoments(current, state.tick, current.goals, weekly.agent.goals),
        ]);
      },
    };
  }

  async function runNight(state: WorldState, agentId: string): Promise<FinishedPass> {
    const startTick = state.tick;
    const reply = await requestNightReply(buildNightInput(state, agentId, startTick));
    return {
      agentId,
      apply(result) {
        const night = applyNightReply(buildNightInput(state, agentId, startTick), reply);
        if (!night.succeeded) logger.warn(`night pass for ${agentId} failed at tick ${startTick}`);
        const sleeper = findAgent(state, agentId);
        replaceAgent(state, { ...sleeper, mood: night.agent.mood });
        markAgentChanged(result, agentId);
        if (night.reflection) {
          recordMoments(state, result, [
            buildNightReflectionMoment(sleeper, state.tick, night.reflection),
          ]);
        }
        const schedule = recordNightPass(getSchedule(state, agentId), startTick);
        setSchedule(state, agentId, schedule);
        if (isWeeklyPassDue(schedule)) work.start(state, agentId, () => runWeekly(state, agentId));
      },
    };
  }

  async function runDaytime(state: WorldState, agentId: string): Promise<FinishedPass> {
    const startTick = state.tick;
    const sinceTick = findDaytimeWindowStart(getSchedule(state, agentId));
    const reply = await requestDaytimeReply(
      buildDaytimeInput(state, agentId, startTick, sinceTick),
    );
    return {
      agentId,
      apply(result) {
        const daytime = applyDaytimeReply(
          buildDaytimeInput(state, agentId, startTick, sinceTick),
          reply,
        );
        setSchedule(state, agentId, recordDaytimePass(getSchedule(state, agentId), startTick));
        const current = findAgent(state, agentId);
        if (daytime.agent.mood === current.mood && daytime.insights.length === 0) return;
        replaceAgent(state, { ...current, mood: daytime.agent.mood });
        for (const insight of daytime.insights) {
          rememberBriefly(state, agentId, `I thought: ${insight}`);
        }
        markAgentChanged(result, agentId);
      },
    };
  }

  /** The first pass due for the agent, in the order morning, night, daytime; null when none is. */
  function chooseDuePass(state: WorldState, agentId: string): (() => Promise<FinishedPass>) | null {
    if (morningDue.delete(agentId)) return () => runMorning(state, agentId);
    const isStartingSleep = nightDueOnSleep.delete(agentId);
    if (isNightPassDue(getSchedule(state, agentId), state.tick, { isStartingSleep })) {
      return () => runNight(state, agentId);
    }
    if (isDaytimePassDue(getSchedule(state, agentId), state.tick)) {
      return () => runDaytime(state, agentId);
    }
    return null;
  }

  function startDuePasses(state: WorldState): void {
    for (const agent of listLivingAgents(state)) {
      if (work.isRunning(state, agent.id)) continue;
      const run = chooseDuePass(state, agent.id);
      if (run) work.start(state, agent.id, run);
    }
  }

  /** Passes of agents who died while waiting for the reply are dropped. */
  function applyFinishedPasses(state: WorldState, result: TickResult): void {
    for (const pass of work.collectFinished(state)) {
      if (isLiving(state, pass.agentId)) pass.apply(result);
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
      setSchedule(state, agentId, recordWake(schedule, tick));
    },
    async afterTick(state, result) {
      applyFinishedPasses(state, result);
      startDuePasses(state);
      if (dependencies.shouldRunInBackground) return;
      while (work.hasAnyInFlight(state)) {
        await work.waitForAll(state);
        applyFinishedPasses(state, result);
        startDuePasses(state);
      }
    },
  };
}
