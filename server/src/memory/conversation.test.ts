import type { WorldEvent } from "@village/shared";
import { describe, expect, it } from "vitest";
import type { EventPerception, PerceivedEvent } from "../perception/types";
import {
  createConversationLog,
  currentConversation,
  isTakingPart,
  pruneConversationLog,
  recordSpeech,
  type ConversationLog,
} from "./conversation";

const names: Record<string, string> = { mara: "Mara", bob: "Bob", clara: "Clara" };

function hearing(agentId: string, level: EventPerception["hearing"]): EventPerception {
  return { agentId, via: "heard", isInSight: true, hearing: level, direction: null };
}

function speech(
  speakerId: string,
  tick: number,
  words: string,
  perceptions: EventPerception[],
): PerceivedEvent {
  const event: WorldEvent = {
    id: tick,
    tick,
    actorId: speakerId,
    actorName: names[speakerId] ?? speakerId,
    kind: "said",
    targetId: null,
    targetName: null,
    place: "bakery",
    pos: { x: 0, y: 0 },
    description: `said "${words}"`,
    loudness: 8,
    speech: { words, volume: "normal" },
  };
  return { event, perceptions };
}

function buildLog(events: PerceivedEvent[]): ConversationLog {
  return events.reduce(recordSpeech, createConversationLog());
}

describe("isTakingPart", () => {
  it("counts an agent that spoke within the speaker's earshot recently", () => {
    const log = buildLog([speech("mara", 100, "Hello Bob", [hearing("bob", "clear")])]);
    expect(isTakingPart(log, "mara", "bob", 110)).toBe(true);
    expect(isTakingPart(log, "mara", "bob", 111)).toBe(false);
  });

  it("does not count an agent the speaker only heard muffled", () => {
    const log = buildLog([speech("mara", 100, "Hello Bob", [hearing("bob", "muffled")])]);
    expect(isTakingPart(log, "mara", "bob", 101)).toBe(false);
  });

  it("does not count an agent that has only listened", () => {
    const log = buildLog([speech("bob", 100, "Anyone there?", [hearing("mara", "clear")])]);
    expect(isTakingPart(log, "mara", "bob", 101)).toBe(false);
  });
});

describe("currentConversation", () => {
  it("lists lines the agent said or heard clearly, with its own as You", () => {
    const log = buildLog([
      speech("bob", 100, "Morning", [hearing("mara", "clear")]),
      speech("mara", 101, "Morning, Bob", [hearing("bob", "clear")]),
      speech("clara", 102, "Psst", [hearing("mara", "muffled")]),
    ]);
    expect(currentConversation(log, "mara", 105)).toEqual([
      { speakerName: "Bob", words: "Morning", tick: 100 },
      { speakerName: "You", words: "Morning, Bob", tick: 101 },
    ]);
  });

  it("keeps only the last 12 lines within 30 ticks", () => {
    const events = Array.from({ length: 20 }, (_, index) =>
      speech("bob", 100 + index, `line ${index}`, [hearing("mara", "clear")]),
    );
    const lines = currentConversation(buildLog(events), "mara", 125);
    expect(lines).toHaveLength(12);
    expect(lines[0]?.words).toBe("line 8");
    expect(currentConversation(buildLog(events), "mara", 200)).toEqual([]);
  });
});

describe("pruneConversationLog", () => {
  it("drops lines older than the conversation window", () => {
    const log = buildLog([
      speech("bob", 100, "old", [hearing("mara", "clear")]),
      speech("bob", 140, "new", [hearing("mara", "clear")]),
    ]);
    expect(pruneConversationLog(log, 140).lines.map((line) => line.words)).toEqual(["new"]);
  });
});

describe("recordSpeech", () => {
  it("ignores events that are not speech", () => {
    const log = createConversationLog();
    const perceived = speech("bob", 100, "x", []);
    const notSpeech = { ...perceived, event: { ...perceived.event, kind: "arrived" as const } };
    expect(recordSpeech(log, notSpeech)).toBe(log);
  });
});
