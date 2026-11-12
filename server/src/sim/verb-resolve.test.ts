import { compareEntityAge, type Entity } from "@village/shared";
import { describe, expect, it } from "vitest";
import { createEntity, listHeldEntities } from "../items/entity-store";
import type { InteractRequest } from "./agent-runtime";
import {
  NEXT_TO_SQUARE,
  SQUARE,
  addVerbs,
  buildCombatSim,
  handOver,
  killAgent,
  place,
} from "./combat-test-kit";
import type { TestSim } from "./test-sim";
import { resolveInteract, type ReadyInteract, type VerbFollowUp } from "./verb-resolve";

const EXAMINE_HELD = {
  name: "examine",
  appliesTo: { allOf: [{ has: "holdable" }, { where: "held" }] },
  steps: [{ step: "wait", minutes: 1 }],
};
const EXAMINE_ANYWHERE = {
  name: "examine",
  appliesTo: { has: "holdable" },
  steps: [{ step: "wait", minutes: 1 }],
};
const EXAMINE_HERE = {
  name: "examine",
  appliesTo: { where: "here" },
  steps: [{ step: "wait", minutes: 1 }],
};
const ANY_ITEM_EXAMINE = { verb: "examine", itemName: "bandage" };

function buildTavernSim(extraVerbs: unknown[] = [EXAMINE_ANYWHERE]): TestSim {
  const sim = buildCombatSim();
  place(sim, { mara: SQUARE, tobias: { x: 25, y: 15 } });
  for (const entity of listHeldEntities(sim.state, "mara")) {
    sim.state.entities = sim.state.entities.filter((candidate) => candidate.id !== entity.id);
  }
  addVerbs(sim, extraVerbs);
  return sim;
}

function placeOnGround(sim: TestSim, definitionId: string, x: number): Entity {
  const { place: where } = sim.agent("mara");
  return createEntity(sim.state, definitionId, { kind: "tile", place: where, pos: { x, y: 15 } });
}

function putChest(sim: TestSim, x: number, label: string): Entity {
  const { place: where } = sim.agent("mara");
  return createEntity(sim.state, "chest", { kind: "tile", place: where, pos: { x, y: 16 } }, label);
}

function remove(sim: TestSim, entity: Entity): void {
  sim.state.entities = sim.state.entities.filter((candidate) => candidate.id !== entity.id);
}

function resolveReady(sim: TestSim, request: InteractRequest): ReadyInteract {
  const resolution = resolveInteract(sim.state, "mara", request);
  if (resolution.kind !== "ready") throw new Error(`not ready: ${resolution.reason}`);
  return resolution;
}

function resolveFailure(sim: TestSim, request: InteractRequest): string {
  const resolution = resolveInteract(sim.state, "mara", request);
  if (resolution.kind !== "failed") throw new Error("resolved, but a failure was expected");
  return `${resolution.attempt} | ${resolution.reason}`;
}

function resolveFollowUp(sim: TestSim, request: InteractRequest): VerbFollowUp | undefined {
  const resolution = resolveInteract(sim.state, "mara", request);
  if (resolution.kind !== "failed") throw new Error("resolved, but a failure was expected");
  return resolution.followUp;
}

describe("resolving which entity a reply means", () => {
  it("prefers what is held over what is here over what is inside", () => {
    const sim = buildTavernSim();
    const held = handOver(sim, "mara", "bandage");
    const here = placeOnGround(sim, "bandage", 20);
    const chest = putChest(sim, 20, "tavern chest");
    const inside = createEntity(sim.state, "bandage", { kind: "inside", holderId: chest.id });
    expect(resolveReady(sim, ANY_ITEM_EXAMINE).start.itemIds).toEqual([held.id]);
    remove(sim, held);
    expect(resolveReady(sim, ANY_ITEM_EXAMINE).start.itemIds).toEqual([here.id]);
    remove(sim, here);
    const fromInside = resolveReady(sim, ANY_ITEM_EXAMINE).start;
    expect(fromInside.itemIds).toEqual([inside.id]);
    expect(fromInside.from).toEqual({ kind: "entity", entityId: chest.id });
  });

  it("takes the oldest held one first", () => {
    const sim = buildTavernSim();
    const oldest = handOver(sim, "mara", "bandage");
    handOver(sim, "mara", "bandage");
    expect(resolveReady(sim, ANY_ITEM_EXAMINE).start.itemIds).toEqual([oldest.id]);
  });

  it("takes the nearest one here first, the oldest among equals", () => {
    const sim = buildTavernSim();
    placeOnGround(sim, "bandage", 22);
    const near = placeOnGround(sim, "bandage", 20);
    const alsoNear = placeOnGround(sim, "bandage", 18);
    expect(compareEntityAge(near, alsoNear)).toBeLessThan(0);
    expect(resolveReady(sim, ANY_ITEM_EXAMINE).start.itemIds).toEqual([near.id]);
  });

  it("restricts to what is directly inside the holder that `from` names", () => {
    const sim = buildTavernSim();
    const northChest = putChest(sim, 20, "north chest");
    const southChest = putChest(sim, 18, "south chest");
    createEntity(sim.state, "bandage", { kind: "inside", holderId: northChest.id });
    const southBandage = createEntity(sim.state, "bandage", {
      kind: "inside",
      holderId: southChest.id,
    });
    const ready = resolveReady(sim, { ...ANY_ITEM_EXAMINE, fromName: "south chest" });
    expect(ready.start.itemIds).toEqual([southBandage.id]);
    expect(ready.start.from).toEqual({ kind: "entity", entityId: southChest.id });
    expect(
      resolveFailure(sim, { verb: "examine", itemName: "coin", fromName: "south chest" }),
    ).toBe("examine the coin | there was no coin here");
  });

  it("fails when `from` names nothing here", () => {
    const sim = buildTavernSim();
    expect(resolveFailure(sim, { ...ANY_ITEM_EXAMINE, fromName: "treasure chest" })).toBe(
      "examine the bandage | there was no treasure chest here",
    );
  });

  it("fails when `from` names something the agent can't see into", () => {
    const sim = buildTavernSim();
    place(sim, { mara: SQUARE, tobias: NEXT_TO_SQUARE });
    expect(resolveFailure(sim, { verb: "take", itemName: "coin", fromName: "Tobias" })).toBe(
      "take coin from Tobias | I can't see what Tobias carries",
    );
    killAgent(sim, "tobias");
    const ready = resolveReady(sim, { verb: "take", itemName: "coin", fromName: "Tobias's body" });
    expect(ready.start.from).toEqual({ kind: "agent", agentId: "tobias" });
  });

  it("reads naturally when nothing is found and no holder was named", () => {
    const sim = buildTavernSim();
    expect(resolveFailure(sim, { verb: "take", itemName: "bandage" })).toBe(
      "take bandage | there was no bandage here",
    );
  });
});

describe("resolving the verb", () => {
  it("uses the first verb of that name, in file order, that applies to some candidate", () => {
    const heldFirst = buildTavernSim([EXAMINE_HELD, EXAMINE_HERE]);
    const heldBandage = handOver(heldFirst, "mara", "bandage");
    placeOnGround(heldFirst, "bandage", 20);
    expect(resolveReady(heldFirst, ANY_ITEM_EXAMINE).start.itemIds).toEqual([heldBandage.id]);
    const hereFirst = buildTavernSim([EXAMINE_HERE, EXAMINE_HELD]);
    handOver(hereFirst, "mara", "bandage");
    const here = placeOnGround(hereFirst, "bandage", 20);
    expect(resolveReady(hereFirst, ANY_ITEM_EXAMINE).start.itemIds).toEqual([here.id]);
  });

  it("falls to a later verb of the same name when the first applies to nothing named", () => {
    const sim = buildTavernSim([EXAMINE_HELD, EXAMINE_HERE]);
    const here = placeOnGround(sim, "bandage", 20);
    const ready = resolveReady(sim, ANY_ITEM_EXAMINE);
    expect(ready.start.itemIds).toEqual([here.id]);
    expect(ready.verb.appliesTo).toEqual(EXAMINE_HERE.appliesTo);
  });
});

describe("resolving the stack", () => {
  it("takes fewer than asked when that is all there is", () => {
    const sim = buildTavernSim();
    const chest = putChest(sim, 20, "tavern chest");
    for (let made = 0; made < 3; made += 1) {
      createEntity(sim.state, "bandage", { kind: "inside", holderId: chest.id });
    }
    const ready = resolveReady(sim, { verb: "take", itemName: "bandage", amount: 5 });
    expect(ready.start.itemIds).toHaveLength(3);
    expect(ready.start.itemName).toBe("3 bandages");
  });

  it("takes only the asked amount, oldest first", () => {
    const sim = buildTavernSim();
    const chest = putChest(sim, 20, "tavern chest");
    const bandages = [0, 1, 2].map(() =>
      createEntity(sim.state, "bandage", { kind: "inside", holderId: chest.id }),
    );
    const ready = resolveReady(sim, { verb: "take", itemName: "bandage", amount: 2 });
    expect(ready.start.itemIds).toEqual([bandages[0]?.id, bandages[1]?.id]);
  });

  it("takes one when the verb has no `amount`", () => {
    const sim = buildTavernSim();
    handOver(sim, "mara", "bandage");
    handOver(sim, "mara", "bandage");
    const ready = resolveReady(sim, { verb: "use", itemName: "bandage", amount: 2 });
    expect(ready.start.itemIds).toHaveLength(1);
  });
});

describe("resolving the target", () => {
  it("takes a lone target as the item when no verb of that name works bare-handed", () => {
    const sim = buildTavernSim([EXAMINE_HERE]);
    const board = placeOnGround(sim, "notice_board", 20);
    const ready = resolveReady(sim, { verb: "examine", targetName: "notice board" });
    expect(ready.start.itemIds).toEqual([board.id]);
    expect(ready.start.target).toBeNull();
  });

  it("keeps a lone target for a verb that can be aimed", () => {
    const sim = buildTavernSim();
    handOver(sim, "mara", "bandage");
    putChest(sim, 20, "tavern chest");
    expect(resolveFailure(sim, { verb: "use", targetName: "Tobias" })).toBe(
      "use | I didn't say which thing to use",
    );
    expect(resolveFollowUp(sim, { verb: "put", targetName: "tavern chest" })).toBe(undefined);
  });

  it("keeps a lone target that names a person, not a thing", () => {
    const sim = buildTavernSim([EXAMINE_HERE]);
    expect(resolveFailure(sim, { verb: "examine", targetName: "Tobias" })).toBe(
      "examine | I didn't say which thing to examine",
    );
  });

  it("says no thing was named, not that the verb is unknown, when only the item is missing", () => {
    const sim = buildTavernSim([EXAMINE_HERE]);
    expect(resolveFailure(sim, { verb: "examine" })).toBe(
      "examine | I didn't say which thing to examine",
    );
  });

  it("keeps a lone target for a verb nothing defines", () => {
    const sim = buildTavernSim();
    placeOnGround(sim, "notice_board", 20);
    expect(resolveFailure(sim, { verb: "dance", targetName: "notice board" })).toBe(
      "dance | I don't know how to 'dance'",
    );
  });

  it("keeps a lone target as the target for a bare-handed verb", () => {
    const sim = buildTavernSim();
    const ready = resolveReady(sim, { verb: "punch", targetName: "Tobias" });
    expect(ready.start.target).toEqual({ kind: "agent", agentId: "tobias" });
  });

  it("fails when the target doesn't match what the verb aims at", () => {
    const sim = buildTavernSim();
    handOver(sim, "mara", "bandage");
    putChest(sim, 20, "tavern chest");
    expect(
      resolveFailure(sim, { verb: "use", itemName: "bandage", targetName: "tavern chest" }),
    ).toBe("bandage tavern chest with a bandage | that doesn't work on the tavern chest");
  });

  it("offers the item's verbs that can aim at a target the asked-for verb refuses", () => {
    const sim = buildTavernSim();
    const bandage = handOver(sim, "mara", "bandage");
    putChest(sim, 20, "tavern chest");
    const followUp = resolveFollowUp(sim, {
      verb: "use",
      itemName: "bandage",
      targetName: "tavern chest",
    });
    expect(followUp?.item.id).toBe(bandage.id);
    const labels = followUp?.choices.map((choice) => choice.label);
    expect(labels).toContain("put");
    expect(labels).not.toContain("use");
    expect(followUp?.targetName).toBe("the tavern chest");
  });

  it("offers no second try when none of the item's verbs can aim at the target", () => {
    const sim = buildTavernSim();
    handOver(sim, "mara", "wheat");
    expect(resolveFollowUp(sim, { verb: "put", itemName: "wheat", targetName: "Mara" })).toBe(
      undefined,
    );
  });

  it("offers no second try when the target isn't here", () => {
    const sim = buildTavernSim();
    handOver(sim, "mara", "bandage");
    expect(
      resolveFollowUp(sim, { verb: "use", itemName: "bandage", targetName: "tavern chest" }),
    ).toBe(undefined);
  });

  it("aims at the user when no target is named and that fits", () => {
    const sim = buildTavernSim();
    handOver(sim, "mara", "bandage");
    const ready = resolveReady(sim, { verb: "use", itemName: "bandage" });
    expect(ready.start.target).toEqual({ kind: "agent", agentId: "mara" });
  });

  it("fails without a target when the verb can't be aimed at the user", () => {
    const sim = buildTavernSim();
    expect(resolveFailure(sim, { verb: "punch" })).toContain("I didn't say who or what to punch");
  });
});
