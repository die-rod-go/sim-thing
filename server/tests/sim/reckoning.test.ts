import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { findDuePass } from "../../src/memory/summaries";
import { getAgentRuntime, requestDecision } from "../../src/sim/agent-runtime";
import {
  createTestSim,
  decisionReply,
  DEFAULT_SUMMARY,
  promptOf,
  scriptByAgent,
} from "../../src/sim/test-sim";
import { appendToStream, getAgentMemory, replaceAgent } from "../../src/sim/world-access";

const SOMETHING_HAPPENED = "## Something has happened";

describe("a reckoning", () => {
  it("is asked as its own kind, ends with what happened, and may rewrite Today", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: scriptByAgent({
        Mara: (request) =>
          promptOf(request).includes(SOMETHING_HAPPENED)
            ? decisionReply({
                action: "wait",
                minutes: 5,
                agenda: [{ text: "Bury Cobb at sunset", hour: 18 }],
              })
            : undefined,
      }),
    });
    replaceAgent(sim.state, {
      ...sim.agent("mara"),
      agenda: [{ number: 1, text: "Bake bread", hour: null }],
      nextAgendaNumber: 2,
    });
    requestDecision(getAgentRuntime(sim.state, "mara"), "I found Cobb's body", true, true);
    await sim.advance();
    const reckoning = sim.records.find((record) => record.kind === "reckoning");
    expect(reckoning?.prompt).toContain(`${SOMETHING_HAPPENED}\nI found Cobb's body.`);
    expect(reckoning?.prompt.trimEnd().endsWith("in remember, in one sentence.")).toBe(true);
    expect(sim.agent("mara").agenda).toEqual([
      { number: 2, text: "Bury Cobb at sunset", hour: 18 },
    ]);
    expect(findDuePass(getAgentMemory(sim.state, "mara"))).not.toBeNull();
  });

  it("ignores a whole new agenda from an ordinary decision", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: scriptByAgent({
        Mara: () =>
          decisionReply({ action: "wait", minutes: 5, agenda: [{ text: "Run away", hour: null }] }),
      }),
    });
    await sim.advance();
    expect(sim.records.map((record) => record.kind)).toEqual(["decision"]);
    expect(sim.agent("mara").agenda).toEqual([]);
  });
});

describe("remembering", () => {
  it("files a moment to remember, keeps it as a candidate, and owes taking stock", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0
            ? decisionReply({ action: "wait", minutes: 30, remember: "Ilsa told me she loves me." })
            : undefined,
      }),
    });
    await sim.advance();
    expect(sim.streamTexts("mara")).toContain("This I will remember: Ilsa told me she loves me.");
    const memory = getAgentMemory(sim.state, "mara");
    expect(memory.keyMemoryCandidates).toEqual([{ tick: 0, text: "Ilsa told me she loves me." }]);
    expect(memory.passes.isLongTermGoalsOwed).toBe(true);
  });

  it("keeps an episode's key memory as a candidate", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: (request) =>
        request.schemaName === "episode_reply"
          ? JSON.stringify({ summary: DEFAULT_SUMMARY, keyMemory: "The mill burned down." })
          : decisionReply({ action: "wait", minutes: config.decision.maxWaitMinutes }),
    });
    for (let index = 0; index < config.memory.streamMax; index += 1) {
      appendToStream(sim.state, "mara", `I saw thing ${index}`);
    }
    await sim.advance();
    expect(
      getAgentMemory(sim.state, "mara").keyMemoryCandidates.map((entry) => entry.text),
    ).toEqual(["The mill burned down."]);
  });

  it("shows key memories with their day among who the agent is", async () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
    sim.state.agentMemories.mara = {
      ...getAgentMemory(sim.state, "mara"),
      keyMemories: [{ tick: 0, text: "My father died at sea." }],
    };
    await sim.advance();
    expect(sim.records[0]?.prompt).toContain(
      `## ${config.memory.keyMemoriesTitle}\n- Day 1: My father died at sea.`,
    );
  });
});

describe("repeats in the stream", () => {
  it("merges an agent's near repeat of its own words, and shows the count", async () => {
    let calls = 0;
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: scriptByAgent({
        Mara: () => {
          calls += 1;
          const say = calls === 1 ? "Ilsa, pay me what you owe" : "Ilsa, pay me what you owe me";
          return decisionReply({ action: "wait", minutes: 1, say });
        },
      }),
    });
    await sim.advance(4);
    const merged = getAgentMemory(sim.state, "mara").stream.filter((entry) => entry.count);
    expect(merged).toHaveLength(1);
    expect(sim.records.at(-1)?.prompt).toMatch(/I said \(×\d\): "Ilsa, pay me what you owe me"/);
  });
});
