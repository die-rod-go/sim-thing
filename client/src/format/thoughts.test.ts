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

  it("returns no summary when nothing was parsed", () => {
    const call = { ...makeSampleLlmCall(3, "ada", 1), parsed: null, error: "timeout" };
    expect(summarizeLlmCall(call)).toMatchObject({ headline: null, parts: [], error: "timeout" });
  });
});
