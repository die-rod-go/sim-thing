import { describe, expect, it } from "vitest";
import { addComponent } from "../../src/items/thing-writes";
import { readNumberField, type ThingRef } from "../../src/items/things";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import { contextOf, memoryTexts } from "./combat-test-kit";
import { runRuleSteps } from "./steps/step-test-kit";
import { OPEN_GROUND, TOBIAS, placeThing, setUpRules } from "./rule-test-kit";
import type { TestSim } from "../../src/sim/test-sim";

/** Applies a step as a rule fired on `self` would. */
function applyOn(sim: TestSim, self: ThingRef, step: unknown) {
  return runRuleSteps(sim, self, [step]);
}

describe("set", () => {
  it("writes a literal into a field, clamped to the field's bounds", () => {
    const sim = setUpRules();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    applyOn(sim, bench, { step: "set", field: "health.current", to: 1 });
    expect(readNumberField(sim.state, bench, "health.current")).toBe(1);
    applyOn(sim, bench, { step: "set", field: "health.current", to: 99 });
    expect(readNumberField(sim.state, bench, "health.current")).toBe(3);
  });

  it("skips a thing that lacks the component", () => {
    const sim = setUpRules();
    const field = placeThing(sim, "wheat_field", OPEN_GROUND);
    const context = applyOn(sim, field, { step: "set", field: "health.current", to: 0 });
    expect(context.result.changedEntityIds).toEqual([]);
  });
});

describe("change", () => {
  it("adds a number read from the thing's own component to a field", () => {
    const sim = setUpRules();
    const tree = placeThing(sim, "apple_tree", OPEN_GROUND);
    applyOn(sim, tree, { step: "set", field: "stock.amount", to: 1 });
    applyOn(sim, tree, {
      step: "change",
      field: "stock.amount",
      by: { from: "self.regrows.perHour" },
    });
    expect(readNumberField(sim.state, tree, "stock.amount")).toBe(1.2);
  });

  it("skips a thing without the field and clamps to the field's maximum", () => {
    const sim = setUpRules();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const unchanged = applyOn(sim, bench, { step: "change", field: "stock.amount", by: 1 });
    expect(unchanged.result.changedEntityIds).toEqual([]);
    applyOn(sim, bench, { step: "change", field: "health.current", by: 10 });
    expect(readNumberField(sim.state, bench, "health.current")).toBe(3);
  });
});

describe("announce", () => {
  it("makes an event whose subject is the thing, seen by those nearby", () => {
    const sim = setUpRules();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const context = applyOn(sim, bench, { step: "announce", text: "creaked" });
    expect(context.result.events).toHaveLength(1);
    expect(context.result.events[0]).toMatchObject({
      kind: "announced",
      description: "creaked",
      actorName: "the bench",
    });
  });

  it("is a living agent's own event: others see it, and the agent gets an urgent decision", () => {
    const sim = setUpRules();
    const context = applyOn(sim, TOBIAS, { step: "announce", text: "caught fire" });
    expect(context.result.events[0]).toMatchObject({
      actorId: "tobias",
      description: "caught fire",
    });
    expect(getAgentRuntime(sim.state, "tobias").pendingDecision).toEqual({
      reason: "I caught fire",
      isUrgent: true,
    });
  });

  it("keeps a private announcement on a living agent to themselves, in the first person", () => {
    const sim = setUpRules();
    const marasMemories = memoryTexts(sim, "mara");
    const context = applyOn(sim, TOBIAS, {
      step: "announce",
      text: "was poisoned",
      isPrivate: true,
    });
    expect(context.result.events).toEqual([]);
    expect(sim.streamTexts("tobias").at(-1)).toMatch(/I was poisoned/);
    expect(getAgentRuntime(sim.state, "tobias").pendingDecision).toEqual({
      reason: "I was poisoned",
      isUrgent: true,
    });
    expect(memoryTexts(sim, "mara")).toEqual(marasMemories);
    expect(sim.streamTexts("mara").at(-1) ?? "").not.toMatch(/poisoned/);
  });

  it("says nothing for a private announcement on an entity or a dead body", () => {
    const sim = setUpRules();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const onBench = applyOn(sim, bench, { step: "announce", text: "hummed", isPrivate: true });
    expect(onBench.result.events).toEqual([]);
    sim.state.agents = sim.state.agents.map((agent) =>
      agent.id === "tobias" ? { ...agent, death: { tick: 0, cause: "x", sourceId: null } } : agent,
    );
    const streamBefore = sim.streamTexts("tobias");
    const onBody = applyOn(sim, TOBIAS, { step: "announce", text: "hummed", isPrivate: true });
    expect(onBody.result.events).toEqual([]);
    expect(sim.streamTexts("tobias")).toEqual(streamBefore);
  });

  it("is remembered by the poisoned agent only when the poison rules announce it", () => {
    const sim = setUpRules();
    addComponent(contextOf(sim), TOBIAS, "poisoned", { minutes: null });
    expect(sim.streamTexts("tobias").at(-1)).toMatch(/I was poisoned/);
  });
});
