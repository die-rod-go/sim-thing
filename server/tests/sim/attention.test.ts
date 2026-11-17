import { buildItemCatalog, parseItemFile } from "@village/shared";
import { describe, expect, it } from "vitest";
import { createEntity, locateInside } from "../../src/items/entity-store";
import type { EventPerception } from "../../src/perception/types";
import { isNotable } from "../../src/sim/attention";
import { createEvent, type EventFields } from "../../src/sim/event-factory";
import { createTestSim, scriptByAgent } from "../../src/sim/test-sim";

const SQUARE = { x: 19, y: 15 };
const FAR_IN_SQUARE = { x: 14, y: 12 };

function buildSim() {
  const sim = createTestSim({ agentIds: ["mara", "ilsa"], responder: scriptByAgent({}) });
  sim.placeAgent("mara", SQUARE);
  sim.placeAgent("ilsa", FAR_IN_SQUARE);
  return sim;
}

const SEEN: EventPerception = {
  agentId: "mara",
  via: "saw",
  isInSight: true,
  hearing: "none",
  direction: null,
};
const MUFFLED: EventPerception = {
  agentId: "mara",
  via: "heard_muffled",
  isInSight: false,
  hearing: "muffled",
  direction: "north",
};

function isNotableToMara(
  sim: ReturnType<typeof buildSim>,
  fields: EventFields,
  perception: EventPerception = SEEN,
): boolean {
  const event = createEvent(sim.state, sim.agent("ilsa"), fields);
  return isNotable(sim.state, event, perception, sim.agent("mara"));
}

describe("attention", () => {
  it("keeps others walking about and going through their routine in the background", () => {
    const sim = buildSim();
    expect(isNotableToMara(sim, { kind: "walk_started", description: "started walking" })).toBe(
      false,
    );
    const baking = { kind: "action_started", description: "started baking", verb: "bake bread" };
    expect(isNotableToMara(sim, baking as EventFields)).toBe(false);
  });

  it("turns heads at clear speech and a loud muffled voice, not a quiet one", () => {
    const sim = buildSim();
    const speak = (perception: EventPerception, loudness: number) => {
      const event = {
        ...createEvent(sim.state, sim.agent("ilsa"), {
          kind: "said",
          description: 'said "hello"',
          loudness,
        }),
        speech: { words: "hello", volume: "normal" as const },
      };
      return isNotable(sim.state, event, perception, sim.agent("mara"));
    };
    expect(speak({ ...SEEN, hearing: "clear" }, 10)).toBe(true);
    expect(speak(MUFFLED, 24)).toBe(true);
    expect(speak(MUFFLED, 10)).toBe(false);
    expect(speak(SEEN, 10)).toBe(false);
  });

  it("notices an act aimed at the agent or at something it carries", () => {
    const sim = buildSim();
    const bread = createEntity(sim.state, "bread", locateInside("mara"));
    for (const targetId of ["mara", bread.id]) {
      expect(
        isNotableToMara(sim, { kind: "action_started", description: "started taking", targetId }),
      ).toBe(true);
    }
  });

  it("notices someone arriving where the agent is, but not elsewhere", () => {
    const sim = buildSim();
    const arrival = { kind: "arrived" as const, description: "arrived" };
    expect(isNotableToMara(sim, arrival)).toBe(true);
    sim.placeAgent("ilsa", { x: 5, y: 14 });
    expect(isNotableToMara(sim, arrival)).toBe(false);
  });

  it("notices a verb the world settings name, done by anyone", () => {
    const sim = buildSim();
    const file = sim.state.items.file;
    sim.state.items = buildItemCatalog(
      parseItemFile({ ...file, world: { ...file.world, noticedVerbs: ["bake bread"] } }),
    );
    const baking = { kind: "action_started" as const, description: "started baking" };
    expect(isNotableToMara(sim, { ...baking, verb: "bake bread" })).toBe(true);
  });

  it("notices anything loud enough to wake a sleeper, even unseen", () => {
    const sim = buildSim();
    const loud = { kind: "action_started" as const, description: "started forcing", loudness: 20 };
    expect(isNotableToMara(sim, loud, MUFFLED)).toBe(true);
  });
});
