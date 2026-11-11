import { describe, expect, it } from "vitest";
import { addComponent } from "../items/thing-writes";
import { readNumberField, type ThingRef } from "../items/things";
import { getAgentRuntime } from "./agent-runtime";
import { buildRuleRun, contextOf, memoryTexts } from "./combat-test-kit";
import { applyEffect } from "./effects/effect-registry";
import { OPEN_GROUND, TOBIAS, placeThing, setUpRules } from "./rule-test-kit";
import type { TestSim } from "./test-sim";
import type { Effect } from "@village/shared";

/** Applies an effect as a rule fired on `self` would. */
function applyOn(sim: TestSim, self: ThingRef, effect: unknown) {
  const context = contextOf(sim);
  applyEffect({ ...buildRuleRun(context, null), self }, effect as Effect);
  return context;
}

describe("set", () => {
  it("writes a literal into a field, clamped to the field's bounds", () => {
    const sim = setUpRules();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    applyOn(sim, bench, { type: "set", field: "health.current", to: 1 });
    expect(readNumberField(sim.state, bench, "health.current")).toBe(1);
    applyOn(sim, bench, { type: "set", field: "health.current", to: 99 });
    expect(readNumberField(sim.state, bench, "health.current")).toBe(3);
  });

  it("skips a thing that lacks the component", () => {
    const sim = setUpRules();
    const field = placeThing(sim, "wheat_field", OPEN_GROUND);
    const context = applyOn(sim, field, { type: "set", field: "health.current", to: 0 });
    expect(context.result.changedEntityIds).toEqual([]);
  });
});

describe("change", () => {
  it("adds a number read from the thing's own component to a field", () => {
    const sim = setUpRules();
    const field = placeThing(sim, "wheat_field", OPEN_GROUND);
    applyOn(sim, field, { type: "set", field: "stock.amount", to: 1 });
    applyOn(sim, field, {
      type: "change",
      field: "stock.amount",
      by: { from: "self.regrows.perHour" },
    });
    expect(readNumberField(sim.state, field, "stock.amount")).toBe(1.5);
  });

  it("skips a thing without the field and clamps to the field's maximum", () => {
    const sim = setUpRules();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const unchanged = applyOn(sim, bench, { type: "change", field: "stock.amount", by: 1 });
    expect(unchanged.result.changedEntityIds).toEqual([]);
    applyOn(sim, bench, { type: "change", field: "health.current", by: 10 });
    expect(readNumberField(sim.state, bench, "health.current")).toBe(3);
  });
});

describe("announce", () => {
  it("makes an event whose subject is the thing, seen by those nearby", () => {
    const sim = setUpRules();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const context = applyOn(sim, bench, { type: "announce", text: "creaked" });
    expect(context.result.events).toHaveLength(1);
    expect(context.result.events[0]).toMatchObject({
      kind: "announced",
      description: "creaked",
      actorName: "the bench",
    });
  });

  it("is a living agent's own event: others see it, and the agent gets an urgent decision", () => {
    const sim = setUpRules();
    const context = applyOn(sim, TOBIAS, { type: "announce", text: "caught fire" });
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
      type: "announce",
      text: "was poisoned",
      isPrivate: true,
    });
    expect(context.result.events).toEqual([]);
    expect(sim.agent("tobias").workingMemory.at(-1)).toMatch(/I was poisoned/);
    expect(getAgentRuntime(sim.state, "tobias").pendingDecision).toEqual({
      reason: "I was poisoned",
      isUrgent: true,
    });
    expect(memoryTexts(sim, "mara")).toEqual(marasMemories);
    expect(sim.agent("mara").workingMemory.at(-1) ?? "").not.toMatch(/poisoned/);
  });

  it("says nothing for a private announcement on an entity or a dead body", () => {
    const sim = setUpRules();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const onBench = applyOn(sim, bench, { type: "announce", text: "hummed", isPrivate: true });
    expect(onBench.result.events).toEqual([]);
    sim.state.agents = sim.state.agents.map((agent) =>
      agent.id === "tobias"
        ? { ...agent, death: { tick: 0, cause: "x", sourceAgentId: null } }
        : agent,
    );
    const workingMemory = sim.agent("tobias").workingMemory;
    const onBody = applyOn(sim, TOBIAS, { type: "announce", text: "hummed", isPrivate: true });
    expect(onBody.result.events).toEqual([]);
    expect(sim.agent("tobias").workingMemory).toEqual(workingMemory);
  });

  it("is remembered by the poisoned agent only when the poison rules announce it", () => {
    const sim = setUpRules();
    addComponent(contextOf(sim), TOBIAS, "poisoned", { minutes: null });
    expect(sim.agent("tobias").workingMemory.at(-1)).toMatch(/I was poisoned/);
  });
});
