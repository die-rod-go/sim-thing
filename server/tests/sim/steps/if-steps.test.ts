import { describe, expect, it } from "vitest";
import { readComponents } from "../../../src/items/things";
import { handOver } from "../combat-test-kit";
import { TOBIAS } from "../rule-test-kit";
import { runRuleSteps, runSteps, setUpSteps } from "./step-test-kit";

const MARA = { kind: "agent", agentId: "mara" } as const;

const WET_IF_ROTTEN = [
  { step: "if", on: "item", if: { has: "rotten" } },
  { step: "add", on: "user", component: "wet" },
  { step: "else" },
  { step: "add", on: "user", component: "burning" },
  { step: "end_if" },
];

describe("if blocks", () => {
  it("runs the first branch when the thing matches", () => {
    const sim = setUpSteps();
    const spoiled = handOver(sim, "mara", "spoiled_food");
    runSteps(sim, WET_IF_ROTTEN, { items: [spoiled] });
    expect(readComponents(sim.state, MARA)).toHaveProperty("wet");
    expect(readComponents(sim.state, MARA)).not.toHaveProperty("burning");
  });

  it("runs the else branch when the thing doesn't match", () => {
    const sim = setUpSteps();
    const bread = handOver(sim, "mara", "bread");
    runSteps(sim, WET_IF_ROTTEN, { items: [bread] });
    expect(readComponents(sim.state, MARA)).not.toHaveProperty("wet");
    expect(readComponents(sim.state, MARA)).toHaveProperty("burning");
  });

  it("judges an item already destroyed as it was last seen", () => {
    const sim = setUpSteps();
    const spoiled = handOver(sim, "mara", "spoiled_food");
    runSteps(sim, [{ step: "destroy", on: "item" }, ...WET_IF_ROTTEN], { items: [spoiled] });
    expect(readComponents(sim.state, MARA)).toHaveProperty("wet");
  });

  it("checks up front only the branch that matches", () => {
    const sim = setUpSteps();
    const bread = handOver(sim, "mara", "bread");
    const result = runSteps(
      sim,
      [
        { step: "if", on: "item", if: { has: "rotten" } },
        { step: "check", on: "user", if: { has: "rotten" }, otherwise: "never" },
        { step: "end_if" },
      ],
      { items: [bread] },
    );
    expect(result.failure).toBeNull();
  });

  it("doesn't judge up front an if on a name not picked yet", () => {
    const sim = setUpSteps();
    handOver(sim, "mara", "spoiled_food");
    const result = runSteps(sim, [
      { step: "require", in: "user", rule: { has: "rotten" }, as: "meal" },
      { step: "if", on: "meal", if: { has: "rotten" } },
      { step: "add", on: "user", component: "wet" },
      { step: "else" },
      { step: "check", on: "user", if: { has: "rotten" }, otherwise: "never" },
      { step: "end_if" },
    ]);
    expect(result.failure).toBeNull();
    expect(readComponents(sim.state, MARA)).toHaveProperty("wet");
  });

  it("refuses a branch reading a choice not given, once an earlier step led into it", () => {
    const sim = setUpSteps();
    const result = runSteps(sim, [
      { step: "add", on: "user", component: "wet" },
      { step: "if", on: "user", if: { has: "wet" } },
      { step: "wait", minutes: { from: "choice.minutes" } },
      { step: "end_if" },
    ]);
    expect(result.failure).toBe("I didn't say how long");
  });

  it("runs nested blocks, skipping the inner block with its outer branch", () => {
    const sim = setUpSteps();
    const bread = handOver(sim, "mara", "bread");
    runSteps(
      sim,
      [
        { step: "if", on: "item", if: { has: "rotten" } },
        { step: "if", on: "item", if: { has: "food" } },
        { step: "add", on: "user", component: "wet" },
        { step: "end_if" },
        { step: "else" },
        { step: "if", on: "item", if: { has: "food" } },
        { step: "add", on: "user", component: "burning" },
        { step: "end_if" },
        { step: "end_if" },
      ],
      { items: [bread] },
    );
    expect(readComponents(sim.state, MARA)).not.toHaveProperty("wet");
    expect(readComponents(sim.state, MARA)).toHaveProperty("burning");
  });

  it("follows blocks in a rule, judged on self", () => {
    const sim = setUpSteps();
    runRuleSteps(sim, TOBIAS, [
      { step: "if", if: { has: "wet" } },
      { step: "add", component: "burning" },
      { step: "else" },
      { step: "add", component: "wet" },
      { step: "end_if" },
    ]);
    expect(readComponents(sim.state, TOBIAS)).toHaveProperty("wet");
    expect(readComponents(sim.state, TOBIAS)).not.toHaveProperty("burning");
  });
});
