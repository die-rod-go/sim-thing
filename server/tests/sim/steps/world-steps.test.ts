import { describe, expect, it } from "vitest";
import { STEP_TYPES } from "@village/shared";
import { config } from "../../../src/config";
import { isAsleep } from "../../../src/economy/sleep";
import { createEntity } from "../../../src/items/entity-store";
import { readComponents } from "../../../src/items/things";
import { getAgentRuntime } from "../../../src/sim/agent-runtime";
import { handOver } from "../combat-test-kit";
import { OPEN_GROUND, TOBIAS, placeThing } from "../rule-test-kit";
import { applyStep, findStepRefusal, isStepBuilt } from "../../../src/sim/steps/step-registry";
import {
  buildStepRun,
  buildVerbRun,
  parseSteps,
  runRuleSteps,
  runSteps,
  setUpSteps,
} from "./step-test-kit";
import { contextOf } from "../combat-test-kit";

function setNeed(sim: ReturnType<typeof setUpSteps>, agentId: string, need: "fun", value: number) {
  sim.state.agents = sim.state.agents.map((agent) =>
    agent.id === agentId ? { ...agent, needs: { ...agent.needs, [need]: value } } : agent,
  );
}

describe("the registry", () => {
  it("has every step type built", () => {
    for (const type of STEP_TYPES) expect(isStepBuilt(type)).toBe(true);
  });

  it("refuses to run a verb-only step in a rule", () => {
    const sim = setUpSteps();
    expect(() =>
      runRuleSteps(sim, TOBIAS, [{ step: "check", if: { has: "alive" }, otherwise: "no" }]),
    ).toThrow(/only works in verbs/);
  });
});

describe("wait", () => {
  it("pauses for the minutes, rounded up to whole ticks and at least one", () => {
    const sim = setUpSteps();
    const run = buildStepRun(contextOf(sim), buildVerbRun(sim));
    const [long, none] = parseSteps([
      { step: "wait", minutes: 90 },
      { step: "wait", minutes: 0 },
    ]);
    if (!long || !none) throw new Error("expected two steps");
    const perTick = config.clock.minutesPerTick;
    expect(applyStep(run, long)).toEqual({
      kind: "pause",
      untilTick: sim.state.tick + Math.ceil(90 / perTick),
    });
    expect(applyStep(run, none)).toEqual({ kind: "pause", untilTick: sim.state.tick + 1 });
  });

  it("takes no time when done in passing", () => {
    const sim = setUpSteps();
    const result = runSteps(sim, [{ step: "wait", minutes: 5 }], { isInPassing: true });
    expect(result.pauseCount).toBe(0);
  });
});

describe("sleep", () => {
  it("puts the user to sleep in the bed, tells onlookers, and pauses until woken", () => {
    const sim = setUpSteps();
    const bed = createEntity(sim.state, "bed", { kind: "tile", place: "x", pos: OPEN_GROUND });
    const run = buildStepRun(contextOf(sim), buildVerbRun(sim, { items: [bed] }));
    const [step] = parseSteps([{ step: "sleep", minutes: { from: "choice.minutes" } }]);
    if (!step) throw new Error("expected a step");
    expect(applyStep(run, step)).toEqual({ kind: "pause", untilTick: null });
    expect(isAsleep(sim.agent("mara"))).toBe(true);
    expect(run.context.result.events).toMatchObject([
      { kind: "fell_asleep", description: "fell asleep in the bed", targetId: bed.id },
    ]);
    expect(findStepRefusal(run, step)).toBe("I'm already asleep");
  });

  it("naps for the minutes the decision chose", () => {
    const sim = setUpSteps();
    const bed = createEntity(sim.state, "bed", { kind: "tile", place: "x", pos: OPEN_GROUND });
    const run = buildStepRun(
      contextOf(sim),
      buildVerbRun(sim, { items: [bed], choice: { minutes: 30 } }),
    );
    const [step] = parseSteps([{ step: "sleep", minutes: { from: "choice.minutes" } }]);
    if (!step) throw new Error("expected a step");
    const outcome = applyStep(run, step);
    expect(outcome).toEqual({
      kind: "pause",
      untilTick: sim.state.tick + Math.ceil(30 / config.clock.minutesPerTick),
    });
  });

  it("refuses a nap of no minutes", () => {
    const sim = setUpSteps();
    const bed = createEntity(sim.state, "bed", { kind: "tile", place: "x", pos: OPEN_GROUND });
    const result = runSteps(sim, [{ step: "sleep", minutes: { from: "choice.minutes" } }], {
      items: [bed],
      choice: { minutes: 0 },
    });
    expect(result.failure).toBe("A nap needs a positive number of minutes");
  });
});

describe("roll_hit", () => {
  const CHANCE = { step: "roll_hit", chance: 0.5 };

  it("hits on a low roll and misses on a high one", () => {
    const hit = runSteps(setUpSteps(0), [CHANCE], { target: TOBIAS });
    expect(hit.run.verbRun?.isHit).toBe(true);
    const miss = runSteps(setUpSteps(0.99), [CHANCE], { target: TOBIAS });
    expect(miss.run.verbRun?.isHit).toBe(false);
  });

  it("always hits an entity, a sleeper and the user itself", () => {
    const sim = setUpSteps(0.99);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    expect(runSteps(sim, [CHANCE], { target: bench }).run.verbRun?.isHit).toBe(true);
    expect(
      runSteps(sim, [CHANCE], { target: { kind: "agent", agentId: "mara" } }).run.verbRun?.isHit,
    ).toBe(true);
    const bed = createEntity(sim.state, "bed", { kind: "tile", place: "x", pos: OPEN_GROUND });
    runSteps(sim, [{ step: "sleep" }], { agentId: "tobias", items: [bed] });
    expect(runSteps(sim, [CHANCE], { target: TOBIAS }).run.verbRun?.isHit).toBe(true);
  });

  it("reads its chance from the item", () => {
    const sim = setUpSteps(0.6);
    const knife = handOver(sim, "mara", "knife");
    const steps = [{ step: "roll_hit", chance: { from: "item.weapon.hitChance" } }];
    const result = runSteps(sim, steps, { items: [knife], target: TOBIAS });
    expect(result.run.verbRun?.isHit).toBe(true);
  });

  it("skips later steps on a miss unless they say evenOnMiss", () => {
    const sim = setUpSteps(0.99);
    setNeed(sim, "mara", "fun", 0.5);
    runSteps(
      sim,
      [
        CHANCE,
        { step: "change_need", on: "user", need: "fun", amount: 0.2 },
        { step: "change_need", on: "user", need: "fun", amount: -0.1, evenOnMiss: true },
      ],
      { target: TOBIAS },
    );
    expect(sim.agent("mara").needs.fun).toBeCloseTo(0.4);
  });
});

describe("send, sound and change_need", () => {
  it("sends a stimulus that sets matching rules off, read from the item's field", () => {
    const sim = setUpSteps(0);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    runSteps(sim, [{ step: "send", on: "target", stimulus: "fire" }], { target: bench });
    expect(readComponents(sim.state, bench)).toHaveProperty("burning");
    const knife = handOver(sim, "mara", "knife");
    runSteps(sim, [{ step: "send", on: "target", stimulus: { from: "item.weapon.stimulus" } }], {
      items: [knife],
      target: TOBIAS,
    });
    expect(readComponents(sim.state, TOBIAS)).toHaveProperty("bleeding");
  });

  it("makes a sound from where the thing is", () => {
    const sim = setUpSteps();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const result = runSteps(sim, [{ step: "sound", on: "target", loudness: 7 }], { target: bench });
    expect(result.context.result.events).toMatchObject([
      { kind: "sound", description: config.steps.soundDescription, loudness: 7 },
    ]);
  });

  it("adds to a living agent's need and skips things that are not agents", () => {
    const sim = setUpSteps();
    setNeed(sim, "mara", "fun", 0.5);
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const steps = [{ step: "change_need", on: "target", need: "fun", amount: 0.2 }];
    expect(runSteps(sim, steps, { target: bench }).failure).toBeNull();
    runSteps(sim, [{ step: "change_need", on: "user", need: "fun", amount: 0.2 }]);
    expect(sim.agent("mara").needs.fun).toBeCloseTo(0.7);
  });

  it("adds more for each other agent running a verb on the same item", () => {
    const sim = setUpSteps();
    const table = createEntity(sim.state, "card_table", {
      kind: "tile",
      place: "x",
      pos: OPEN_GROUND,
    });
    setNeed(sim, "mara", "fun", 0.5);
    getAgentRuntime(sim.state, "tobias").verbRun = buildVerbRun(sim, {
      agentId: "tobias",
      items: [table],
    });
    runSteps(
      sim,
      [{ step: "change_need", on: "user", need: "fun", amount: 0.2, perOtherUser: 0.1 }],
      { items: [table] },
    );
    expect(sim.agent("mara").needs.fun).toBeCloseTo(0.8);
  });
});

describe("chance and nearby", () => {
  it("skips a step on a failed chance roll and runs it on a passed one", () => {
    const failing = setUpSteps(0.9);
    const bench = placeThing(failing, "bench", OPEN_GROUND);
    runRuleSteps(failing, bench, [{ step: "add", component: "wet", chance: 0.5 }]);
    expect(readComponents(failing.state, bench)).not.toHaveProperty("wet");
    const passing = setUpSteps(0.1);
    const other = placeThing(passing, "bench", OPEN_GROUND);
    runRuleSteps(passing, other, [{ step: "add", component: "wet", chance: 0.5 }]);
    expect(readComponents(passing.state, other)).toHaveProperty("wet");
  });

  it("runs on every thing within the radius of self, not self, each with its own roll", () => {
    const sim = setUpSteps(0.1);
    const center = placeThing(sim, "bench", OPEN_GROUND);
    const near = placeThing(sim, "bench", { x: OPEN_GROUND.x + 1, y: OPEN_GROUND.y });
    const far = placeThing(sim, "bench", { x: OPEN_GROUND.x + 3, y: OPEN_GROUND.y });
    const step = { step: "add", on: "nearby", radius: 1, component: "wet", chance: 0.5 };
    runRuleSteps(sim, center, [step]);
    expect(readComponents(sim.state, near)).toHaveProperty("wet");
    expect(readComponents(sim.state, far)).not.toHaveProperty("wet");
    expect(readComponents(sim.state, center)).not.toHaveProperty("wet");

    const missing = setUpSteps(0.9);
    const lonely = placeThing(missing, "bench", OPEN_GROUND);
    const neighbor = placeThing(missing, "bench", { x: OPEN_GROUND.x + 1, y: OPEN_GROUND.y });
    runRuleSteps(missing, lonely, [step]);
    expect(readComponents(missing.state, neighbor)).not.toHaveProperty("wet");
  });

  it("measures nearby from the thing a verb names with around", () => {
    const sim = setUpSteps();
    const bench = placeThing(sim, "bench", OPEN_GROUND);
    const neighbor = placeThing(sim, "bench", { x: OPEN_GROUND.x + 1, y: OPEN_GROUND.y });
    runSteps(sim, [{ step: "add", on: "nearby", radius: 1, around: "target", component: "wet" }], {
      target: bench,
    });
    expect(readComponents(sim.state, neighbor)).toHaveProperty("wet");
    expect(readComponents(sim.state, bench)).not.toHaveProperty("wet");
  });
});
