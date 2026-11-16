import { describe, expect, it } from "vitest";
import type { WorldEvent } from "@village/shared";
import { makeSampleAgent, makeSampleEvent } from "../../src/fixtures/sample-data";
import { groupConversations } from "../../src/format/conversations";
import { layOutRelationshipWeb } from "../../src/format/relationship-web";

const MAX_GAP_TICKS = 10;
const GEOMETRY = { size: 200, ringRadius: 80 };
const ada = makeSampleAgent("ada", "Ada", 0, 0);
const bob = makeSampleAgent("bob", "Bob", 1, 0);
const clara = makeSampleAgent("clara", "Clara", 2, 0);

function say(id: number, speaker: typeof ada, tick: number): WorldEvent {
  return { ...makeSampleEvent(id, speaker, tick), speech: { words: "hi", volume: "normal" } };
}

describe("layOutRelationshipWeb", () => {
  it("includes only people the agent has talked with, most lines first", () => {
    const events = [say(1, ada, 1), say(2, bob, 2), say(3, ada, 3), say(4, bob, 4)];
    const threads = groupConversations(events, MAX_GAP_TICKS);
    const layout = layOutRelationshipWeb("ada", ["bob", "clara"], threads, GEOMETRY);
    expect(layout.nodes.map((node) => [node.agentId, node.sharedLineCount])).toEqual([["bob", 4]]);
    expect(layout.maxSharedLineCount).toBe(4);
  });

  it("puts the first person straight above the center", () => {
    const events = [say(1, ada, 1), say(2, clara, 2)];
    const layout = layOutRelationshipWeb(
      "ada",
      ["clara"],
      groupConversations(events, MAX_GAP_TICKS),
      GEOMETRY,
    );
    expect(layout.nodes[0]?.position.x).toBeCloseTo(100);
    expect(layout.nodes[0]?.position.y).toBeCloseTo(20);
  });
});
