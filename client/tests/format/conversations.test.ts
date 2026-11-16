import { describe, expect, it } from "vitest";
import type { WorldEvent } from "@village/shared";
import { makeSampleAgent, makeSampleEvent } from "../../src/fixtures/sample-data";
import { groupConversations, isThreadOngoing } from "../../src/format/conversations";

const MAX_GAP_TICKS = 10;
const ada = makeSampleAgent("ada", "Ada", 0, 0);
const bob = makeSampleAgent("bob", "Bob", 1, 0);
const clara = { ...makeSampleAgent("clara", "Clara", 9, 9), place: "tavern" };

function makeGift(id: number, tick: number): WorldEvent {
  return {
    ...makeSampleEvent(id, bob, tick),
    kind: "gave",
    description: "gave Ada 1 bread",
    loudness: null,
    speech: undefined,
  };
}

describe("groupConversations", () => {
  it("joins lines at the same place into one thread with speakers in order", () => {
    const threads = groupConversations(
      [makeSampleEvent(1, ada, 1), makeSampleEvent(2, bob, 3), makeSampleEvent(3, ada, 5)],
      MAX_GAP_TICKS,
    );
    expect(threads).toHaveLength(1);
    expect(threads[0]?.speakerNames).toEqual(["Ada", "Bob"]);
    expect(threads[0]?.entries).toHaveLength(3);
    expect(threads[0]?.endTick).toBe(5);
  });

  it("opens a new thread after a long silence, newest first", () => {
    const threads = groupConversations(
      [makeSampleEvent(1, ada, 1), makeSampleEvent(2, bob, 1 + MAX_GAP_TICKS + 1)],
      MAX_GAP_TICKS,
    );
    expect(threads.map((thread) => thread.id)).toEqual([2, 1]);
  });

  it("keeps simultaneous talk at different places apart", () => {
    const threads = groupConversations(
      [makeSampleEvent(1, ada, 1), makeSampleEvent(2, clara, 2), makeSampleEvent(3, bob, 3)],
      MAX_GAP_TICKS,
    );
    expect(threads.map((thread) => thread.place)).toEqual(["tavern", "square"]);
    expect(threads[1]?.speakerIds).toEqual(["ada", "bob"]);
  });

  it("shows a speaker's gift inside the thread but ignores gifts from non-speakers", () => {
    const withSpeakerGift = groupConversations(
      [makeSampleEvent(1, ada, 1), makeSampleEvent(2, bob, 2), makeGift(3, 3)],
      MAX_GAP_TICKS,
    );
    expect(withSpeakerGift[0]?.entries.map((entry) => entry.kind)).toEqual([
      "line",
      "line",
      "stage",
    ]);
    const withOutsiderGift = groupConversations(
      [makeSampleEvent(1, ada, 1), makeGift(2, 2)],
      MAX_GAP_TICKS,
    );
    expect(withOutsiderGift[0]?.entries).toHaveLength(1);
  });

  it("treats a thread as ongoing until the gap has passed", () => {
    const [thread] = groupConversations([makeSampleEvent(1, ada, 5)], MAX_GAP_TICKS);
    if (!thread) throw new Error("expected a thread");
    expect(isThreadOngoing(thread, 5 + MAX_GAP_TICKS, MAX_GAP_TICKS)).toBe(true);
    expect(isThreadOngoing(thread, 5 + MAX_GAP_TICKS + 1, MAX_GAP_TICKS)).toBe(false);
  });
});
