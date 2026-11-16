import { buildItemCatalog, parseItemFile, type Entity, type Position } from "@village/shared";
import { describe, expect, it } from "vitest";
import { addComponent } from "../../src/items/thing-writes";
import { findEntity } from "../../src/items/entity-store";
import { SQUARE, contextOf, entityThing } from "./combat-test-kit";
import { setUpSteps } from "./steps/step-test-kit";
import { findEntityByLabel, type TestSim } from "../../src/sim/test-sim";
import { clearTileInPassing } from "../../src/sim/walk-passing";

function closeBakeryDoor(sim: TestSim): Entity & { location: { pos: Position } } {
  const door = findEntityByLabel(sim.state, "bakery door");
  if (door.location.kind !== "tile") throw new Error("the door isn't placed");
  addComponent(contextOf(sim), entityThing(door), "closed", { minutes: null });
  return { ...door, location: { ...door.location } };
}

function isClosed(sim: TestSim, door: Entity): boolean {
  return Object.hasOwn(findEntity(sim.state, door.id).changes, "closed");
}

function lockOpeningBehindACheck(sim: TestSim): void {
  const file = sim.state.items.file;
  const verbs = file.verbs.map((verb) =>
    verb.name === "open"
      ? {
          ...verb,
          steps: [
            {
              step: "check",
              on: "item",
              if: { not: { has: "barred" } },
              otherwise: "the door was barred",
            },
            ...verb.steps,
          ],
        }
      : verb,
  );
  const components = { ...file.components, barred: { description: "Can't be opened." } };
  sim.state.items = buildItemCatalog(parseItemFile({ ...file, components, verbs }));
}

describe("walking into a blocked tile", () => {
  it("opens a closed door in passing and announces it with the done phrase", () => {
    const sim = setUpSteps();
    sim.placeAgent("mara", SQUARE);
    const door = closeBakeryDoor(sim);
    const context = contextOf(sim);
    expect(clearTileInPassing(context, "mara", door.location.pos)).toBeNull();
    expect(isClosed(sim, door)).toBe(false);
    expect(context.result.events).toMatchObject([
      {
        kind: "action_finished",
        description: "opened the bakery door",
        targetName: "bakery door",
        loudness: 3,
      },
    ]);
    expect(sim.agent("mara").currentAction).toBeNull();
  });

  it("turns the walker away from a barred door and leaves it closed", () => {
    const sim = setUpSteps();
    const door = closeBakeryDoor(sim);
    lockOpeningBehindACheck(sim);
    addComponent(contextOf(sim), entityThing(door), "barred", { minutes: null });
    const context = contextOf(sim);
    expect(clearTileInPassing(context, "mara", door.location.pos)).toBe("the door was barred");
    expect(isClosed(sim, door)).toBe(true);
    expect(context.result.events).toEqual([]);
  });
});
