import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import type { FakeReply } from "../../src/llm/fake-llm-client";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import { applyDamage } from "../../src/sim/damage";
import { readHealth, setAgentHealth } from "./combat-test-kit";
import { buildRunRecord } from "./verb-run-test-kit";
import {
  createTestSim,
  decisionReply,
  findEntityByLabel,
  findPromptAgentName,
  interruptDuringWait,
  promptOf,
  scriptByAgent,
  type TestSim,
} from "../../src/sim/test-sim";
import type { TickContext } from "../../src/sim/tick-context";
import { replaceAgent } from "../../src/sim/world-access";
import { createEmptyTickResult } from "../../src/sim/world-state";

const SQUARE = { x: 19, y: 15 };
const NEXT_TO_SQUARE = { x: 20, y: 15 };
const OUT_OF_SIGHT_OF_SQUARE = { x: 5, y: 4 };
const MINUTES_PER_HOUR = 60;
const LETHAL = 2;

function contextOf(sim: TestSim): TickContext {
  return {
    state: sim.state,
    result: createEmptyTickResult(sim.state.tick),
    dependencies: { callStructured: sim.llm.callStructured },
  };
}

function waitLong() {
  return decisionReply({ action: "wait", minutes: config.decision.maxWaitMinutes });
}

function settleReplies(): Promise<void> {
  return new Promise((resolveSettled) => setTimeout(resolveSettled, 0));
}

/** Busy waiting, inside the interrupt cooldown, with nothing pending: only an urgent flag decides. */
function waitWithoutInterrupts(sim: TestSim, agentId: string): void {
  const agent = sim.agent(agentId);
  const endsAtTick = sim.state.tick + MINUTES_PER_HOUR;
  replaceAgent(sim.state, { ...agent, currentAction: { kind: "wait", endsAtTick } });
  const runtime = getAgentRuntime(sim.state, agentId);
  runtime.pendingDecision = null;
  runtime.lastInterruptTick = sim.state.tick;
}

describe("death", () => {
  it("records the killed phrase with the source agent as the cause", async () => {
    const sim = createTestSim({ agentIds: ["mara", "ilsa"], responder: scriptByAgent({}) });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", NEXT_TO_SQUARE);
    await sim.advance();
    const context = contextOf(sim);
    applyDamage(context, "mara", {
      amount: LETHAL,
      killed: "stabbed by {actor}",
      sourceId: "ilsa",
    });
    const mara = sim.agent("mara");
    expect(readHealth(sim, "mara")).toBe(0);
    expect(mara.death).toEqual({
      tick: sim.state.tick,
      cause: "stabbed by Ilsa",
      sourceId: "ilsa",
    });
    expect(context.result.events.map((event) => event.kind)).toContain("died");
    expect(context.result.moments).toContainEqual(
      expect.objectContaining({ kind: "died", agentId: "mara", cause: "stabbed by Ilsa" }),
    );
  });

  it("puts the death in witnesses' streams and gives them an urgent decision", async () => {
    const sim = createTestSim({ agentIds: ["mara", "ilsa"], responder: scriptByAgent({}) });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", NEXT_TO_SQUARE);
    await sim.advance();
    applyDamage(contextOf(sim), "mara", { amount: LETHAL, killed: "starved", sourceId: null });
    expect(sim.streamTexts("ilsa")).toContain("I saw that Mara died");
    expect(getAgentRuntime(sim.state, "ilsa").pendingDecision?.isUrgent).toBe(true);
    expect(sim.streamTexts("mara")).not.toContain("I died");
  });

  it("cancels the current action and stops the verb run, so the object has one user less", async () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
    const table = findEntityByLabel(sim.state, "card table");
    replaceAgent(sim.state, {
      ...sim.agent("mara"),
      currentAction: { kind: "interact", target: "card table", verb: "play cards", endsAtTick: 30 },
    });
    getAgentRuntime(sim.state, "mara").verbRun = buildRunRecord(sim, "mara", "play cards", table);
    applyDamage(contextOf(sim), "mara", { amount: LETHAL, killed: "starved", sourceId: null });
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(getAgentRuntime(sim.state, "mara").verbRun).toBeNull();
  });

  it("drops a decision still in flight when it arrives", async () => {
    const releases: ((reply: FakeReply) => void)[] = [];
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: () => new Promise<FakeReply>((resolveReply) => releases.push(resolveReply)),
      shouldCallLlmInBackground: true,
    });
    sim.placeAgent("mara", SQUARE);
    interruptDuringWait(sim, "mara", MINUTES_PER_HOUR);
    await sim.advance();
    expect(releases).toHaveLength(1);
    applyDamage(contextOf(sim), "mara", { amount: LETHAL, killed: "starved", sourceId: null });
    releases[0]?.(decisionReply({ action: "walk_to", target: "bakery" }));
    await settleReplies();
    const [result] = await sim.advance();
    expect(result?.decidedAgentIds).not.toContain("mara");
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(sim.agent("mara").pos).toEqual(SQUARE);
  });

  it("stops need decay, regeneration and decisions after death", async () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({ Mara: waitLong }) });
    sim.placeAgent("mara", SQUARE);
    applyDamage(contextOf(sim), "mara", { amount: LETHAL, killed: "starved", sourceId: null });
    const needsAtDeath = sim.agent("mara").needs;
    await sim.advance(MINUTES_PER_HOUR);
    expect(sim.agent("mara").needs).toEqual(needsAtDeath);
    expect(readHealth(sim, "mara")).toBe(0);
    expect(sim.client.callCount).toBe(0);
  });

  it("starves to death once starvation has drained all health", async () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({ Mara: waitLong }) });
    const graceTicks = config.health.starvationGraceHours * MINUTES_PER_HOUR;
    replaceAgent(sim.state, {
      ...sim.agent("mara"),
      needs: { ...sim.agent("mara").needs, hunger: 0 },
      starvingSinceTick: -graceTicks,
    });
    setAgentHealth(sim, "mara", 0.0001);
    await sim.advance();
    expect(sim.agent("mara").death?.cause).toBe(config.health.starvationKilledPhrase);
  });

  it("gives a decision when starvation drops health below a threshold", async () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({ Mara: waitLong }) });
    await sim.advance();
    const [threshold] = config.health.decisionThresholds;
    if (threshold === undefined) throw new Error("no health thresholds configured");
    const graceTicks = config.health.starvationGraceHours * MINUTES_PER_HOUR;
    replaceAgent(sim.state, {
      ...sim.agent("mara"),
      needs: { ...sim.agent("mara").needs, hunger: 0 },
      starvingSinceTick: sim.state.tick - graceTicks,
    });
    setAgentHealth(sim, "mara", threshold + 0.0001);
    const callsBefore = sim.client.callCount;
    const [result] = await sim.advance();
    expect(result?.decidedAgentIds).toContain("mara");
    expect(sim.client.callCount).toBe(callsBefore + 1);
  });

  it("shows the dead to others as a body", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({ Mara: waitLong, Ilsa: waitLong }),
    });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", NEXT_TO_SQUARE);
    await sim.advance();
    applyDamage(contextOf(sim), "mara", { amount: LETHAL, killed: "starved", sourceId: null });
    sim.client.requests.length = 0;
    await sim.advance();
    const ilsaPrompt = sim.client.requests
      .filter((request) => findPromptAgentName(request) === "Ilsa")
      .map(promptOf)
      .join("\n");
    expect(ilsaPrompt).toContain("Mara's body");
    expect(sim.agent("ilsa").awareness.mara?.doing).toBe(config.death.doing);
  });

  it("files a body come upon later and gives an urgent decision", async () => {
    const sim = createTestSim({ agentIds: ["mara", "ilsa"], responder: scriptByAgent({}) });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", OUT_OF_SIGHT_OF_SQUARE);
    applyDamage(contextOf(sim), "mara", { amount: LETHAL, killed: "starved", sourceId: null });
    await sim.advance();
    expect(sim.streamTexts("ilsa").join("\n")).not.toContain("Mara");
    waitWithoutInterrupts(sim, "ilsa");
    sim.placeAgent("ilsa", NEXT_TO_SQUARE);
    const [result] = await sim.advance();
    expect(sim.streamTexts("ilsa")).toContain("I found Mara's body in the town square");
    expect(result?.decidedAgentIds).toContain("ilsa");
  });

  it("files a known body each time it comes into view, without an urgent decision", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({ Ilsa: waitLong }),
    });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", NEXT_TO_SQUARE);
    await sim.advance();
    applyDamage(contextOf(sim), "mara", { amount: LETHAL, killed: "starved", sourceId: null });
    await sim.advance();
    sim.placeAgent("ilsa", OUT_OF_SIGHT_OF_SQUARE);
    await sim.advance();
    waitWithoutInterrupts(sim, "ilsa");
    sim.placeAgent("ilsa", NEXT_TO_SQUARE);
    const [result] = await sim.advance();
    expect(sim.streamTexts("ilsa")).toContain("I saw Mara's body in the town square");
    expect(sim.streamTexts("ilsa").join("\n")).not.toContain("I found");
    expect(result?.decidedAgentIds).not.toContain("ilsa");
  });
});
