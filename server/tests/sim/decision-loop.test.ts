import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { countHeld, createEntity, listContents, locateInside } from "../../src/items/entity-store";
import { createFakeResponder } from "../../src/llm/fake-responder";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import { SimLoop } from "../../src/sim/loop";
import { ManualScheduler } from "../../src/sim/manual-scheduler";
import { createDecisionStrategy } from "../../src/sim/tick-pipeline";
import {
  createTestSim,
  decisionReply,
  findPromptAgentName,
  interruptDuringWait,
  promptOf,
  scriptByAgent,
} from "../../src/sim/test-sim";

const SQUARE = { x: 19, y: 15 };
const NEXT_TO_OVEN = { x: 4, y: 13 };

type TestSim = ReturnType<typeof createTestSim>;

function findOven(sim: TestSim) {
  const oven = sim.state.entities.find((entity) => entity.definitionId === "oven");
  if (oven === undefined) throw new Error("The seeded world has no oven");
  return oven;
}

function loadOvenWithBakingSupplies(sim: TestSim): void {
  const oven = findOven(sim);
  for (const definitionId of ["flour", "flour", "water"]) {
    createEntity(sim.state, definitionId, locateInside(oven.id));
  }
}

function countInOven(sim: TestSim, definitionId: string): number {
  return listContents(sim.state, findOven(sim).id).filter(
    (entity) => entity.definitionId === definitionId,
  ).length;
}

describe("decision loop", () => {
  it("an agent with no action gets a decision and walks to the chosen place", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0 ? decisionReply({ action: "walk_to", target: "town square" }) : undefined,
      }),
    });
    sim.placeAgent("mara", { x: 6, y: 14 });
    await sim.advance();
    expect(sim.agent("mara").currentAction).toMatchObject({
      kind: "walk_to",
      target: "town square",
    });
    expect(sim.records[0]).toMatchObject({ kind: "decision", agentId: "mara", tick: 0 });
    await sim.advance(40);
    expect(sim.agent("mara").place).toBe("town square");
    const kinds = sim.results.flatMap((result) => result.events.map((event) => event.kind));
    expect(kinds).toContain("walk_started");
    expect(kinds).toContain("arrived");
    expect(sim.streamTexts("mara")).toContain("I arrived at the town square");
  });

  it("tells an interrupted agent what flagged the decision", async () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
    sim.placeAgent("mara", SQUARE);
    interruptDuringWait(sim, "mara", 60);
    await sim.advance();
    expect(sim.records[0]?.prompt).toMatch(/^Just now: a test interruption\.$/m);
  });

  it("the clock waits for every pending decision", async () => {
    const releases: (() => void)[] = [];
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: (request) =>
        new Promise((resolveReply) => {
          releases.push(() =>
            resolveReply(
              decisionReply({
                action: "wait",
                minutes: 30,
                intention: findPromptAgentName(request),
              }),
            ),
          );
        }),
    });
    const loop = new SimLoop({
      state: sim.state,
      advanceTick: createDecisionStrategy({
        callStructured: sim.llm.callStructured,
      }),
      scheduler: new ManualScheduler(),
      isPaused: true,
    });
    loop.start();
    const stepping = loop.step();
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    expect(releases).toHaveLength(2);
    expect(sim.llm.limiter.inFlightCount).toBe(2);
    releases[0]?.();
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    expect(sim.state.tick).toBe(0);
    releases[1]?.();
    await stepping;
    expect(sim.state.tick).toBe(1);
  });

  it("an invalid reply falls back to wait and is still logged", async () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: () => "not json" });
    await sim.advance();
    expect(sim.agent("mara").currentAction).toEqual({
      kind: "wait",
      endsAtTick: config.decision.defaultWaitMinutes,
    });
    expect(sim.records).toHaveLength(config.llm.attemptsPerCall);
    expect(sim.records.every((record) => record.error?.startsWith("invalid JSON"))).toBe(true);
  });

  it("interact without an interaction asks a second question", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: (request, callIndex) => {
        if (request.schemaName === "interact_reply") return JSON.stringify({ verb: "bake bread" });
        return callIndex === 0
          ? decisionReply({ action: "interact", item: "oven" })
          : decisionReply({ action: "continue" });
      },
    });
    sim.placeAgent("mara", NEXT_TO_OVEN);
    loadOvenWithBakingSupplies(sim);
    await sim.advance();
    expect(sim.client.requests[1]?.schemaName).toBe("interact_reply");
    expect(promptOf(sim.client.requests[1]!)).toContain("bake bread");
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "interact", verb: "bake bread" });
    expect(countInOven(sim, "flour")).toBe(0);
    expect(countInOven(sim, "water")).toBe(0);
    expect(sim.results[0]?.events[0]?.description).toBe("started baking bread at the oven");
    await sim.advance(90);
    expect(countInOven(sim, "bread")).toBe(4);
  });

  it("declining every verb in the follow-up fails the interact with its reason", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: (request, callIndex) => {
        if (request.schemaName === "interact_reply") {
          return JSON.stringify({ verb: config.verbs.declineVerbName });
        }
        return callIndex === 0
          ? decisionReply({ action: "interact", item: "oven", verb: "dance" })
          : decisionReply({ action: "continue" });
      },
    });
    sim.placeAgent("mara", NEXT_TO_OVEN);
    await sim.advance();
    expect(sim.client.requests[1]?.schemaName).toBe("interact_reply");
    expect(sim.agent("mara").currentAction?.kind).not.toBe("interact");
    expect(getAgentRuntime(sim.state, "mara").lastFailure).toContain("doesn't do 'dance'");
  });

  it("interact with the thing named only as target uses it as the item", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: (_request, callIndex) =>
        callIndex === 0
          ? decisionReply({ action: "interact", target: "oven", verb: "bake bread" })
          : decisionReply({ action: "continue" }),
    });
    sim.placeAgent("mara", NEXT_TO_OVEN);
    loadOvenWithBakingSupplies(sim);
    await sim.advance();
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "interact", verb: "bake bread" });
  });

  it("interact uses a carried item named as item, oldest first", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0
            ? decisionReply({ action: "interact", item: "bread", verb: "eat" })
            : undefined,
      }),
    });
    const breadBefore = countHeld(sim.state, "mara", "bread");
    await sim.advance();
    expect(sim.agent("mara").currentAction).toMatchObject({ verb: "eat", target: "bread" });
    expect(countHeld(sim.state, "mara", "bread")).toBe(breadBefore - 1);
  });

  it("the fake responder eats something carried when hungry", async () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: createFakeResponder() });
    const mara = sim.agent("mara");
    sim.state.agents[0] = { ...mara, needs: { ...mara.needs, hunger: 0.2 } };
    await sim.advance();
    expect(sim.agent("mara").currentAction).toMatchObject({ verb: "eat" });
  });

  it("interact walks to the object first, then starts", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0
            ? decisionReply({ action: "interact", item: "oven", verb: "bake bread" })
            : undefined,
      }),
    });
    sim.placeAgent("mara", { x: 8, y: 15 });
    loadOvenWithBakingSupplies(sim);
    await sim.advance();
    expect(sim.agent("mara").currentAction).toMatchObject({ kind: "walk_to", target: "oven" });
    await sim.advance(12);
    expect(sim.agent("mara").currentAction).toMatchObject({ verb: "bake bread" });
  });

  it("a give to an agent out of reach fails in the world and is remembered", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0
            ? decisionReply({ action: "give", target: "Ilsa", item: "bread", amount: 1 })
            : undefined,
      }),
    });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", { x: SQUARE.x + 4, y: SQUARE.y });
    await sim.advance();
    const failure =
      "I tried to hand Ilsa 1 bread but Ilsa is too far away to hand anything to: I have to be right next to them";
    expect(countHeld(sim.state, "mara", "bread")).toBe(2);
    expect(sim.streamTexts("mara").at(-1)).toBe(failure);
    expect(sim.agent("mara").currentAction).toBeNull();
    await sim.advance();
    const secondPrompt = promptOf(
      sim.client.requests.filter((request) => findPromptAgentName(request) === "Mara")[1]!,
    );
    expect(secondPrompt).toContain(`What just went wrong: ${failure}`);
  });

  it("lets a bystander remember why a give failed", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa", "tobias"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0
            ? decisionReply({ action: "give", target: "Ilsa", item: "bread", amount: 1 })
            : undefined,
      }),
    });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", { x: SQUARE.x + 4, y: SQUARE.y });
    sim.placeAgent("tobias", { x: SQUARE.x, y: SQUARE.y + 1 });
    await sim.advance();
    expect(sim.streamTexts("tobias")).toContain(
      "I saw that Mara tried to hand Ilsa 1 bread, but Ilsa is too far away to hand anything to: they have to be right next to them",
    );
  });

  it("a need crossing its threshold triggers a decision", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: () => decisionReply({ action: "continue" }),
    });
    const mara = sim.agent("mara");
    sim.state.agents[0] = {
      ...mara,
      needs: { ...mara.needs, hunger: config.needs.decisionThreshold + 0.0001 },
      currentAction: { kind: "wait", endsAtTick: 200 },
    };
    await sim.advance();
    expect(sim.records).toHaveLength(1);
    expect(sim.client.requests[0]?.jsonSchema).toMatchObject({
      properties: {
        acts: { items: { properties: { action: { enum: expect.arrayContaining(["continue"]) } } } },
      },
    });
    expect(sim.agent("mara").currentAction).toEqual({ kind: "wait", endsAtTick: 200 });
  });
});
