import { describe, expect, it } from "vitest";
import { readComponents } from "../../items/things";
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
