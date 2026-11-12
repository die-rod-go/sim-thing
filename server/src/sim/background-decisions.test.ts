import { describe, expect, it } from "vitest";
import type { FakeReply } from "../llm/fake-llm-client";
import { BackgroundDecisions } from "./background-decisions";
import type { DecisionPlan } from "./decision-runner";
import { createTestSim, decisionReply, findPromptAgentName, interruptDuringWait } from "./test-sim";

const SQUARE = { x: 19, y: 15 };
const LONG_WAIT_TICKS = 60;

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
  it("keeps the clock running while an agent interrupted mid-action decides", async () => {
    const held = createHeldReplies();
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: held.responder,
      shouldDecideInBackground: true,
    });
    sim.placeAgent("mara", SQUARE);
    interruptDuringWait(sim, "mara", LONG_WAIT_TICKS);
    await sim.advance(3);
    expect(sim.state.tick).toBe(3);
    expect(held.heldCount()).toBe(1);
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "wait" });
  });

  it("applies a mid-action decision on the first tick after its reply arrives", async () => {
    const held = createHeldReplies();
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: held.responder,
      shouldDecideInBackground: true,
    });
    sim.placeAgent("mara", SQUARE);
    interruptDuringWait(sim, "mara", LONG_WAIT_TICKS);
    await sim.advance(2);
    held.releaseNext(decisionReply({ action: "walk_to", target: "bakery" }));
    await settleReplies();
    const [result] = await sim.advance();
    expect(result?.decidedAgentIds).toEqual(["mara"]);
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "walk_to" });
  });

  it("asks an agent only once while its decision is in flight", async () => {
    const held = createHeldReplies();
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: held.responder,
      shouldDecideInBackground: true,
    });
    sim.placeAgent("mara", SQUARE);
    interruptDuringWait(sim, "mara", LONG_WAIT_TICKS);
    await sim.advance(5);
    expect(sim.client.callCount).toBe(1);
  });

  it("holds the clock for an idle agent's decision and applies it on the same tick", async () => {
    const held = createHeldReplies();
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: held.responder,
      shouldDecideInBackground: true,
    });
    sim.placeAgent("mara", SQUARE);
    let isTickDone = false;
    const ticking = sim.advance().then((results) => {
      isTickDone = true;
      return results;
    });
    await settleReplies();
    expect(isTickDone).toBe(false);
    held.releaseNext(decisionReply({ action: "wait", minutes: 30 }));
    const [result] = await ticking;
    expect(result?.decidedAgentIds).toEqual(["mara"]);
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "wait" });
  });

  it("holds the clock once an agent's action ends while its decision is still in flight", async () => {
    const held = createHeldReplies();
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: held.responder,
      shouldDecideInBackground: true,
    });
    sim.placeAgent("mara", SQUARE);
    interruptDuringWait(sim, "mara", 2);
    await sim.advance(2);
    let isTickDone = false;
    const ticking = sim.advance().then(() => (isTickDone = true));
    await settleReplies();
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(isTickDone).toBe(false);
    held.releaseNext(decisionReply({ action: "wait", minutes: 30 }));
    await ticking;
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "wait" });
  });

  it("lets the clock go on once an idle agent's decision outlasts the wait cap", async () => {
    const held = createHeldReplies();
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: held.responder,
      shouldDecideInBackground: true,
      idleDecisionWaitMs: 5,
    });
    sim.placeAgent("mara", SQUARE);
    const [firstResult] = await sim.advance();
    expect(firstResult?.decidedAgentIds).toEqual([]);
    expect(sim.agent("mara").currentAction).toBeNull();
    held.releaseNext(decisionReply({ action: "wait", minutes: 30 }));
    await settleReplies();
    const [secondResult] = await sim.advance();
    expect(secondResult?.decidedAgentIds).toEqual(["mara"]);
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "wait" });
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
