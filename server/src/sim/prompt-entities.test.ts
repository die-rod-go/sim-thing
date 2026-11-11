import { describe, expect, it } from "vitest";
import { createEntity, listHeldEntities, replaceEntity } from "../items/entity-store";
import { buildBelongings, groupEntitiesForPrompt, listValidItems } from "./prompt-entities";
import { createTestSim, findEntityByLabel, scriptByAgent } from "./test-sim";

function buildSim() {
  const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
  for (const entity of listHeldEntities(sim.state, "mara")) {
    sim.state.entities = sim.state.entities.filter((candidate) => candidate.id !== entity.id);
  }
  const handOver = (definitionId: string, count: number) => {
    for (let made = 0; made < count; made += 1) {
      createEntity(sim.state, definitionId, { kind: "inventory", agentId: "mara" });
    }
  };
  handOver("coin", 30);
  handOver("bread", 3);
  handOver("wood", 1);
  return sim;
}

describe("entities in prompts", () => {
  it("groups identical stateless entities and lists their verbs inline", () => {
    const sim = buildSim();
    expect(buildBelongings(sim.state, sim.agent("mara"))).toEqual([
      { text: "30 coins", verbs: ["drop", "throw"], condition: null },
      { text: "3 bread", verbs: ["eat", "drop", "throw"], condition: null },
      { text: "1 wood", verbs: ["drop", "throw"], condition: null },
    ]);
  });

  it("lists entities with their own state one by one, by their map name", () => {
    const sim = buildSim();
    const door = findEntityByLabel(sim.state, "bakery door");
    const field = findEntityByLabel(sim.state, "wheat field");
    replaceEntity(sim.state, { ...field, state: { ...field.state, stock: 0 } });
    expect(
      groupEntitiesForPrompt(sim.state, "mara", [
        door,
        findEntityByLabel(sim.state, "wheat field"),
      ]),
    ).toEqual([
      { text: "bakery door", verbs: ["open", "close"], condition: "open" },
      { text: "wheat field", verbs: ["harvest wheat"], condition: "empty" },
    ]);
  });

  it("offers each carried definition once as an item, with its plural", () => {
    const sim = buildSim();
    expect(listValidItems(sim.state, sim.agent("mara"))).toEqual([
      { name: "coin", plural: "coins" },
      { name: "bread" },
      { name: "wood" },
    ]);
  });
});
