import { describe, expect, it } from "vitest";
import { addComponent } from "../../src/items/thing-writes";
import { config } from "../../src/config";
import type { LlmRequest } from "../../src/llm/types";
import { contextOf, entityThing } from "./combat-test-kit";
import { buildRunRecord } from "./verb-run-test-kit";
import {
  createTestSim,
  decisionReply,
  findEntityByLabel,
  promptOf,
  interruptDuringWait,
  scriptByAgent,
} from "../../src/sim/test-sim";

const SQUARE = { x: 19, y: 15 };

function offersContinue(request: LlmRequest): boolean {
  return JSON.stringify(request.jsonSchema).includes('"continue"');
}

function keepGoing(request: LlmRequest): string {
  return offersContinue(request)
    ? decisionReply({ action: "continue" })
    : decisionReply({ action: "wait", minutes: 240 });
}

describe("talking and perception", () => {
  it("speech is filed as conversation for a participant and overheard for a bystander", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "bram", "ilsa"],
      responder: scriptByAgent({
        Ilsa: (request) =>
          !promptOf(request).includes("Morning, Mara")
            ? decisionReply({ say: "Morning, Mara", action: "wait", minutes: 60 })
            : undefined,
        Mara: (request) =>
          promptOf(request).includes('"Morning, Mara"')
            ? decisionReply({ say: "Morning, Ilsa", action: "wait", minutes: 30 })
            : undefined,
      }),
    });
    sim.placeAgent("ilsa", SQUARE);
    sim.placeAgent("mara", { x: SQUARE.x + 1, y: SQUARE.y });
    sim.placeAgent("bram", { x: SQUARE.x + 3, y: SQUARE.y });
    await sim.advance(2);
    expect(sim.streamTexts("ilsa")).toContain('Mara said: "Morning, Ilsa"');
    expect(sim.streamTexts("bram")).toContain('I overheard Mara say: "Morning, Ilsa"');
  });

  it("an agent hears its own name while asleep and gets a decision", async () => {
    let ilsaCalls = 0;
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({
        Ilsa: () => {
          ilsaCalls += 1;
          if (ilsaCalls === 1)
            return decisionReply({ say: "Lovely morning in here", action: "wait", minutes: 1 });
          if (ilsaCalls === 2)
            return decisionReply({ say: "Mara, wake up!", action: "wait", minutes: 240 });
          return undefined;
        },
        Mara: (request) => keepGoing(request),
      }),
    });
    sim.placeAgent("mara", { x: 3, y: 3 });
    sim.placeAgent("ilsa", { x: 5, y: 4 });
    const mara = sim.agent("mara");
    sim.state.agents[0] = {
      ...mara,
      currentAction: { kind: "sleep", target: "rose cottage bed", verb: "sleep", endsAtTick: null },
    };
    const bed = findEntityByLabel(sim.state, "rose cottage bed");
    sim.state.agentRuntimes.mara!.verbRun = buildRunRecord(sim, "mara", "sleep", bed);
    await sim.advance(3);
    const maraCalls = sim.records.filter((record) => record.agentId === "mara");
    expect(maraCalls.map((record) => record.tick)).toEqual([2]);
    expect(sim.agent("mara").currentAction?.kind).toBe("sleep");
  });

  it("gives a sleeper a person entry for someone it only heard", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({
        Ilsa: () => decisionReply({ say: "Mara, wake up!", action: "wait", minutes: 240 }),
        Mara: (request) => keepGoing(request),
      }),
    });
    sim.placeAgent("mara", { x: 3, y: 3 });
    sim.placeAgent("ilsa", { x: 5, y: 4 });
    const mara = sim.agent("mara");
    sim.state.agents[0] = {
      ...mara,
      people: {},
      currentAction: { kind: "sleep", target: "rose cottage bed", verb: "sleep", endsAtTick: null },
    };
    const bed = findEntityByLabel(sim.state, "rose cottage bed");
    sim.state.agentRuntimes.mara!.verbRun = buildRunRecord(sim, "mara", "sleep", bed);
    await sim.advance(1);
    expect(sim.agent("mara").awareness.ilsa?.via).toBe("heard");
    expect(sim.agent("mara").people.ilsa?.whatIThinkOfThem).toBe("");
  });

  it("perception interrupts at most once per cooldown", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({
        Ilsa: () => decisionReply({ say: "La la la", action: "wait", minutes: 1 }),
        Mara: (request) => keepGoing(request),
      }),
    });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", { x: SQUARE.x + 2, y: SQUARE.y });
    const cooldown = config.perception.interruptCooldownTicks;
    await sim.advance(2 * cooldown + 5);
    const maraTicks = sim.records
      .filter((record) => record.agentId === "mara")
      .map((record) => record.tick);
    expect(maraTicks).toEqual([0, 1, 1 + cooldown, 1 + 2 * cooldown]);
  });

  it("walking through a closed door opens it", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0 ? decisionReply({ action: "walk_to", target: "town square" }) : undefined,
      }),
    });
    sim.placeAgent("mara", { x: 6, y: 14 });
    const door = findEntityByLabel(sim.state, "bakery door");
    addComponent(contextOf(sim), entityThing(door), "closed", {
      minutes: null,
    });
    await sim.advance(20);
    expect(Object.hasOwn(findEntityByLabel(sim.state, "bakery door").changes, "closed")).toBe(
      false,
    );
    const events = sim.results.flatMap((result) => result.events);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "action_finished", description: "opened the bakery door" }),
    );
    expect(sim.results.flatMap((result) => result.changedEntityIds)).toContain(door.id);
  });

  it("speaks while setting off on a walk", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({
        Ilsa: () => decisionReply({ say: "Off I go", action: "walk_to", target: "bakery" }),
        Mara: () => decisionReply({ action: "wait", minutes: 240 }),
      }),
    });
    sim.placeAgent("ilsa", SQUARE);
    sim.placeAgent("mara", { x: SQUARE.x + 1, y: SQUARE.y });
    await sim.advance(1);
    const said = sim.results
      .flatMap((result) => result.events)
      .filter((event) => event.kind === "said");
    expect(said.map((event) => event.speech?.words)).toEqual(["Off I go"]);
    expect(sim.agent("ilsa").currentAction).toMatchObject({ kind: "walk_to", target: "bakery" });
  });

  it("keeps doing what it was doing when it speaks and continues", async () => {
    const sim = createTestSim({
      agentIds: ["ilsa"],
      responder: scriptByAgent({
        Ilsa: () => decisionReply({ say: "Just a moment", action: "continue" }),
      }),
    });
    sim.placeAgent("ilsa", SQUARE);
    interruptDuringWait(sim, "ilsa", 60);
    const waitBefore = sim.agent("ilsa").currentAction;
    await sim.advance(1);
    const said = sim.results
      .flatMap((result) => result.events)
      .filter((event) => event.kind === "said");
    expect(said.map((event) => event.speech?.words)).toEqual(["Just a moment"]);
    expect(sim.agent("ilsa").currentAction).toEqual(waitBefore);
  });

  it("waits the minutes the speaker chose after speaking", async () => {
    const sim = createTestSim({
      agentIds: ["ilsa"],
      responder: scriptByAgent({
        Ilsa: () => decisionReply({ say: "Anyone about?", action: "wait", minutes: 20 }),
      }),
    });
    sim.placeAgent("ilsa", SQUARE);
    await sim.advance(1);
    expect(sim.agent("ilsa").currentAction).toEqual({ kind: "wait", endsAtTick: 20 });
  });

  it("waits the default minutes after speaking when none are chosen", async () => {
    const sim = createTestSim({
      agentIds: ["ilsa"],
      responder: scriptByAgent({
        Ilsa: () => decisionReply({ say: "Anyone about?", action: "wait" }),
      }),
    });
    sim.placeAgent("ilsa", SQUARE);
    await sim.advance(1);
    expect(sim.agent("ilsa").currentAction).toEqual({
      kind: "wait",
      endsAtTick: config.decision.sayWaitMinutes / config.clock.minutesPerTick,
    });
  });
});
