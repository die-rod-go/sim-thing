import type {
  AgentMemory,
  MidnightProgress,
  StreamEntry,
  Summary,
  SummaryLevel,
} from "@village/shared";
import { config } from "../config";

/** One summary to write: what goes in, and for the first two levels what is shown as context. */
export type SummaryJob =
  | { level: "episode"; entries: StreamEntry[]; earlier: Summary[] }
  | { level: "chronicle"; episodes: Summary[]; earlier: Summary[] }
  | { level: "daySummary"; chronicles: Summary[] }
  | { level: "history"; daySummary: Summary; history: Summary | null };

export function createAgentMemory(day: number): AgentMemory {
  return {
    stream: [],
    episodes: [],
    chronicles: [],
    daySummary: null,
    history: null,
    lastMidnightDay: day,
    midnight: null,
    retryAtTick: null,
  };
}

/** Starts the midnight steps when the day number has gone up since they last ran. */
export function beginMidnight(memory: AgentMemory, day: number): AgentMemory {
  if (memory.midnight !== null || day <= memory.lastMidnightDay) return memory;
  const midnight: MidnightProgress = {
    day,
    step: "episode",
    newDaySummary: null,
    chroniclesSummarized: 0,
  };
  return { ...memory, midnight };
}

/** The new day summary replaces the old one, and the chronicles it was made from are gone. */
function finishMidnight(memory: AgentMemory, midnight: MidnightProgress): AgentMemory {
  return {
    ...memory,
    daySummary: midnight.newDaySummary,
    chronicles: memory.chronicles.slice(midnight.chroniclesSummarized),
    lastMidnightDay: midnight.day,
    midnight: null,
  };
}

/** Moves past every midnight step that has nothing to summarize, finishing when none is left. */
export function settleMidnight(memory: AgentMemory): AgentMemory {
  const { midnight } = memory;
  if (midnight === null) return memory;
  if (midnight.step === "episode" && memory.stream.length <= config.memory.streamKeep) {
    return settleMidnight({ ...memory, midnight: { ...midnight, step: "chronicle" } });
  }
  if (midnight.step === "chronicle" && memory.episodes.length <= config.memory.episodesKeep) {
    return settleMidnight({ ...memory, midnight: { ...midnight, step: "daySummary" } });
  }
  if (midnight.step === "daySummary" && memory.chronicles.length === 0) {
    return settleMidnight({ ...memory, midnight: { ...midnight, step: "history" } });
  }
  // With no outgoing day summary there is nothing to add to the history.
  if (midnight.step === "history" && memory.daySummary === null) {
    return finishMidnight(memory, midnight);
  }
  return memory;
}

function buildEpisodeJob(memory: AgentMemory): SummaryJob {
  const sentCount = memory.stream.length - config.memory.streamKeep;
  return {
    level: "episode",
    entries: memory.stream.slice(0, sentCount),
    earlier: memory.episodes.slice(-config.memory.earlierEpisodesShown),
  };
}

function buildChronicleJob(memory: AgentMemory): SummaryJob {
  const sentCount = memory.episodes.length - config.memory.episodesKeep;
  return {
    level: "chronicle",
    episodes: memory.episodes.slice(0, sentCount),
    earlier: memory.chronicles.slice(-config.memory.earlierChroniclesShown),
  };
}

/**
 * The next summary the agent owes, memory compression first: episode, chronicle, then at midnight
 * the day summary and the history. Null when nothing is due. Expects a settled memory.
 */
export function findDueSummary(memory: AgentMemory): SummaryJob | null {
  const step = memory.midnight?.step ?? null;
  const hasStreamToSummarize = memory.stream.length > config.memory.streamKeep;
  if (
    hasStreamToSummarize &&
    (memory.stream.length >= config.memory.streamMax || step === "episode")
  ) {
    return buildEpisodeJob(memory);
  }
  const hasEpisodesToSummarize = memory.episodes.length > config.memory.episodesKeep;
  if (
    hasEpisodesToSummarize &&
    (memory.episodes.length >= config.memory.episodesMax || step === "chronicle")
  ) {
    return buildChronicleJob(memory);
  }
  if (step === "daySummary" && memory.chronicles.length > 0) {
    return { level: "daySummary", chronicles: [...memory.chronicles] };
  }
  if (step === "history" && memory.daySummary !== null) {
    return { level: "history", daySummary: memory.daySummary, history: memory.history };
  }
  return null;
}

function lastTickOf(entry: StreamEntry): number {
  return entry.endTick ?? entry.tick;
}

function spanOf(job: SummaryJob): { startTick: number; endTick: number } {
  if (job.level === "episode") {
    const last = job.entries[job.entries.length - 1];
    return { startTick: job.entries[0]?.tick ?? 0, endTick: last ? lastTickOf(last) : 0 };
  }
  if (job.level === "history") {
    return {
      startTick: job.history?.startTick ?? job.daySummary.startTick,
      endTick: job.daySummary.endTick,
    };
  }
  const summaries = job.level === "chronicle" ? job.episodes : job.chronicles;
  return {
    startTick: summaries[0]?.startTick ?? 0,
    endTick: summaries[summaries.length - 1]?.endTick ?? 0,
  };
}

function advanceMidnightPast(memory: AgentMemory, level: SummaryLevel): AgentMemory {
  const { midnight } = memory;
  if (midnight === null || midnight.step !== level) return memory;
  const nextStep = level === "episode" ? "chronicle" : "daySummary";
  return { ...memory, midnight: { ...midnight, step: nextStep } };
}

/**
 * The memory once a summary has come back: exactly the inputs that were sent are removed and the
 * summary takes their place. Anything that arrived while the job ran is kept.
 */
export function applySummary(memory: AgentMemory, job: SummaryJob, text: string): AgentMemory {
  const summary: Summary = { level: job.level, ...spanOf(job), text };
  if (job.level === "episode") {
    return advanceMidnightPast(
      {
        ...memory,
        stream: memory.stream.slice(job.entries.length),
        episodes: [...memory.episodes, summary],
      },
      "episode",
    );
  }
  if (job.level === "chronicle") {
    return advanceMidnightPast(
      {
        ...memory,
        episodes: memory.episodes.slice(job.episodes.length),
        chronicles: [...memory.chronicles, summary],
      },
      "chronicle",
    );
  }
  const { midnight } = memory;
  if (midnight === null) return memory;
  if (job.level === "daySummary") {
    return {
      ...memory,
      midnight: {
        ...midnight,
        step: "history",
        newDaySummary: summary,
        chroniclesSummarized: job.chronicles.length,
      },
    };
  }
  return finishMidnight({ ...memory, history: summary }, midnight);
}
