import type { AgentMemory, StreamEntry, Summary } from "@village/shared";
import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import {
  applySummary,
  beginMidnight,
  canApplySummary,
  createAgentMemory,
  findDueSummary,
  settleMidnight,
} from "../../src/memory/summaries";

const { streamMax, streamKeep, episodesMax, episodesKeep } = config.memory;

function makeEntries(count: number, firstTick = 0): StreamEntry[] {
  return Array.from({ length: count }, (_unused, index) => ({
    text: `event ${firstTick + index}`,
    tick: firstTick + index,
  }));
}

function makeSummaries(level: Summary["level"], count: number): Summary[] {
  return Array.from({ length: count }, (_unused, index) => ({
    level,
    startTick: index * 100,
    endTick: index * 100 + 99,
    text: `${level} ${index}`,
  }));
}

function makeMemory(overrides: Partial<AgentMemory> = {}): AgentMemory {
  return { ...createAgentMemory(1), ...overrides };
}

/** Runs every due summary until none is left, as the sim does, and lists the levels in order. */
function runAll(start: AgentMemory): { memory: AgentMemory; levels: string[] } {
  let memory = settleMidnight(start);
  const levels: string[] = [];
  for (let job = findDueSummary(memory); job !== null; job = findDueSummary(memory)) {
    levels.push(job.level);
    memory = settleMidnight(applySummary(memory, job, `${job.level} written`));
  }
  return { memory, levels };
}

describe("stream to episode", () => {
  it("owes nothing while the stream is under its limit", () => {
    expect(findDueSummary(makeMemory({ stream: makeEntries(streamMax - 1) }))).toBeNull();
  });

  it("sends every entry but the newest few, with the last episode as context", () => {
    const episodes = makeSummaries("episode", 2);
    const job = findDueSummary(makeMemory({ stream: makeEntries(streamMax), episodes }));
    if (job?.level !== "episode") throw new Error("an episode should be due");
    expect(job.entries).toHaveLength(streamMax - streamKeep);
    expect(job.earlier).toEqual(episodes.slice(-config.memory.earlierEpisodesShown));
  });

  it("replaces exactly the entries sent, stamped with their first and last tick", () => {
    const memory = makeMemory({
      stream: [...makeEntries(streamMax - 1), { text: "last", tick: 70, count: 2, endTick: 75 }],
    });
    const job = findDueSummary(memory);
    if (job === null) throw new Error("an episode should be due");
    const arrivedMeanwhile = { text: "arrived while the summary ran", tick: 80 };
    const after = applySummary(
      { ...memory, stream: [...memory.stream, arrivedMeanwhile] },
      job,
      "I did things.",
    );
    expect(after.stream).toHaveLength(streamKeep + 1);
    expect(after.stream.at(-1)).toEqual(arrivedMeanwhile);
    expect(after.episodes).toEqual([
      {
        level: "episode",
        startTick: 0,
        endTick: streamMax - streamKeep - 1,
        text: "I did things.",
      },
    ]);
  });
});

describe("episodes to chronicle", () => {
  it("sends every episode but the newest when the limit is reached", () => {
    const episodes = makeSummaries("episode", episodesMax);
    const job = findDueSummary(makeMemory({ episodes }));
    if (job?.level !== "chronicle") throw new Error("a chronicle should be due");
    expect(job.episodes).toEqual(episodes.slice(0, episodesMax - episodesKeep));
    const after = applySummary(makeMemory({ episodes }), job, "A long morning.");
    expect(after.episodes).toEqual(episodes.slice(-episodesKeep));
    expect(after.chronicles).toEqual([
      {
        level: "chronicle",
        startTick: 0,
        endTick: (episodesMax - episodesKeep) * 100 - 1,
        text: "A long morning.",
      },
    ]);
  });

  it("puts the episode before the chronicle when both are due", () => {
    const memory = makeMemory({
      stream: makeEntries(streamMax),
      episodes: makeSummaries("episode", episodesMax),
    });
    expect(findDueSummary(memory)?.level).toBe("episode");
  });
});

describe("midnight", () => {
  it("begins once when the day number goes up", () => {
    const memory = makeMemory();
    expect(beginMidnight(memory, 1).midnight).toBeNull();
    const begun = beginMidnight(memory, 2);
    expect(begun.midnight).toMatchObject({ day: 2, step: "episode" });
    expect(beginMidnight(begun, 3)).toBe(begun);
  });

  it("runs each step once in order, whatever the stream's length and episode count", () => {
    const start = beginMidnight(
      makeMemory({
        stream: makeEntries(streamKeep + 3),
        episodes: makeSummaries("episode", 2),
        chronicles: makeSummaries("chronicle", 1),
        daySummary: { level: "daySummary", startTick: 0, endTick: 9, text: "The day before." },
      }),
      2,
    );
    const { memory, levels } = runAll(start);
    expect(levels).toEqual(["episode", "chronicle", "daySummary", "history"]);
    expect(memory.stream).toHaveLength(streamKeep);
    expect(memory.episodes).toHaveLength(episodesKeep);
    expect(memory.chronicles).toEqual([]);
    expect(memory.daySummary?.text).toBe("daySummary written");
    expect(memory.history?.text).toBe("history written");
    expect(memory.midnight).toBeNull();
    expect(memory.lastMidnightDay).toBe(2);
  });

  it("keeps the chronicles and the old day summary in view until the last step is done", () => {
    let memory = settleMidnight(
      beginMidnight(
        makeMemory({
          chronicles: makeSummaries("chronicle", 2),
          daySummary: { level: "daySummary", startTick: 0, endTick: 9, text: "The day before." },
        }),
        2,
      ),
    );
    const dayJob = findDueSummary(memory);
    if (dayJob?.level !== "daySummary") throw new Error("the day summary should be due");
    memory = settleMidnight(applySummary(memory, dayJob, "Today."));
    expect(memory.chronicles).toHaveLength(2);
    expect(memory.daySummary?.text).toBe("The day before.");
    expect(findDueSummary(memory)?.level).toBe("history");
  });

  it("refuses a day summary that comes back after the midnight steps are over", () => {
    const memory = settleMidnight(
      beginMidnight(makeMemory({ chronicles: makeSummaries("chronicle", 2) }), 2),
    );
    const dayJob = findDueSummary(memory);
    if (dayJob?.level !== "daySummary") throw new Error("the day summary should be due");
    expect(canApplySummary(memory, dayJob)).toBe(true);
    expect(canApplySummary({ ...memory, midnight: null }, dayJob)).toBe(false);
  });

  it("skips the history on the first midnight, when no day summary is outgoing", () => {
    const start = beginMidnight(makeMemory({ chronicles: makeSummaries("chronicle", 2) }), 2);
    const { memory, levels } = runAll(start);
    expect(levels).toEqual(["daySummary"]);
    expect(memory.history).toBeNull();
    expect(memory.daySummary?.text).toBe("daySummary written");
    expect(memory.daySummary).toMatchObject({ startTick: 0, endTick: 199 });
  });

  it("makes no day summary for a day with no chronicles, and still moves the old one to history", () => {
    const start = beginMidnight(
      makeMemory({
        daySummary: { level: "daySummary", startTick: 0, endTick: 9, text: "The day before." },
        history: { level: "history", startTick: -50, endTick: -1, text: "Long ago." },
      }),
      2,
    );
    const { memory, levels } = runAll(start);
    expect(levels).toEqual(["history"]);
    expect(memory.daySummary).toBeNull();
    expect(memory.history).toEqual({
      level: "history",
      startTick: -50,
      endTick: 9,
      text: "history written",
    });
  });

  it("finishes at once when there is nothing at all to summarize", () => {
    const settled = settleMidnight(beginMidnight(makeMemory({ stream: makeEntries(2) }), 2));
    expect(settled.midnight).toBeNull();
    expect(settled.lastMidnightDay).toBe(2);
    expect(findDueSummary(settled)).toBeNull();
  });

  it("removes only the chronicles the day summary was made from", () => {
    let memory = settleMidnight(
      beginMidnight(makeMemory({ chronicles: makeSummaries("chronicle", 2) }), 2),
    );
    const dayJob = findDueSummary(memory);
    if (dayJob === null) throw new Error("the day summary should be due");
    const formedMeanwhile: Summary = {
      level: "chronicle",
      startTick: 500,
      endTick: 600,
      text: "after midnight",
    };
    memory = { ...memory, chronicles: [...memory.chronicles, formedMeanwhile] };
    memory = settleMidnight(applySummary(memory, dayJob, "Today."));
    expect(memory.chronicles).toEqual([formedMeanwhile]);
  });
});
