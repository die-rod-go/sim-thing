import { describe, expect, it } from "vitest";
import { config } from "../config";
import { replaceEntity } from "../items/entity-store";
import type { FakeReply } from "../llm/fake-llm-client";
import { getAgentRuntime } from "./agent-runtime";
import { applyDamage } from "./damage";
import { createNoReflectionHook } from "./reflection-hook";
import {
  createTestSim,
  decisionReply,
  findEntityByLabel,
  findPromptAgentName,
  promptOf,
  scriptByAgent,
  type TestSim,
} from "./test-sim";
import type { TickContext } from "./tick-context";
import { replaceAgent } from "./world-access";
import { createEmptyTickResult } from "./world-state";

const SQUARE = { x: 19, y: 15 };
const NEXT_TO_SQUARE = { x: 20, y: 15 };
const MINUTES_PER_HOUR = 60;
const LETHAL = 2;

function contextOf(sim: TestSim): TickContext {
  return {
    state: sim.state,
    result: createEmptyTickResult(sim.state.tick),
    dependencies: {
      callStructured: sim.llm.callStructured,
      reflectionHook: createNoReflectionHook(),
    },
  };
}

function waitLong() {
  return decisionReply({ action: "wait", minutes: config.decision.maxWaitMinutes });
}

function settleReplies(): Promise<void> {
  return new Promise((resolveSettled) => setTimeout(resolveSettled, 0));
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
      sourceAgentId: "ilsa",
    });
    const mara = sim.agent("mara");
    expect(mara.health).toBe(0);
    expect(mara.death).toEqual({
      tick: sim.state.tick,
      cause: "stabbed by Ilsa",
      sourceAgentId: "ilsa",
    });
    expect(context.result.events.map((event) => event.kind)).toContain("died");
    expect(context.result.moments).toContainEqual(
      expect.objectContaining({ kind: "died", agentId: "mara", cause: "stabbed by Ilsa" }),
    );
  });

  it("gives witnesses a seen memory and an urgent decision", async () => {
    const sim = createTestSim({ agentIds: ["mara", "ilsa"], responder: scriptByAgent({}) });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", NEXT_TO_SQUARE);
    await sim.advance();
    applyDamage(contextOf(sim), "mara", { amount: LETHAL, killed: "starved", sourceAgentId: null });
    const witnessed = sim.state.memoryStore.listByAgent("ilsa").map((memory) => memory.text);
    expect(witnessed).toContain("I saw that Mara died");
    expect(getAgentRuntime(sim.state, "ilsa").pendingDecision?.isUrgent).toBe(true);
    expect(sim.state.memoryStore.listByAgent("mara").map((memory) => memory.text)).not.toContain(
      "I died",
    );
  });

  it("cancels the current action and leaves the object's users", async () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
    const table = findEntityByLabel(sim.state, "card table");
    replaceEntity(sim.state, { ...table, state: { ...table.state, userIds: ["mara"] } });
    replaceAgent(sim.state, {
      ...sim.agent("mara"),
      currentAction: { kind: "interact", target: "card table", verb: "play cards", endsAtTick: 30 },
    });
    getAgentRuntime(sim.state, "mara").verbRun = {
      agentId: "mara",
      verb: "play cards",
      usedEntityId: table.id,
      usedDefinitionId: table.definitionId,
      usedName: "card table",
      startedAtTick: 0,
    };
    applyDamage(contextOf(sim), "mara", { amount: LETHAL, killed: "starved", sourceAgentId: null });
    expect(sim.agent("mara").currentAction).toBeNull();
    expect(findEntityByLabel(sim.state, "card table").state.userIds ?? []).not.toContain("mara");
  });

  it("drops a decision still in flight when it arrives", async () => {
    const releases: ((reply: FakeReply) => void)[] = [];
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: () => new Promise<FakeReply>((resolveReply) => releases.push(resolveReply)),
      shouldDecideInBackground: true,
    });
    sim.placeAgent("mara", SQUARE);
    await sim.advance();
    expect(releases).toHaveLength(1);
    applyDamage(contextOf(sim), "mara", { amount: LETHAL, killed: "starved", sourceAgentId: null });
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
    applyDamage(contextOf(sim), "mara", { amount: LETHAL, killed: "starved", sourceAgentId: null });
    const needsAtDeath = sim.agent("mara").needs;
    await sim.advance(MINUTES_PER_HOUR);
    expect(sim.agent("mara").needs).toEqual(needsAtDeath);
    expect(sim.agent("mara").health).toBe(0);
    expect(sim.client.callCount).toBe(0);
  });

  it("starves to death once starvation has drained all health", async () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({ Mara: waitLong }) });
    const graceTicks = config.health.starvationGraceHours * MINUTES_PER_HOUR;
    replaceAgent(sim.state, {
      ...sim.agent("mara"),
      needs: { ...sim.agent("mara").needs, hunger: 0 },
      starvingSinceTick: -graceTicks,
      health: 0.0001,
    });
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
      health: threshold + 0.0001,
    });
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
    applyDamage(contextOf(sim), "mara", { amount: LETHAL, killed: "starved", sourceAgentId: null });
    sim.client.requests.length = 0;
    await sim.advance();
    const ilsaPrompt = sim.client.requests
      .filter((request) => findPromptAgentName(request) === "Ilsa")
      .map(promptOf)
      .join("\n");
    expect(ilsaPrompt).toContain("Mara's body");
    expect(sim.agent("ilsa").awareness.mara?.doing).toBe(config.death.doing);
  });
});
