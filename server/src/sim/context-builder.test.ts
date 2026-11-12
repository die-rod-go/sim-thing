import type { Memory } from "@village/shared";
import { describe, expect, it } from "vitest";
import { config } from "../config";
import { buildDecisionContext } from "./context-builder";
import { createTestSim, scriptByAgent } from "./test-sim";
import { rememberBriefly } from "./world-access";

const CLEAR_MIND_ROLL = 0.999;
const TICK_NOW = 100;
const TICK_EARLIER = 40;

function didMemory(id: string, tick: number, text: string, place: string): Memory {
  return {
    id,
    agentId: "mara",
    bucket: "did",
    tick,
    text,
    tags: [place],
    strength: config.memory.newMemoryStrength,
    lastRecalledTick: null,
  };
}

describe("decision context", () => {
  it("leaves out recalled memories already on the agent's mind", () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
    const place = sim.agent("mara").place;
    sim.state.tick = TICK_EARLIER;
    rememberBriefly(sim.state, "mara", "I picked up the bread");
    sim.state.memoryStore.add(didMemory("did-early", TICK_EARLIER, "I picked up the bread", place));
    sim.state.tick = TICK_NOW;
    sim.state.memoryStore.add(didMemory("did-on-mind", TICK_NOW, "I swept the floor", place));
    rememberBriefly(sim.state, "mara", "I swept the floor");
    sim.state.memoryStore.add(didMemory("did-older", 10, "I swept the floor", place));
    const context = buildDecisionContext(sim.state, "mara", false, {
      passiveRecallRoll: CLEAR_MIND_ROLL,
    });
    const recalledDid = (context.recalledMemories.did ?? []).map((memory) => memory.minutesAgo);
    expect(recalledDid).toEqual([TICK_NOW - 10]);
  });

  it("does not repeat current conversation lines in On your mind or recalled memories", () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
    const place = sim.agent("mara").place;
    sim.state.tick = TICK_NOW;
    sim.state.conversationLog.lines.push({
      speakerId: "clara",
      speakerName: "Clara",
      tick: TICK_NOW,
      words: "Is the well dry?",
      volume: "normal",
      clearListenerIds: ["mara"],
      muffledListenerIds: [],
    });
    rememberBriefly(sim.state, "mara", 'Clara said: "is the well dry"');
    rememberBriefly(sim.state, "mara", "I swept the floor");
    sim.state.memoryStore.add({
      ...didMemory("heard", TICK_NOW, 'Clara said: "Is the well dry?"', place),
      bucket: "conversations",
    });
    const context = buildDecisionContext(sim.state, "mara", false, {
      passiveRecallRoll: CLEAR_MIND_ROLL,
    });
    expect(context.conversation).toHaveLength(1);
    expect(context.workingMemory.join(" ")).not.toContain("well dry");
    expect(context.workingMemory.join(" ")).toContain("swept the floor");
    expect(context.recalledMemories.conversations ?? []).toEqual([]);
  });
});
