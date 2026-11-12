import { describe, expect, it } from "vitest";
import { createEntity, findEntity, listHeldEntities, locateInside } from "../items/entity-store";
import { addComponent } from "../items/thing-writes";
import {
  contextOf,
  buildCombatSim,
  entityThing,
  killAgent,
  place,
  setField,
} from "./combat-test-kit";
import { getAgentRuntime } from "./agent-runtime";
import { groupEntitiesForPrompt } from "./prompt-lines";
import { buildBelongings, buildHere, listValidItems } from "./prompt-entities";
import { createTestSim, findEntityByLabel, scriptByAgent } from "./test-sim";

const NEXT_TO_CHEST = { x: 29, y: 17 };
const NEXT_TO_MARA = { x: 30, y: 17 };

function buildSim() {
  const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
  for (const entity of listHeldEntities(sim.state, "mara")) {
    sim.state.entities = sim.state.entities.filter((candidate) => candidate.id !== entity.id);
  }
  const handOver = (definitionId: string, count: number) => {
    for (let made = 0; made < count; made += 1) {
      createEntity(sim.state, definitionId, locateInside("mara"));
    }
  };
  handOver("coin", 30);
  handOver("bread", 3);
  handOver("wood", 1);
  return sim;
}

function buildTavernSim() {
  const sim = buildCombatSim();
  place(sim, { mara: NEXT_TO_CHEST, tobias: NEXT_TO_MARA });
  return sim;
}

function dropOnTavernFloor(sim: ReturnType<typeof buildTavernSim>, definitionId: string) {
  return createEntity(sim.state, definitionId, {
    kind: "tile",
    place: "tavern",
    pos: NEXT_TO_MARA,
  });
}

describe("entities in prompts", () => {
  it("groups identical stateless entities and lists their verbs inline", () => {
    const sim = buildSim();
    expect(buildBelongings(sim.state, sim.agent("mara"))).toEqual([
      { text: "30 coins", details: [], verbs: ["drop", "throw", "put"], contents: [] },
      { text: "3 bread", details: [], verbs: ["eat", "drop", "throw", "put"], contents: [] },
      { text: "1 wood", details: [], verbs: ["drop", "throw", "put"], contents: [] },
    ]);
  });

  it("lists entities with their own state one by one, by their map name", () => {
    const sim = buildSim();
    const door = findEntityByLabel(sim.state, "bakery door");
    const field = findEntityByLabel(sim.state, "wheat field");
    setField(sim, entityThing(field), "stock.amount", 0);
    expect(
      groupEntitiesForPrompt(sim.state, "mara", [door, findEntity(sim.state, field.id)]),
    ).toEqual([
      { text: "bakery door", details: [], verbs: ["close"], contents: [] },
      { text: "wheat field", details: ["empty"], verbs: ["harvest wheat"], contents: [] },
    ]);
  });

  it("builds a line from component words, field words and ground words", () => {
    const sim = buildTavernSim();
    const field = findEntityByLabel(sim.state, "wheat field");
    addComponent(contextOf(sim), entityThing(field), "wet", { minutes: null });
    setField(sim, entityThing(field), "stock.amount", 6);
    const knife = dropOnTavernFloor(sim, "knife");
    const [fieldGroup, knifeGroup] = groupEntitiesForPrompt(sim.state, "mara", [
      findEntity(sim.state, field.id),
      knife,
    ]);
    expect(fieldGroup?.details).toEqual(["wet", "6 left"]);
    expect(knifeGroup?.details).toEqual(["on the floor"]);
    setField(sim, entityThing(field), "stock.amount", 0);
    expect(
      groupEntitiesForPrompt(sim.state, "mara", [findEntity(sim.state, field.id)])[0]?.details,
    ).toEqual(["wet", "empty"]);
  });

  it("counts identical unlabelled things on one line", () => {
    const sim = buildTavernSim();
    const breads = [dropOnTavernFloor(sim, "bread"), dropOnTavernFloor(sim, "bread")];
    const groups = groupEntitiesForPrompt(sim.state, "mara", breads);
    expect(groups.map((group) => group.text)).toEqual(["2 bread"]);
  });

  it("keeps apart things whose words differ", () => {
    const sim = buildTavernSim();
    const dry = dropOnTavernFloor(sim, "bread");
    const wet = dropOnTavernFloor(sim, "bread");
    addComponent(contextOf(sim), entityThing(wet), "wet", { minutes: null });
    const groups = groupEntitiesForPrompt(sim.state, "mara", [dry, findEntity(sim.state, wet.id)]);
    expect(groups.map((group) => group.details)).toEqual([
      ["on the floor"],
      ["wet", "on the floor"],
    ]);
  });

  it("counts a worn knife with a fresh one", () => {
    const sim = buildTavernSim();
    const fresh = dropOnTavernFloor(sim, "knife");
    const worn = dropOnTavernFloor(sim, "knife");
    setField(sim, entityThing(worn), "health.current", 1);
    const groups = groupEntitiesForPrompt(sim.state, "mara", [fresh, worn]);
    expect(groups.map((group) => group.text)).toEqual(["2 knives"]);
  });

  it("lists a chest's contents under it with their own verbs", () => {
    const sim = buildTavernSim();
    const chest = findEntityByLabel(sim.state, "tavern chest");
    createEntity(sim.state, "coin", { kind: "inside", holderId: chest.id });
    createEntity(sim.state, "coin", { kind: "inside", holderId: chest.id });
    createEntity(sim.state, "bread", { kind: "inside", holderId: chest.id });
    const group = buildHere(sim.state, sim.agent("mara")).find(
      (candidate) => candidate.text === "tavern chest",
    );
    expect(group?.details).toHaveLength(1);
    expect(group?.details[0]).toContain("holding");
    expect(group?.verbs).not.toContain("take");
    expect(group?.contents.map((content) => content.text)).toEqual(["2 coins", "1 bread"]);
    expect(group?.contents.every((content) => content.verbs.includes("take"))).toBe(true);
  });

  it("lists a dead body here with what it carries", () => {
    const sim = buildTavernSim();
    killAgent(sim, "tobias");
    getAgentRuntime(sim.state, "mara").visibleAgentIds = ["tobias"];
    const body = buildHere(sim.state, sim.agent("mara")).find(
      (candidate) => candidate.text === "Tobias's body",
    );
    expect(body?.details.join(", ")).toContain("holding");
    expect(body?.contents.length).toBeGreaterThan(0);
    expect(body?.contents.every((content) => content.verbs.includes("take"))).toBe(true);
  });

  it("doesn't show what a living person carries", () => {
    const sim = buildTavernSim();
    getAgentRuntime(sim.state, "mara").visibleAgentIds = ["tobias"];
    const here = buildHere(sim.state, sim.agent("mara"));
    expect(here.some((group) => group.text.includes("Tobias"))).toBe(false);
    const tobiasHeld = new Set(
      listHeldEntities(sim.state, "tobias").map((entity) => entity.definitionId),
    );
    expect(tobiasHeld.size).toBeGreaterThan(0);
    expect(
      here.every((group) => group.contents.length === 0 || group.text === "tavern chest"),
    ).toBe(true);
  });

  it("offers each carried definition once as an item, with its plural, then what is here", () => {
    const sim = buildSim();
    expect(listValidItems(sim.state, sim.agent("mara"))).toEqual([
      { name: "coin", plural: "coins" },
      { name: "bread" },
      { name: "wood" },
      { name: "rose cottage bed" },
      { name: "rose cottage door" },
    ]);
  });
});
