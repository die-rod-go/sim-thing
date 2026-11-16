import { describe, expect, it } from "vitest";
import { buildDecisionPrompt } from "../../src/decision/decision-prompt";
import { findEntity, findEntityIfPresent, listContents } from "../../src/items/entity-store";
import { listThings, viewThing, type ThingRef } from "../../src/items/things";
import {
  SQUARE,
  NEXT_TO_SQUARE,
  aim,
  buildCombatSim,
  finish,
  handOver,
  killAgent,
  lastFailure,
} from "./combat-test-kit";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import { buildDecisionContext, buildValidTargets } from "../../src/sim/context-builder";
import { runSteps } from "./steps/step-test-kit";
import { createTestSim, decisionReply, scriptByAgent, type TestSim } from "../../src/sim/test-sim";
import { toSavedWorld, restoreWorldState, createDefaultSettings } from "../../src/sim/world-state";

const TOBIAS_BODY = "Tobias's body";
const TOBIAS: ThingRef = { kind: "agent", agentId: "tobias" };
/** A working-memory line in a prompt: "- [6:01 am] I finished burying Tobias's body". */
const WORKING_MEMORY_LINE = /^- \[/;

/** Mara beside Tobias's body, which still carries a knife. */
async function setUpBody(): Promise<{ sim: TestSim; knifeId: string }> {
  const sim = buildCombatSim();
  sim.placeAgent("mara", SQUARE);
  sim.placeAgent("tobias", NEXT_TO_SQUARE);
  const knife = handOver(sim, "tobias", "knife");
  killAgent(sim, "tobias");
  await sim.advance();
  return { sim, knifeId: knife.id };
}

function bury(sim: TestSim): void {
  aim(sim, "mara", { verb: "bury", targetName: TOBIAS_BODY });
  if (sim.agent("mara").currentAction !== null) finish(sim, "mara");
}

/** Lines of Mara's prompt that show the body now, leaving out what she remembers of it. */
function listBodyLines(sim: TestSim): string[] {
  const prompt = buildDecisionPrompt(buildDecisionContext(sim.state, "mara", false));
  return prompt
    .split("\n")
    .filter((line) => line.includes(TOBIAS_BODY) && !WORKING_MEMORY_LINE.test(line));
}

function findGraveId(sim: TestSim): string {
  const graveId = sim.agent("tobias").bodyReplacedById;
  if (graveId === null) throw new Error("Tobias's body was not buried");
  return graveId;
}

describe("burying a body", () => {
  it("puts a grave on the body's tile and drops what the body carried there", async () => {
    const { sim, knifeId } = await setUpBody();
    const death = sim.agent("tobias").death;
    bury(sim);
    const grave = findEntity(sim.state, findGraveId(sim));
    expect(grave.definitionId).toBe("grave");
    expect(grave.label).toBeNull();
    const onTile = { kind: "tile", place: sim.agent("tobias").place, pos: NEXT_TO_SQUARE };
    expect(grave.location).toEqual(onTile);
    expect(findEntity(sim.state, knifeId).location).toEqual(onTile);
    expect(listContents(sim.state, "tobias")).toEqual([]);
    expect(sim.agent("tobias").death).toEqual(death);
  });

  it("takes the body out of the world: no longer a thing, in sight, in a prompt or a target", async () => {
    const { sim } = await setUpBody();
    expect(buildValidTargets(sim.state, sim.agent("mara")).agents).toContain(TOBIAS_BODY);
    expect(listBodyLines(sim)).not.toEqual([]);
    bury(sim);
    await sim.advance();
    expect(viewThing(sim.state, TOBIAS)).toBeNull();
    expect(listThings(sim.state)).not.toContainEqual(TOBIAS);
    expect(getAgentRuntime(sim.state, "mara").visibleAgentIds).not.toContain("tobias");
    expect(buildValidTargets(sim.state, sim.agent("mara")).agents).not.toContain(TOBIAS_BODY);
    expect(listBodyLines(sim)).toEqual([]);
    bury(sim);
    expect(lastFailure(sim, "mara")).toBe(
      `I tried to bury ${TOBIAS_BODY} but there was no ${TOBIAS_BODY} here`,
    );
  });

  it("leaves a living body as it is", () => {
    const sim = buildCombatSim();
    const result = runSteps(sim, [{ step: "transform", on: "target", into: "grave" }], {
      target: TOBIAS,
    });
    expect(result.failure).toBeNull();
    expect(sim.agent("tobias").bodyReplacedById).toBeNull();
    expect(viewThing(sim.state, TOBIAS)).not.toBeNull();
    expect(sim.state.entities.filter((entity) => entity.definitionId === "grave")).toEqual([]);
  });

  it("keeps the body gone through a save", async () => {
    const { sim } = await setUpBody();
    bury(sim);
    const saved = toSavedWorld(sim.state, createDefaultSettings());
    const { state } = restoreWorldState(
      JSON.parse(JSON.stringify(saved)),
      sim.state.map,
      sim.state.items,
    );
    expect(state.agents.find((agent) => agent.id === "tobias")?.bodyReplacedById).toBe(
      findGraveId(sim),
    );
  });

  it("buries a body an agent decides to bury, through the reply's target", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "tobias"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0
            ? decisionReply({ action: "interact", verb: "bury", target: TOBIAS_BODY })
            : undefined,
      }),
    });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("tobias", NEXT_TO_SQUARE);
    killAgent(sim, "tobias");
    await sim.advance(70);
    const graveId = findGraveId(sim);
    expect(findEntityIfPresent(sim.state, graveId)?.definitionId).toBe("grave");
  });
});
