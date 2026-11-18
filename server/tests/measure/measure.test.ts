import { describe, expect, it } from "vitest";
import { estimateDollars, findPrice } from "../../src/measure/costs";
import { measureDeathNotice } from "../../src/measure/deaths";
import { NO_REASON, summarizeReasons } from "../../src/measure/decisions";
import { buildNameGrouper } from "../../src/measure/grouping";
import { readDecisionOutcome, readDecisionPrompt } from "../../src/measure/prompt-reading";
import { readReminderItem, summarizeAgendaDays } from "../../src/measure/agenda-measures";
import type { CallRecord, DecisionRecord, SaveRecords } from "../../src/measure/records";
import {
  measureConversations,
  measureNearRepeats,
  measurePassedOn,
} from "../../src/measure/speech";

const PROMPT = [
  "Decide what you do next, in character.",
  "## Just now",
  "- [Day 1, 6:10 am] I baked bread at the oven",
  '- [Day 1, 6:12 am to 6:20 am] I said: "Bread!" (×3)',
  '- [Day 1, 6:21 am] I overheard Tom say: "Cobb owes me ten coins"',
  "## Now",
  "Just now: Tom came into view.",
  "You are in the middle of: baking bread at the oven.",
].join("\n");

function buildRecords(overrides: Partial<SaveRecords>): SaveRecords {
  return {
    agentNames: { mara: "Mara", tom: "Tom", cobb: "Cobb" },
    lastTick: 600,
    calls: [],
    decisions: [],
    streamLines: [],
    speech: [],
    failures: [],
    deaths: [],
    ...overrides,
  };
}

function buildDecision(overrides: Partial<DecisionRecord>): DecisionRecord {
  return {
    agentId: "mara",
    tick: 0,
    reason: null,
    isMidAction: false,
    outcome: "wait",
    sectionChars: {},
    totalChars: 0,
    today: [],
    done: [],
    dropped: [],
    ...overrides,
  };
}

function buildCall(overrides: Partial<CallRecord>): CallRecord {
  return {
    agentId: "mara",
    tick: 0,
    kind: "decision",
    model: "claude-haiku-5-5",
    promptTokens: 0,
    completionTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    ...overrides,
  };
}

describe("reading a decision prompt", () => {
  it("reads the reason, whether the agent was busy, and the stream with its repeats", () => {
    const facts = readDecisionPrompt(PROMPT);
    expect(facts.reason).toBe("Tom came into view");
    expect(facts.isMidAction).toBe(true);
    expect(facts.streamLines).toEqual([
      { tick: 10, text: "I baked bread at the oven", count: 1 },
      { tick: 12, text: 'I said: "Bread!"', count: 3 },
      { tick: 21, text: 'I overheard Tom say: "Cobb owes me ten coins"', count: 1 },
    ]);
    expect(Object.keys(facts.sectionChars)).toEqual(["(top)", "Just now", "Now"]);
  });

  it("reads the act a reply settled on", () => {
    expect(readDecisionOutcome({ acts: [{ action: "walk_to" }, { action: "wait" }] })).toBe(
      "walk_to",
    );
    expect(readDecisionOutcome(null)).toBe("unreadable");
  });
});

describe("estimating spend", () => {
  it("prices a model however its provider spells it", () => {
    expect(findPrice("anthropic/claude-haiku-5.5")?.model).toBe("haiku-5-5");
    expect(findPrice("some-other-model")).toBeNull();
  });

  it("bills cache reads and writes at their own prices", () => {
    const call = buildCall({
      promptTokens: 3_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      completionTokens: 1_000_000,
    });
    expect(estimateDollars(call)).toBeCloseTo(0.1 + 0.01 + 0.125 + 0.5);
  });
});

describe("grouping reasons", () => {
  it("groups reasons that differ only by who and how many", () => {
    const group = buildNameGrouper(["Tom", "Tomas"]);
    expect(group("Tomas is offering me 3 coins")).toBe("{name} is offering me # coins");
    const records = buildRecords({
      decisions: [null, "Tom came into view", "Cobb came into view"].map((reason, index) =>
        buildDecision({ tick: index, reason }),
      ),
    });
    expect(summarizeReasons(records).map((row) => [row.reason, row.count])).toEqual([
      ["{name} came into view", 2],
      [NO_REASON, 1],
    ]);
  });
});

describe("measuring talk", () => {
  const speech = [
    { speakerId: "mara", tick: 0, place: "square", words: "Pay me what you owe, Tom" },
    { speakerId: "tom", tick: 2, place: "square", words: "Tomorrow, Mara" },
    { speakerId: "mara", tick: 4, place: "square", words: "Pay me what you owe now, Tom" },
    { speakerId: "tom", tick: 40, place: "square", words: "Cobb owes me ten coins too" },
  ];

  it("counts a line that nearly repeats one of the speaker's own", () => {
    expect(measureNearRepeats(speech)).toEqual({ lines: 4, nearRepeats: 1, rate: 0.25 });
  });

  it("splits talk at one place into conversations at a long silence", () => {
    expect(measureConversations(speech)).toMatchObject({ count: 1, longestLines: 3 });
  });

  it("counts an overheard line the hearer later says again in its own words", () => {
    const streamLines = [
      { agentId: "mara", tick: 1, text: 'I overheard Tom say: "Cobb owes me ten coins"', count: 1 },
    ];
    const retold = [
      { speakerId: "mara", tick: 9, place: "bakery", words: "Cobb owes Tom ten coins, I hear" },
    ];
    expect(measurePassedOn(streamLines, retold)).toEqual({ overheard: 1, passedOn: 1 });
  });
});

describe("measuring Today", () => {
  const bake = { number: 1, text: "Bake bread" };
  const dice = { number: 2, text: "Dice at the tavern" };

  it("counts items finished and dropped, and those left open at the day's end", () => {
    const records = buildRecords({
      decisions: [
        buildDecision({ tick: 10, today: [bake, dice], done: [1] }),
        buildDecision({ tick: 20, today: [dice] }),
      ],
    });
    expect(summarizeAgendaDays(records)).toEqual([
      expect.objectContaining({ day: 1, finished: 1, dropped: 0, leftStanding: 1 }),
    ]);
  });

  it("counts a reminder kept when its item is marked done within the hour", () => {
    const reason = "it is 7:00 pm: Dice at the tavern";
    expect(readReminderItem(reason)).toBe("Dice at the tavern");
    const records = buildRecords({
      decisions: [
        buildDecision({ tick: 100, reason, today: [dice] }),
        buildDecision({ tick: 130, today: [dice], done: [2] }),
      ],
    });
    expect(summarizeAgendaDays(records)).toEqual([
      expect.objectContaining({ reminders: 1, remindersKept: 1 }),
    ]);
  });
});

describe("noticing deaths", () => {
  it("finds who first saw the body and when someone else first named the dead", () => {
    const records = buildRecords({
      deaths: [{ agentId: "cobb", tick: 100 }],
      streamLines: [
        { agentId: "mara", tick: 160, text: "I found Cobb's body in the quarry", count: 1 },
      ],
      speech: [
        { speakerId: "mara", tick: 161, place: "quarry", words: "Cobb! No..." },
        { speakerId: "tom", tick: 220, place: "tavern", words: "Has anyone seen Cobb?" },
      ],
    });
    expect(measureDeathNotice(records)).toEqual([
      {
        name: "Cobb",
        diedAtTick: 100,
        finderName: "Mara",
        firstSeenTick: 160,
        firstMentionByOthersTick: 220,
        firstMentionByFinderTick: 161,
      },
    ]);
  });
});
