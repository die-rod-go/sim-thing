import { describe, expect, it } from "vitest";
import { addComponent } from "../items/thing-writes";
import type { LlmRequest } from "../llm/types";
import { contextOf, entityThing } from "./combat-test-kit";
import {
  createTestSim,
  decisionReply,
  findEntityByLabel,
  promptOf,
  scriptByAgent,
} from "./test-sim";

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
          promptOf(request).includes("No one has been talking with you.")
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
    const memories = sim.state.memoryStore.all();
    expect(memories).toContainEqual(
      expect.objectContaining({
        agentId: "ilsa",
        bucket: "conversations",
        text: 'Mara said: "Morning, Ilsa"',
      }),
    );
    expect(memories).toContainEqual(
      expect.objectContaining({
        agentId: "bram",
        bucket: "overheard",
        text: 'I overheard Mara say: "Morning, Ilsa"',
      }),
    );
    expect(memories).toContainEqual(
      expect.objectContaining({
        agentId: "mara",
        bucket: "conversations",
        text: 'I said: "Morning, Ilsa"',
      }),
    );
    const said = sim.results
      .flatMap((result) => result.events)
      .filter((event) => event.kind === "said");
    expect(said.map((event) => [event.actorId, event.tick])).toEqual([
      ["ilsa", 0],
      ["mara", 1],
    ]);
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
    sim.state.agentRuntimes.mara!.verbRun = {
      agentId: "mara",
      verb: "sleep",
      usedEntityId: bed.id,
      usedDefinitionId: bed.definitionId,
      usedName: "rose cottage bed",
      startedAtTick: 0,
    };
    await sim.advance(3);
    const maraCalls = sim.records.filter((record) => record.agentId === "mara");
    expect(maraCalls.map((record) => record.tick)).toEqual([2]);
    expect(sim.agent("mara").currentAction?.kind).toBe("sleep");
  });

  it("perception interrupts at most once every 10 ticks", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "ilsa"],
      responder: scriptByAgent({
        Ilsa: () => decisionReply({ say: "La la la", action: "wait", minutes: 1 }),
        Mara: (request) => keepGoing(request),
      }),
    });
    sim.placeAgent("mara", SQUARE);
    sim.placeAgent("ilsa", { x: SQUARE.x + 2, y: SQUARE.y });
    await sim.advance(25);
    const maraTicks = sim.records
      .filter((record) => record.agentId === "mara")
      .map((record) => record.tick);
    expect(maraTicks).toEqual([0, 1, 11, 21]);
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
});
