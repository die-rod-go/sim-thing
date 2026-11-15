import { describe, expect, it } from "vitest";
import { config } from "../config";
import { createTestSim, decisionReply, scriptByAgent } from "../sim/test-sim";
import { appendToStream, getAgentMemory } from "../sim/world-access";
import { appendStreamEntry, describeStreamEntry, describeSummary } from "./stream";

const TICKS_PER_DAY = (24 * 60) / config.clock.minutesPerTick;

describe("appendStreamEntry", () => {
  it("adds events in time order", () => {
    const stream = appendStreamEntry(appendStreamEntry([], "I woke up", 3), "I ate bread", 5);
    expect(stream).toEqual([
      { text: "I woke up", tick: 3 },
      { text: "I ate bread", tick: 5 },
    ]);
  });

  it("merges a repeat of the entry just before it into one counted entry with a time range", () => {
    let stream = appendStreamEntry([], "I heard muffled sounds from the tavern", 10);
    stream = appendStreamEntry(stream, "I heard muffled sounds from the tavern", 12);
    stream = appendStreamEntry(stream, "I heard muffled sounds from the tavern", 15);
    expect(stream).toEqual([
      { text: "I heard muffled sounds from the tavern", tick: 10, count: 3, endTick: 15 },
    ]);
  });

  it("does not merge a repeat with something else in between", () => {
    let stream = appendStreamEntry([], "I swept the floor", 1);
    stream = appendStreamEntry(stream, "I ate bread", 2);
    stream = appendStreamEntry(stream, "I swept the floor", 3);
    expect(stream).toHaveLength(3);
  });

  it("cuts an entry to the length limit, ending it with an ellipsis", () => {
    const [entry] = appendStreamEntry([], "bread ".repeat(80), 1);
    expect(entry?.text).toHaveLength(config.memory.streamEntryMaxChars);
    expect(entry?.text.endsWith("…")).toBe(true);
  });
});

describe("describeStreamEntry", () => {
  it("stamps an entry with its absolute time", () => {
    expect(describeStreamEntry({ text: "I woke up", tick: 32 })).toBe("[Day 1, 6:32 am] I woke up");
  });

  it("shows a merged repeat's span and count, naming the day again only when it changed", () => {
    const sameDay = { text: "I heard sounds", tick: 0, count: 3, endTick: 30 };
    expect(describeStreamEntry(sameDay)).toBe("[Day 1, 6:00 am to 6:30 am] I heard sounds (×3)");
    const overnight = { ...sameDay, endTick: TICKS_PER_DAY };
    expect(describeStreamEntry(overnight)).toBe(
      "[Day 1, 6:00 am to Day 2, 6:00 am] I heard sounds (×3)",
    );
  });
});

describe("describeSummary", () => {
  it("gives a summary the absolute span it covers", () => {
    const summary = { level: "episode" as const, startTick: 0, endTick: 194, text: "I baked." };
    expect(describeSummary(summary)).toBe("[Day 1, 6:00 am to 9:14 am] I baked.");
  });
});

describe("an agent's stream in the sim", () => {
  it("holds what the agent did and what others saw of it, and reaches the next prompt", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0 ? decisionReply({ action: "wait", say: "Morning, Ilsa" }) : undefined,
      }),
    });
    sim.placeAgent("mara", { x: 19, y: 15 });
    sim.placeAgent("ilsa", { x: 20, y: 15 });
    await sim.advance();
    expect(sim.streamTexts("mara")).toContain('I said: "Morning, Ilsa"');
    expect(sim.streamTexts("ilsa")).toContain('I overheard Mara say: "Morning, Ilsa"');
    await sim.advance(config.perception.interruptCooldownTicks + 1);
    const ilsaPrompts = sim.records.filter((record) => record.agentId === "ilsa");
    expect(ilsaPrompts.at(-1)?.prompt).toContain(
      '- [Day 1, 6:00 am] I overheard Mara say: "Morning, Ilsa"',
    );
  });

  it("does not merge into an entry a running summary was sent", () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
    appendToStream(sim.state, "mara", "I heard sounds");
    sim.state.streamEntriesInSummary.mara = 1;
    appendToStream(sim.state, "mara", "I heard sounds");
    expect(getAgentMemory(sim.state, "mara").stream).toHaveLength(2);
  });
});
