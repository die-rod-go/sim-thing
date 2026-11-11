import { describe, expect, it } from "vitest";
import { makeSampleLlmCall } from "../fixtures/sample-data";
import { summarizeLlmCall } from "./thoughts";

describe("summarizeLlmCall", () => {
  it("leads a decision with its thought and lists what was said", () => {
    const call = {
      ...makeSampleLlmCall(1, "ada", 10),
      parsed: {
        thought: "Bob looks hungry",
        intention: "Sell Bob bread",
        say: "Bread, Bob?",
        volume: "whisper",
        action: "say",
      },
    };
    const entry = summarizeLlmCall(call);
    expect(entry.headline).toBe("Bob looks hungry");
    expect(entry.parts).toEqual([
      { label: "whispered", text: "Bread, Bob?" },
      { label: "intends", text: "Sell Bob bread" },
    ]);
  });

  it("lists what was done and leaves out words not spoken by a say action", () => {
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

  it("reads a night reflection's summary, insights and people notes", () => {
    const call = {
      ...makeSampleLlmCall(2, "ada", 900),
      kind: "night" as const,
      parsed: {
        summary: "A long day at the oven.",
        moodEntry: "tired but proud",
        insights: [{ text: "Bob always pays late" }],
        peopleNotes: [{ person: "Bob", text: "owes me two coins" }],
      },
    };
    const entry = summarizeLlmCall(call);
    expect(entry.headline).toBe("A long day at the oven.");
    expect(entry.parts.map((entryPart) => entryPart.label)).toEqual([
      "feels",
      "realized",
      "on Bob",
    ]);
  });

  it("returns no summary when nothing was parsed", () => {
    const call = { ...makeSampleLlmCall(3, "ada", 1), parsed: null, error: "timeout" };
    expect(summarizeLlmCall(call)).toMatchObject({ headline: null, parts: [], error: "timeout" });
  });
});
