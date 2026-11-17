import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { createTestSim, decisionReply, scriptByAgent } from "../../src/sim/test-sim";
import { appendToStream, getAgentMemory } from "../../src/sim/world-access";
import { appendStreamEntry, describeStreamEntry, describeSummary } from "../../src/memory/stream";

const TICKS_PER_DAY = (24 * 60) / config.clock.minutesPerTick;

function said(speakerId: string, words: string) {
  return { text: `${speakerId} said: "${words}"`, speech: { speakerId, words } };
}

describe("appendStreamEntry", () => {
  const merge = config.memory.repeatMerge;

  it("adds events in time order", () => {
    const stream = appendStreamEntry(
      appendStreamEntry([], { text: "I woke up" }, 3),
      { text: "I ate bread" },
      5,
    );
    expect(stream).toEqual([
      { text: "I woke up", tick: 3 },
      { text: "I ate bread", tick: 5 },
    ]);
  });

  it("merges a repeat into one counted entry with a time range", () => {
    const muffled = { text: "I heard muffled sounds from the tavern" };
    let stream = appendStreamEntry([], muffled, 10);
    stream = appendStreamEntry(stream, muffled, 12);
    stream = appendStreamEntry(stream, muffled, 15);
    expect(stream).toEqual([{ ...muffled, tick: 10, count: 3, endTick: 15 }]);
  });

  it("moves a recent repeat with something in between to the end of the stream", () => {
    let stream = appendStreamEntry([], { text: "I swept the floor" }, 1);
    stream = appendStreamEntry(stream, { text: "I ate bread" }, 2);
    stream = appendStreamEntry(stream, { text: "I swept the floor" }, 3);
    expect(stream).toEqual([
      { text: "I ate bread", tick: 2 },
      { text: "I swept the floor", tick: 1, count: 2, endTick: 3 },
    ]);
  });

  it("merges near-same words by the same speaker, keeping the latest words", () => {
    let stream = appendStreamEntry([], said("cobb", "Nastya, pay me what you owe"), 1);
    stream = appendStreamEntry(stream, { text: "I ate bread" }, 2);
    stream = appendStreamEntry(stream, said("cobb", "Nastya, pay me what you owe now"), 3);
    expect(stream.at(-1)).toMatchObject({
      text: 'cobb said: "Nastya, pay me what you owe now"',
      tick: 1,
      count: 2,
      endTick: 3,
    });
  });

  it("keeps apart the same words from someone else, or very different words", () => {
    let stream = appendStreamEntry([], said("cobb", "Pay me what you owe"), 1);
    stream = appendStreamEntry(stream, said("wabi", "Pay me what you owe"), 2);
    stream = appendStreamEntry(stream, said("cobb", "Lovely weather for mining today"), 3);
    expect(stream).toHaveLength(3);
  });

  it("merges nothing older than the window or further back than the lookback", () => {
    const old = appendStreamEntry([], { text: "I heard a bell" }, 0);
    expect(appendStreamEntry(old, { text: "I heard a bell" }, merge.windowTicks + 1)).toHaveLength(
      2,
    );
    let stream = appendStreamEntry([], { text: "I heard a bell" }, 0);
    for (let index = 0; index < merge.lookbackEntries; index += 1) {
      stream = appendStreamEntry(stream, { text: `I saw thing ${index}` }, 1);
    }
    expect(appendStreamEntry(stream, { text: "I heard a bell" }, 2)).toHaveLength(
      merge.lookbackEntries + 2,
    );
  });

  it("merges nothing into an entry already sent to a summarizer", () => {
    const stream = appendStreamEntry([], { text: "I heard a bell" }, 0);
    expect(appendStreamEntry(stream, { text: "I heard a bell" }, 1, 1)).toHaveLength(2);
  });

  it("cuts an entry to the length limit, ending it with an ellipsis", () => {
    const [entry] = appendStreamEntry([], { text: "bread ".repeat(80) }, 1);
    expect(entry?.text).toHaveLength(config.memory.streamEntryMaxChars);
    expect(entry?.text.endsWith("…")).toBe(true);
  });
});

describe("describeStreamEntry", () => {
  it("stamps an entry with its absolute time", () => {
    expect(describeStreamEntry({ text: "I woke up", tick: 32 })).toBe("[Day 1, 6:32 am] I woke up");
  });

  it("shows the count of merged speech before the words", () => {
    const entry = { ...said("Cobb", "Pay me"), tick: 0, count: 4, endTick: 30 };
    expect(describeStreamEntry(entry)).toBe('[Day 1, 6:00 am to 6:30 am] Cobb said (×4): "Pay me"');
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
