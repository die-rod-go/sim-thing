import { describe, expect, it } from "vitest";
import { computeChebyshevDistance } from "../../src/economy/give";
import type { LlmRequest } from "../../src/llm/types";
import { config } from "../../src/config";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import {
  createTestSim,
  decisionReply,
  findPromptAgentName,
  promptOf,
  scriptByAgent,
  type AgentScript,
} from "../../src/sim/test-sim";

const SQUARE = { x: 19, y: 15 };
const NEXT_TO_SQUARE = { x: SQUARE.x + 1, y: SQUARE.y };

type TestSim = ReturnType<typeof createTestSim>;

function firstReply(fields: Record<string, unknown>): AgentScript {
  return (_request, callIndex) => (callIndex === 0 ? decisionReply(fields) : undefined);
}

function countDecisions(sim: TestSim, agentName: string): number {
  return sim.client.requests
    .filter((request) => request.schemaName === "decision_reply")
    .filter((request) => findPromptAgentName(request) === agentName).length;
}

function spokenLines(sim: TestSim, agentId: string): string[] {
  return sim.results.flatMap((result) =>
    result.events
      .filter((event) => event.kind === "said" && event.actorId === agentId)
      .map((event) => event.description),
  );
}

describe("queued acts", () => {
  it("starts the next act with its words when one ends, with no new decision", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: scriptByAgent({
        Mara: firstReply({
          acts: [
            { action: "wait", minutes: 5, say: "One moment." },
            { action: "walk_to", target: "bakery", say: "Off to the bakery." },
          ],
        }),
      }),
    });
    sim.placeAgent("mara", SQUARE);
    await sim.advance();
    expect(sim.agent("mara").currentAction?.kind).toBe("wait");
    expect(getAgentRuntime(sim.state, "mara").queuedActs).toHaveLength(1);
    await sim.advance(6);
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "walk_to", target: "bakery" });
    expect(countDecisions(sim, "Mara")).toBe(1);
    expect(spokenLines(sim, "mara").join(" ")).toMatch(/One moment\..*Off to the bakery\./);
  });

  it("never says the words of an act that fails, and drops the rest of the queue", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: scriptByAgent({
        Mara: firstReply({
          acts: [
            { action: "walk_to", target: "the moon", say: "To the moon!" },
            { action: "wait", minutes: 5 },
          ],
        }),
      }),
    });
    sim.placeAgent("mara", SQUARE);
    await sim.advance();
    expect(spokenLines(sim, "mara")).toEqual([]);
    expect(getAgentRuntime(sim.state, "mara").queuedActs).toEqual([]);
  });

  it("shows the acts still queued after what the agent is doing", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: scriptByAgent({
        Mara: (request, callIndex) => {
          if (callIndex === 0) {
            return decisionReply({
              acts: [
                { action: "wait", minutes: 60 },
                { action: "walk_to", target: "bakery" },
              ],
            });
          }
          return undefined;
        },
      }),
    });
    sim.placeAgent("mara", SQUARE);
    await sim.advance();
    getAgentRuntime(sim.state, "mara").pendingDecision = {
      reason: "a test interruption",
      isUrgent: true,
      isReckoning: false,
    };
    await sim.advance();
    const prompt = promptOf(sim.client.requests.at(-1) as LlmRequest);
    expect(prompt).toContain(`${config.decision.queuedActTexts.prefix}walk to bakery`);
  });
});

describe("waiting on a give", () => {
  it("waits for the answer to an offer before starting the next act", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({
        Mara: firstReply({
          acts: [
            { action: "give", target: "Ilsa", item: "coins", amount: 3 },
            { action: "walk_to", target: "bakery" },
          ],
        }),
        Ilsa: (request) =>
          promptOf(request).includes("Mara is offering you 3 coins")
            ? decisionReply({ action: "continue", offer: "accept" })
            : undefined,
      }),
    });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", NEXT_TO_SQUARE);
    await sim.advance();
    expect(sim.agent("mara").currentAction?.kind).toBe("wait");
    expect(getAgentRuntime(sim.state, "mara").isAwaitingAnswer).toBe(true);
    await sim.advance(2);
    expect(sim.streamTexts("mara")).toContain("I gave Ilsa 3 coins");
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "walk_to", target: "bakery" });
  });
});

describe("following", () => {
  it("keeps within reach of someone walking away", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          decisionReply(
            callIndex === 0
              ? { action: "follow", target: "Ilsa", minutes: 120 }
              : { action: "continue" },
          ),
        Ilsa: () => decisionReply({ action: "walk_to", target: "bakery" }),
      }),
    });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", NEXT_TO_SQUARE);
    await sim.advance();
    expect(sim.agent("mara").currentAction?.kind).toBe("follow");
    await sim.advance(60);
    expect(sim.agent("ilsa").place).toBe("bakery");
    const distance = computeChebyshevDistance(sim.agent("mara").pos, sim.agent("ilsa").pos);
    expect(distance).toBeLessThanOrEqual(config.economy.giveReachTiles + 1);
  });

  it("fails to follow someone who isn't in sight", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({
        Mara: firstReply({ action: "follow", target: "Ilsa" }),
      }),
    });
    sim.placeAgent("mara", { x: 5, y: 4 });
    sim.placeAgent("ilsa", SQUARE);
    await sim.advance();
    expect(sim.agent("mara").currentAction?.kind).not.toBe("follow");
  });
});
