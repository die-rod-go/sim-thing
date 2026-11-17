import { describe, expect, it } from "vitest";
import { makeSampleLlmCall } from "../../src/fixtures/sample-data";
import { summarizeLlmCall } from "../../src/format/thoughts";

describe("summarizeLlmCall", () => {
  it("leads a decision with its thought and lists what was said", () => {
    const call = {
      ...makeSampleLlmCall(1, "ada", 10),
      parsed: {
        thought: "Bob looks hungry",
        intention: "Sell Bob bread",
        say: "Bread, Bob?",
        volume: "whisper",
        action: "continue",
      },
    };
    const entry = summarizeLlmCall(call);
    expect(entry.headline).toBe("Bob looks hungry");
    expect(entry.parts).toEqual([
      { label: "whispered", text: "Bread, Bob?" },
      { label: "intends", text: "Sell Bob bread" },
    ]);
  });

  it("lists words spoken alongside another action", () => {
    const call = {
      ...makeSampleLlmCall(1, "ada", 10),
      parsed: {
        thought: "Bob looks hungry",
        intention: "Sell Bob bread",
        say: "Bread, Bob?",
        action: "give",
        target: "Bob",
        item: "bread",
        amount: 1,
      },
    };
    expect(summarizeLlmCall(call).parts).toEqual([
      { label: "said", text: "Bread, Bob?" },
      { label: "does", text: "give 1 bread to Bob" },
      { label: "intends", text: "Sell Bob bread" },
    ]);
  });

  it("omits the action when the agent just continues", () => {
    const call = {
      ...makeSampleLlmCall(1, "ada", 10),
      parsed: { thought: "Keep going", intention: "Bake", action: "continue" },
    };
    expect(summarizeLlmCall(call).parts.map((entryPart) => entryPart.label)).toEqual(["intends"]);
  });

  it("leads a memory summary with its text", () => {
    const call = {
      ...makeSampleLlmCall(4, "ada", 9),
      kind: "episode" as const,
      parsed: { summary: "I baked all morning." },
    };
    expect(summarizeLlmCall(call)).toMatchObject({ headline: "I baked all morning.", parts: [] });
  });

  it("lists what a reflection rewrote: people, person by person, and key memories", () => {
    const call = {
      ...makeSampleLlmCall(5, "ada", 9),
      kind: "reflection" as const,
      parsed: {
        people: [{ person: "Bob", whatIThinkOfThem: "Grumpy.", whatTheyWantFromMe: null }],
        traitChanges: [],
        keyMemories: [{ day: 2, text: "Bob saved my life." }],
      },
    };
    expect(summarizeLlmCall(call).parts).toEqual([
      { label: "Bob: thinks", text: "Grumpy." },
      { label: "never forget", text: "Bob saved my life." },
    ]);
  });

  it("lists a day plan's items, each with its hour when it has one", () => {
    const call = {
      ...makeSampleLlmCall(6, "ada", 9),
      kind: "day_plan" as const,
      parsed: {
        agenda: [
          { text: "Sell bread on the square", hour: null },
          { text: "Dice at the tavern", hour: 19 },
        ],
        longTermGoals: null,
      },
    };
    expect(summarizeLlmCall(call).parts).toEqual([
      { label: "today", text: "Sell bread on the square" },
      { label: "at 7:00 pm", text: "Dice at the tavern" },
    ]);
  });

  it("returns no summary when nothing was parsed", () => {
    const call = { ...makeSampleLlmCall(3, "ada", 1), parsed: null, error: "timeout" };
    expect(summarizeLlmCall(call)).toMatchObject({ headline: null, parts: [], error: "timeout" });
  });
});
