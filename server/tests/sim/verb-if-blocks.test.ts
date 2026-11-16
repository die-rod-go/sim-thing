import { describe, expect, it } from "vitest";
import { readComponents } from "../../src/items/things";
import { addVerbs, handOver } from "./combat-test-kit";
import { setUpSteps } from "./steps/step-test-kit";
import type { TestSim } from "../../src/sim/test-sim";
import { currentRun, resumeVerb, startVerb } from "./verb-run-test-kit";

const MARA = { kind: "agent", agentId: "mara" } as const;

const MULL = {
  name: "mull",
  appliesTo: { has: "food" },
  steps: [
    { step: "if", on: "item", if: { has: "rotten" } },
    { step: "wait", minutes: 30, loudness: 8 },
    { step: "add", on: "user", component: "wet" },
    { step: "else" },
    { step: "wait", minutes: 5, loudness: 2 },
    { step: "add", on: "user", component: "burning" },
    { step: "end_if" },
  ],
  phrases: { ongoing: "mulling over {item}", done: "mulled over {item}", attempt: "mull {item}" },
};

function setUpMull(): TestSim {
  const sim = setUpSteps();
  addVerbs(sim, [MULL]);
  return sim;
}

describe("a verb that waits inside an if block", () => {
  it("is heard by the wait of the branch that ran, and resumes in that branch", () => {
    const sim = setUpMull();
    const bread = handOver(sim, "mara", "bread");
    const started = startVerb(sim, "mara", "mull", { items: [bread] });
    expect(started.result.events).toMatchObject([{ kind: "action_started", loudness: 2 }]);
    resumeVerb(sim, "mara");
    expect(readComponents(sim.state, MARA)).toHaveProperty("burning");
    expect(readComponents(sim.state, MARA)).not.toHaveProperty("wet");
    expect(currentRun(sim, "mara")).toBeNull();
  });

  it("skips the else branch after resuming in the first branch", () => {
    const sim = setUpMull();
    const spoiled = handOver(sim, "mara", "spoiled_food");
    const started = startVerb(sim, "mara", "mull", { items: [spoiled] });
    expect(started.result.events).toMatchObject([{ kind: "action_started", loudness: 8 }]);
    resumeVerb(sim, "mara");
    expect(readComponents(sim.state, MARA)).toHaveProperty("wet");
    expect(readComponents(sim.state, MARA)).not.toHaveProperty("burning");
    expect(currentRun(sim, "mara")).toBeNull();
  });
});
