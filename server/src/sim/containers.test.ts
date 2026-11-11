import { buildItemCatalog, parseItemFile, type Entity } from "@village/shared";
import { describe, expect, it } from "vitest";
import { config } from "../config";
import {
  countHeld,
  createEntity,
  findEntity,
  listContents,
  listHeldOfDefinition,
} from "../items/entity-store";
import { getAgentRuntime, type InteractRequest } from "./agent-runtime";
import {
  aim,
  buildCombatSim,
  finish,
  handOver,
  killAgent,
  lastFailure,
  memoryTexts,
  place,
} from "./combat-test-kit";
import { buildHere, listValidItems } from "./prompt-entities";
import {
  decisionReply,
  findEntityByLabel,
  scriptByAgent,
  createTestSim,
  type TestSim,
} from "./test-sim";

const NEXT_TO_CHEST = { x: 29, y: 17 };
const FAR_FROM_CHEST = { x: 32, y: 13 };
const NEXT_TO_MARA = { x: 30, y: 17 };
const BELOW_CHEST = { x: 28, y: 18 };

function chestOf(sim: TestSim): Entity {
  return findEntityByLabel(sim.state, "tavern chest");
}

function fillChest(sim: TestSim, definitionId: string, count: number): void {
  for (let made = 0; made < count; made += 1) {
    createEntity(sim.state, definitionId, { kind: "inside", holderId: chestOf(sim).id });
  }
}

const CHEST = "tavern chest";

function act(sim: TestSim, agentId: string, request: InteractRequest): void {
  aim(sim, agentId, request);
  finish(sim, agentId);
}

function addBasket(sim: TestSim): void {
  const file = sim.state.items.file;
  const basket = {
    id: "basket",
    name: "basket",
    plural: "baskets",
    glyph: { index: 24, color: "#ffffff" },
    components: { capacity: { max: 5 }, holdable: { kilograms: 0.5 } },
  };
  sim.state.items = buildItemCatalog(
    parseItemFile({ ...file, definitions: [...file.definitions, basket] }),
  );
}

function buildTavernSim(): TestSim {
  const sim = buildCombatSim();
  place(sim, { mara: NEXT_TO_CHEST, tobias: NEXT_TO_MARA });
  return sim;
}

describe("putting into and taking from containers", () => {
  it("puts as many held things as asked into the chest", () => {
    const sim = buildTavernSim();
    const breadBefore = countHeld(sim.state, "mara", "bread");
    act(sim, "mara", { verb: "put", itemName: "bread", targetName: CHEST, amount: 2 });
    expect(countHeld(sim.state, "mara", "bread")).toBe(breadBefore - 2);
    expect(listContents(sim.state, chestOf(sim).id)).toHaveLength(2);
    expect(memoryTexts(sim, "mara")).toContain("I put 2 bread in the tavern chest");
  });

  it("takes things out of the chest into the agent's hands", () => {
    const sim = buildTavernSim();
    fillChest(sim, "bandage", 3);
    act(sim, "mara", { verb: "take", itemName: "bandages", targetName: CHEST, amount: 2 });
    expect(countHeld(sim.state, "mara", "bandage")).toBe(2);
    expect(listContents(sim.state, chestOf(sim).id)).toHaveLength(1);
    expect(memoryTexts(sim, "mara")).toContain("I took 2 bandages from the tavern chest");
  });

  it("refuses to put more into a chest than it has room for", () => {
    const sim = buildTavernSim();
    const capacity = 20;
    fillChest(sim, "wood", capacity - 1);
    act(sim, "mara", { verb: "put", itemName: "bread", targetName: CHEST, amount: 2 });
    expect(lastFailure(sim, "mara")).toContain("only had room for 1 more");
    expect(listContents(sim.state, chestOf(sim).id)).toHaveLength(capacity - 1);
    fillChest(sim, "wood", 1);
    act(sim, "mara", { verb: "put", itemName: "bread", targetName: CHEST, amount: 1 });
    expect(lastFailure(sim, "mara")).toContain("was full");
  });

  it("never puts a container inside itself", () => {
    const sim = buildTavernSim();
    addBasket(sim);
    const basket = handOver(sim, "mara", "basket");
    act(sim, "mara", { verb: "put", itemName: "basket", targetName: "basket" });
    expect(lastFailure(sim, "mara")).toContain("there was no basket here");
    expect(findEntity(sim.state, basket.id).location).toEqual({
      kind: "inside",
      holderId: "mara",
    });
  });

  it("puts a held container into the chest with what it holds", () => {
    const sim = buildTavernSim();
    addBasket(sim);
    const basket = handOver(sim, "mara", "basket");
    const bread = createEntity(sim.state, "bread", { kind: "inside", holderId: basket.id });
    act(sim, "mara", { verb: "put", itemName: "basket", targetName: CHEST });
    expect(findEntity(sim.state, basket.id).location).toEqual({
      kind: "inside",
      holderId: chestOf(sim).id,
    });
    expect(findEntity(sim.state, bread.id).location).toEqual({
      kind: "inside",
      holderId: basket.id,
    });
  });

  it("gives the chest's last item to whoever takes it first", () => {
    const sim = buildTavernSim();
    fillChest(sim, "bandage", 1);
    sim.placeAgent("tobias", BELOW_CHEST);
    const request = { verb: "take", itemName: "bandage", targetName: CHEST };
    act(sim, "mara", request);
    act(sim, "tobias", request);
    expect(countHeld(sim.state, "mara", "bandage")).toBe(1);
    expect(countHeld(sim.state, "tobias", "bandage")).toBe(0);
    expect(lastFailure(sim, "tobias")).toContain("there is no bandage here");
  });

  it("can't take from a chest it is too far from to see into", () => {
    const sim = buildTavernSim();
    fillChest(sim, "bandage", 1);
    sim.placeAgent("mara", FAR_FROM_CHEST);
    aim(sim, "mara", { verb: "take", itemName: "bandage", targetName: CHEST });
    expect(lastFailure(sim, "mara")).toContain("I can't see what the tavern chest carries");
    expect(countHeld(sim.state, "mara", "bandage")).toBe(0);
  });

  it("takes bullets out of a held gun", () => {
    const sim = buildTavernSim();
    const gun = handOver(sim, "mara", "gun");
    createEntity(sim.state, "bullet", { kind: "inside", holderId: gun.id });
    createEntity(sim.state, "bullet", { kind: "inside", holderId: gun.id });
    act(sim, "mara", { verb: "take", itemName: "bullet", targetName: "gun", amount: 2 });
    expect(countHeld(sim.state, "mara", "bullet")).toBe(2);
    expect(listContents(sim.state, gun.id)).toHaveLength(0);
    expect(memoryTexts(sim, "mara")).toContain("I took 2 bullets from the gun");
  });
});

describe("taking from bodies", () => {
  it("takes coins from a body, moving them as items", () => {
    const sim = buildTavernSim();
    killAgent(sim, "tobias");
    const coinsOnBody = listHeldOfDefinition(sim.state, "tobias", "coin");
    const maraCoinsBefore = countHeld(sim.state, "mara", "coin");
    act(sim, "mara", { verb: "take", itemName: "coins", targetName: "Tobias's body", amount: 5 });
    expect(countHeld(sim.state, "mara", "coin")).toBe(maraCoinsBefore + 5);
    expect(countHeld(sim.state, "tobias", "coin")).toBe(coinsOnBody.length - 5);
    const moved = coinsOnBody.slice(0, 5).map((coin) => findEntity(sim.state, coin.id).location);
    expect(moved).toEqual(Array(5).fill({ kind: "inside", holderId: "mara" }));
    expect(memoryTexts(sim, "mara")).toContain("I took 5 coins from Tobias's body");
  });

  it("takes coins from a body when a decision names it and the coins", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "tobias"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0
            ? decisionReply({
                action: "interact",
                target: "Tobias's body",
                verb: "take",
                item: "coins",
                amount: 5,
              })
            : undefined,
      }),
    });
    place(sim, { mara: NEXT_TO_CHEST, tobias: NEXT_TO_MARA });
    killAgent(sim, "tobias");
    const maraCoinsBefore = countHeld(sim.state, "mara", "coin");
    await sim.advance(3);
    expect(countHeld(sim.state, "mara", "coin")).toBe(maraCoinsBefore + 5);
  });

  it("refuses to take anything from a living agent", () => {
    const sim = buildTavernSim();
    const tobiasCoins = countHeld(sim.state, "tobias", "coin");
    act(sim, "mara", { verb: "take", itemName: "coin", targetName: "Tobias", amount: 5 });
    expect(lastFailure(sim, "mara")).toBe(
      "I tried to take coin from Tobias but I can't see what Tobias carries",
    );
    expect(countHeld(sim.state, "tobias", "coin")).toBe(tobiasCoins);
  });

  it("refuses a decision to take from a living agent", async () => {
    const sim = createTestSim({
      agentIds: ["mara", "tobias"],
      responder: scriptByAgent({
        Mara: (_request, callIndex) =>
          callIndex === 0
            ? decisionReply({
                action: "interact",
                target: "Tobias",
                verb: "take",
                item: "coin",
                amount: 5,
              })
            : undefined,
      }),
    });
    place(sim, { mara: NEXT_TO_CHEST, tobias: NEXT_TO_MARA });
    const tobiasCoins = countHeld(sim.state, "tobias", "coin");
    await sim.advance(3);
    expect(
      memoryTexts(sim, "mara").some((text) => text.includes("can't see what Tobias carries")),
    ).toBe(true);
    expect(countHeld(sim.state, "tobias", "coin")).toBe(tobiasCoins);
  });
});

describe("seeing what containers and bodies hold", () => {
  function describeChestInHere(sim: TestSim) {
    return buildHere(sim.state, sim.agent("mara")).find((group) => group.text === "tavern chest");
  }

  it("shows a container's contents only to an agent within reach", () => {
    const sim = buildTavernSim();
    fillChest(sim, "bandage", 2);
    sim.placeAgent("mara", FAR_FROM_CHEST);
    expect(describeChestInHere(sim)?.condition ?? "").not.toContain("bandage");
    expect(listValidItems(sim.state, sim.agent("mara")).map((item) => item.name)).not.toContain(
      "bandage",
    );
    sim.placeAgent("mara", NEXT_TO_CHEST);
    expect(describeChestInHere(sim)?.condition).toBe("holding 2 bandages");
    expect(listValidItems(sim.state, sim.agent("mara")).map((item) => item.name)).toContain(
      "bandage",
    );
  });

  it("shows what a body carries to an agent standing over it", () => {
    const sim = buildTavernSim();
    killAgent(sim, "tobias");
    getAgentRuntime(sim.state, "mara").visibleAgentIds = ["tobias"];
    const body = buildHere(sim.state, sim.agent("mara")).find(
      (group) => group.text === "Tobias's body",
    );
    expect(body?.verbs).toEqual(["take"]);
    expect(body?.condition).toContain(config.perception.contentsWords.holding.split(" ")[0]);
    expect(body?.condition).toContain("coins");
  });

  it("shows a dropped item as lying on the floor", () => {
    const sim = buildTavernSim();
    createEntity(sim.state, "knife", { kind: "tile", place: "tavern", pos: NEXT_TO_MARA });
    const knife = buildHere(sim.state, sim.agent("mara")).find((group) => group.text === "a knife");
    expect(knife).toEqual({ text: "a knife", verbs: ["pick up"], condition: "on the floor" });
  });
});
