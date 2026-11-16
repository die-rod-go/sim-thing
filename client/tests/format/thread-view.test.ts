import { describe, expect, it } from "vitest";
import { makeSampleAgent, makeSampleEvent } from "../../src/fixtures/sample-data";
import { groupConversations } from "../../src/format/conversations";
import { describeThreadPreview, mergeSpeakerRuns } from "../../src/format/thread-view";

const MAX_GAP_TICKS = 10;
const ada = makeSampleAgent("ada", "Ada", 0, 0);
const bob = makeSampleAgent("bob", "Bob", 1, 0);

function say(id: number, speaker: typeof ada, tick: number, words: string) {
  return { ...makeSampleEvent(id, speaker, tick), speech: { words, volume: "normal" as const } };
}

const thread = groupConversations(
  [say(1, ada, 1, "Morning!"), say(2, ada, 2, "Bread?"), say(3, bob, 3, "Yes please.")],
  MAX_GAP_TICKS,
)[0];

describe("mergeSpeakerRuns", () => {
  it("merges consecutive lines by the same speaker into one run", () => {
    if (!thread) throw new Error("expected a thread");
    const blocks = mergeSpeakerRuns(thread.entries);
    expect(
      blocks.map((block) =>
        block.kind === "run" ? [block.speakerName, block.lines.map((line) => line.words)] : null,
      ),
    ).toEqual([
      ["Ada", ["Morning!", "Bread?"]],
      ["Bob", ["Yes please."]],
    ]);
  });
});

describe("describeThreadPreview", () => {
  it("previews the opening line and counts every line", () => {
    if (!thread) throw new Error("expected a thread");
    expect(describeThreadPreview(thread)).toEqual({
      speakerName: "Ada",
      words: "Morning!",
      lineCount: 3,
    });
  });
});
