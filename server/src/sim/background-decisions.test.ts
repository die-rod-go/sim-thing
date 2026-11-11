import { describe, expect, it } from "vitest";
import type { FakeReply } from "../llm/fake-llm-client";
import { BackgroundDecisions } from "./background-decisions";
import type { DecisionPlan } from "./decision-runner";
import { createTestSim, decisionReply, findPromptAgentName } from "./test-sim";

const SQUARE = { x: 19, y: 15 };

/** Lets replies that were just released travel through the LLM stack's promise chain. */
function settleReplies(): Promise<void> {
  return new Promise((resolveSettled) => setTimeout(resolveSettled, 0));
}

function createHeldReplies() {
  const releases: { agentName: string; release: (reply: FakeReply) => void }[] = [];
  return {
    responder: (request: Parameters<typeof findPromptAgentName>[0]) =>
      new Promise<FakeReply>((resolveReply) => {
        releases.push({ agentName: findPromptAgentName(request), release: resolveReply });
      }),
    heldCount: () => releases.length,
    releaseNext(reply: FakeReply) {
      const next = releases.shift();
      if (!next) throw new Error("no reply is being held");
      next.release(reply);
    },
  };
}

function waitPlan(agentId: string): DecisionPlan {
  return {
    agentId,
    isMidActionInterrupt: false,
    replies: [],
    action: { kind: "wait", minutes: 10 },
    recallEntries: [],
  };
}

describe("background decisions", () => {
  it("keeps the clock running while a decision waits for the LLM", async () => {
    const held = createHeldReplies();
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: held.responder,
      shouldDecideInBackground: true,
    });
    sim.placeAgent("mara", SQUARE);
    await sim.advance(3);
    expect(sim.state.tick).toBe(3);
    expect(held.heldCount()).toBe(1);
    expect(sim.agent("mara").currentAction).toBeNull();
  });

  it("applies a decision on the first tick after its reply arrives", async () => {
    const held = createHeldReplies();
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: held.responder,
      shouldDecideInBackground: true,
    });
    sim.placeAgent("mara", SQUARE);
    await sim.advance(2);
    held.releaseNext(decisionReply({ action: "wait", minutes: 30 }));
    await settleReplies();
    const [result] = await sim.advance();
    expect(result?.decidedAgentIds).toEqual(["mara"]);
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "wait" });
  });

  it("asks an agent only once while its decision is in flight", async () => {
    const held = createHeldReplies();
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: held.responder,
      shouldDecideInBackground: true,
    });
    sim.placeAgent("mara", SQUARE);
    await sim.advance(5);
    expect(sim.client.callCount).toBe(1);
  });

  it("re-raises a decision that threw on the next tick", async () => {
    const decisions = new BackgroundDecisions();
    const sim = createTestSim({ agentIds: ["mara"], responder: () => "" });
    decisions.start(sim.state, "mara", () => Promise.reject(new Error("prompt build broke")));
    await settleReplies();
    expect(() => decisions.collectFinished(sim.state)).toThrow(
      /Background decision for mara failed/,
    );
  });

  it("drops decisions asked in a world that has since been replaced", async () => {
    const decisions = new BackgroundDecisions();
    const oldWorld = createTestSim({ agentIds: ["mara"], responder: () => "" }).state;
    const newWorld = createTestSim({ agentIds: ["mara"], responder: () => "" }).state;
    decisions.start(oldWorld, "mara", () => Promise.resolve(waitPlan("mara")));
    await settleReplies();
    expect(decisions.isDeciding(newWorld, "mara")).toBe(false);
    expect(decisions.collectFinished(newWorld)).toEqual([]);
    expect(decisions.collectFinished(oldWorld)).toEqual([]);
  });

  it("returns finished plans in agent order, not reply order", async () => {
    const decisions = new BackgroundDecisions();
    const { state } = createTestSim({ agentIds: ["mara", "ilsa"], responder: () => "" });
    const [firstAgent, secondAgent] = state.agents.map((agent) => agent.id);
    if (!firstAgent || !secondAgent) throw new Error("expected two agents");
    let releaseFirst: (plan: DecisionPlan) => void = () => undefined;
    decisions.start(
      state,
      firstAgent,
      () => new Promise((resolvePlan) => (releaseFirst = resolvePlan)),
    );
    decisions.start(state, secondAgent, () => Promise.resolve(waitPlan(secondAgent)));
    await settleReplies();
    releaseFirst(waitPlan(firstAgent));
    await settleReplies();
    expect(decisions.collectFinished(state).map((plan) => plan.agentId)).toEqual([
      firstAgent,
      secondAgent,
    ]);
  });
});
