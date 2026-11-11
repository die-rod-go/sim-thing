import { describe, expect, it } from "vitest";
import { makeSampleAgent, makeSampleEvent } from "../fixtures/sample-data";
import type { ConversationThread, SpokenLine } from "../format/conversations";
import { findLiveliestThread, pickDirectorShot, type DirectorWindow } from "./director";

const conversationWindow: DirectorWindow = {
  currentTick: 100,
  maxGapTicks: 10,
  recentWindowTicks: 20,
};

function line(eventId: number, tick: number, speakerId: string): SpokenLine {
  return {
    kind: "line",
    eventId,
    tick,
    speakerId,
    speakerName: speakerId,
    words: "hello",
    volume: "normal",
  };
}

function makeThread(id: number, speakerIds: string[], lineTicks: number[]): ConversationThread {
  const entries = lineTicks.map((tick, lineIndex) =>
    line(id * 100 + lineIndex, tick, speakerIds[lineIndex % speakerIds.length] ?? "nobody"),
  );
  return {
    id,
    place: "square",
    startTick: lineTicks[0] ?? 0,
    endTick: lineTicks[lineTicks.length - 1] ?? 0,
    speakerIds,
    speakerNames: speakerIds,
    entries,
  };
}

describe("findLiveliestThread", () => {
  it("picks the ongoing conversation with the most recent lines", () => {
    const quiet = makeThread(1, ["ada", "bob"], [95, 98]);
    const busy = makeThread(2, ["cleo", "dan"], [92, 94, 96, 97]);
    expect(findLiveliestThread([quiet, busy], conversationWindow)?.id).toBe(2);
  });

  it("breaks a tie in favor of the conversation that spoke last", () => {
    const earlier = makeThread(1, ["ada", "bob"], [94, 95]);
    const later = makeThread(2, ["cleo", "dan"], [96, 99]);
    expect(findLiveliestThread([earlier, later], conversationWindow)?.id).toBe(2);
  });

  it("ignores conversations that have gone quiet", () => {
    const finished = makeThread(1, ["ada", "bob"], [80, 81, 82, 85]);
    expect(findLiveliestThread([finished], conversationWindow)).toBeNull();
  });
});

describe("pickDirectorShot", () => {
  it("frames the speakers of the liveliest conversation", () => {
    const thread = makeThread(1, ["ada", "bob"], [97, 99]);
    expect(pickDirectorShot([thread], [], conversationWindow)).toEqual({
      kind: "agents",
      agentIds: ["ada", "bob"],
    });
  });

  it("falls back to whoever did the latest thing when nobody is talking", () => {
    const ada = makeSampleAgent("ada", "Ada", 0, 0);
    const bob = makeSampleAgent("bob", "Bob", 1, 0);
    const events = [makeSampleEvent(7, bob, 90), makeSampleEvent(3, ada, 95)];
    expect(pickDirectorShot([], events, conversationWindow)).toEqual({
      kind: "agent",
      agentId: "bob",
    });
  });

  it("has no shot when nothing has happened", () => {
    expect(pickDirectorShot([], [], conversationWindow)).toBeNull();
  });
});
