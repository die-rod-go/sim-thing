import { describe, expect, it } from "vitest";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import { giveEntity, setUpSteps } from "./steps/step-test-kit";
import { createDefaultSettings, restoreWorldState, toSavedWorld } from "../../src/sim/world-state";
import { startVerb } from "./verb-run-test-kit";

function saveWhileEating() {
  const sim = setUpSteps();
  const bread = giveEntity(sim, "mara", "bread");
  startVerb(sim, "mara", "eat", { items: [bread] });
  const saved = structuredClone(toSavedWorld(sim.state, createDefaultSettings()));
  return { sim, saved };
}

describe("restoring a saved world", () => {
  it("keeps a verb run whose verb is still where it was", () => {
    const { sim, saved } = saveWhileEating();
    const { state } = restoreWorldState(saved, sim.state.map, sim.state.items);
    expect(getAgentRuntime(state, "mara").verbRun?.verbName).toBe("eat");
    expect(state.agents.find((agent) => agent.id === "mara")?.currentAction?.verb).toBe("eat");
  });

  it("drops a verb run whose verb changed and clears the agent's action", () => {
    const { sim, saved } = saveWhileEating();
    const run = saved.runtime?.agentRuntimes.mara?.verbRun;
    if (!run) throw new Error("the save has no verb run");
    run.verbName = "devour";
    const { state } = restoreWorldState(saved, sim.state.map, sim.state.items);
    expect(getAgentRuntime(state, "mara").verbRun).toBeNull();
    expect(state.agents.find((agent) => agent.id === "mara")?.currentAction).toBeNull();
  });

  it("drops a verb run whose index no longer exists", () => {
    const { sim, saved } = saveWhileEating();
    const run = saved.runtime?.agentRuntimes.mara?.verbRun;
    if (!run) throw new Error("the save has no verb run");
    run.verbIndex = sim.state.items.verbs.length + 5;
    const { state } = restoreWorldState(saved, sim.state.map, sim.state.items);
    expect(getAgentRuntime(state, "mara").verbRun).toBeNull();
    expect(state.agents.find((agent) => agent.id === "mara")?.currentAction).toBeNull();
  });
});
