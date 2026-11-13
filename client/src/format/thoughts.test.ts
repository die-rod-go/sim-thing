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

  it("reads a night reflection's summary, insights and dossiers", () => {
    const call = {
      ...makeSampleLlmCall(2, "ada", 900),
      kind: "night" as const,
      parsed: {
        summary: "A long day at the oven.",
        moodEntry: "tired but proud",
        insights: [{ text: "Bob always pays late" }],
        dossiers: [{ person: "Bob", text: "owes me two coins" }],
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

  it("leads a daytime pass with its thinking and lists progress, plans and dossiers", () => {
    const call = {
      ...makeSampleLlmCall(4, "ada", 300),
      kind: "daytime" as const,
      parsed: {
        thinking: "Bob won't pay until he sees the bread.",
        insights: [{ text: "Bob trusts what he sees" }],
        goalProgress: [{ goal: 1, progress: "sold four loaves" }],
        plans: [
          {
            aim: "Get Bob to pay his debt",
            steps: ["show him the bread", "ask for the coins"],
            keepFrom: "Cara",
          },
        ],
        dossiers: [{ person: "Bob", text: "owes me two coins" }],
        mood: "determined",
      },
    };
    const entry = summarizeLlmCall(call);
    expect(entry.headline).toBe("Bob won't pay until he sees the bread.");
    expect(entry.parts).toEqual([
      { label: "realized", text: "Bob trusts what he sees" },
      { label: "goal 1", text: "sold four loaves" },
      {
        label: "plans",
        text: "Get Bob to pay his debt: next, show him the bread; then ask for the coins (kept from Cara)",
      },
      { label: "on Bob", text: "owes me two coins" },
      { label: "feels", text: "determined" },
    ]);
  });

  it("shows the dossiers a conversation summary rewrote", () => {
    const call = {
      ...makeSampleLlmCall(5, "ada", 40),
      kind: "conversation_summary" as const,
      parsed: {
        summary: "Bob promised to pay tomorrow.",
        dossiers: [{ person: "Bob", text: "promised to pay me tomorrow" }],
      },
    };
    expect(summarizeLlmCall(call).parts).toEqual([
      { label: "on Bob", text: "promised to pay me tomorrow" },
    ]);
  });

  it("returns no summary when nothing was parsed", () => {
    const call = { ...makeSampleLlmCall(3, "ada", 1), parsed: null, error: "timeout" };
    expect(summarizeLlmCall(call)).toMatchObject({ headline: null, parts: [], error: "timeout" });
  });
});
