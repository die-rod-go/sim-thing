import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "./config";
import type { SeedAgent } from "@village/shared";
import { buildSeededWorld, loadSeedFile, parseSeedFile } from "./seeds";
import { loadItemCatalog } from "./items/load-items";
import { loadWorldMap } from "./world/map-loader";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const projectMap = loadWorldMap(resolve(repositoryRoot, config.server.mapPath));

function findPlaceCenter(placeName: string) {
  const place = projectMap.places.find((area) => area.name === placeName);
  if (!place) throw new Error(`The project map has no place "${placeName}"`);
  return {
    x: place.x + Math.floor(place.width / 2),
    y: place.y + Math.floor(place.height / 2),
  };
}

const map = {
  ...projectMap,
  startTiles: {
    ...projectMap.startTiles,
    mara: findPlaceCenter("rose cottage"),
    ilsa: findPlaceCenter("town square"),
  },
};
const items = loadItemCatalog(resolve(repositoryRoot, config.server.itemsPath), []);

function makeSeedAgent(overrides: Partial<SeedAgent> = {}): SeedAgent {
  return {
    id: "mara",
    name: "Mara",
    profession: "baker; works at the bakery",
    traits: {
      extraversion: 0.1,
      agreeableness: 0.4,
      conscientiousness: 0.8,
      neuroticism: 0.5,
      openness: -0.1,
    },
    core: "Values honest work.",
    selfImage: "A steady baker.",
    sleepRecoveryPerHour: 0.15,
    strength: 0.5,
    agility: 0.5,
    inventory: { coin: 30, bread: 2, wheat: 4, wood: 2 },
    mood: "Up early.",
    goals: [{ goal: "Bake every day", reason: "It is my job", progress: "Not started" }],
    people: {},
    seenPlaces: [],
    ...overrides,
  };
}

describe("seeds", () => {
  const seedFile = parseSeedFile({
    agents: [
      makeSeedAgent({
        people: {
          Ilsa: { whatIThinkOfThem: "Runs the square.", whatIWantFromThem: " A stall. " },
          Bram: { whatIThinkOfThem: "  " },
        },
      }),
      makeSeedAgent({ id: "ilsa", name: "Ilsa" }),
    ],
  });
  const world = buildSeededWorld(seedFile, map, items);

  it("starts an agent beside one already standing on its start tile", () => {
    const crowdedMap = { ...map, startTiles: { ...map.startTiles, ilsa: map.startTiles.mara } };
    const crowded = buildSeededWorld(seedFile, crowdedMap, items);
    const [mara, ilsa] = crowded.agents;
    expect(mara?.pos).toEqual(map.startTiles.mara);
    expect(ilsa?.pos).not.toEqual(mara?.pos);
    expect(ilsa?.place).toBe("rose cottage");
  });

  it("builds the project's own seed file, whatever agents it holds", () => {
    const projectSeedFile = loadSeedFile(resolve(repositoryRoot, config.server.seedsPath));
    const projectWorld = buildSeededWorld(projectSeedFile, map, items);
    expect(projectWorld.agents.map((agent) => agent.id)).toEqual(
      projectSeedFile.agents.map((agent) => agent.id),
    );
  });

  it("builds every seeded agent at its start tile with fresh state", () => {
    expect(world.agents.map((agent) => agent.id)).toEqual(["mara", "ilsa"]);
    const mara = world.agents[0];
    expect(mara?.place).toBe("rose cottage");
    expect(mara?.pos).toEqual(map.startTiles.mara);
    expect(mara?.needs).toEqual({ hunger: 0.8, energy: 0.8, social: 0.8, fun: 0.8 });
    expect(mara).toMatchObject({
      intention: "",
      currentAction: null,
      awareness: {},
      lastThought: null,
    });
    expect(world.agents.find((agent) => agent.id === "ilsa")?.place).toBe("town square");
  });

  it("makes the map's objects first, then each seed inventory, with ids from one counter", () => {
    const placedCount = map.placements.length;
    const placed = world.entities.slice(0, placedCount);
    expect(placed.map((entity) => entity.label)).toEqual(
      map.placements.map((placement) => placement.label),
    );
    expect(placed.every((entity) => entity.location.kind === "tile")).toBe(true);
    const maraItems = world.entities.filter(
      (entity) => entity.location.kind === "inside" && entity.location.holderId === "mara",
    );
    const counts: Record<string, number> = {};
    for (const entity of maraItems)
      counts[entity.definitionId] = (counts[entity.definitionId] ?? 0) + 1;
    expect(counts).toEqual({ coin: 30, bread: 2, wheat: 4, wood: 2 });
    expect(world.nextEntityId).toBe(world.entities.length + 1);
  });

  it("starts every entity and agent with no changes from its definition", () => {
    expect(world.entities.every((entity) => Object.keys(entity.changes).length === 0)).toBe(true);
    expect(world.agents.every((agent) => Object.keys(agent.bodyChanges).length === 0)).toBe(true);
  });

  it("lets an inventory hold any definition but the agents' body", () => {
    const heavy = parseSeedFile({ agents: [makeSeedAgent({ inventory: { oven: 1 } })] });
    expect(() => buildSeededWorld(heavy, map, items)).not.toThrow();
    const body = parseSeedFile({
      agents: [makeSeedAgent({ inventory: { [items.world.agentBody]: 1 } })],
    });
    expect(() => buildSeededWorld(body, map, items)).toThrow(/inventory/);
  });

  it("rejects a seed agent whose id starts with the entity prefix", () => {
    const broken = parseSeedFile({ agents: [makeSeedAgent({ id: "entity-7" })] });
    expect(() => buildSeededWorld(broken, map, items)).toThrow(/entity-/);
  });

  it("turns what a seed holds about a person into a person entry, empty where it says nothing", () => {
    const mara = world.agents.find((agent) => agent.id === "mara");
    expect(mara?.people).toEqual({
      ilsa: {
        whatIThinkOfThem: "Runs the square.",
        whatTheyThinkOfMe: "",
        whatIWantFromThem: "A stall.",
        whatTheyWantFromMe: "",
        misc: "",
      },
    });
    expect(world.agents.find((agent) => agent.id === "ilsa")?.people).toEqual({});
  });

  it("starts the seed's goals as long-term goals, with no short-term goals yet", () => {
    const mara = world.agents.find((agent) => agent.id === "mara");
    expect(mara?.longTermGoals).toEqual([
      { goal: "Bake every day", reason: "It is my job", progress: "Not started" },
    ]);
    expect(mara?.shortTermGoals).toEqual([]);
  });

  it("rejects a seed note about someone who is not in the village", () => {
    const stranger = parseSeedFile({
      agents: [makeSeedAgent({ people: { Zed: { whatIThinkOfThem: "A drifter." } } })],
    });
    expect(() => buildSeededWorld(stranger, map, items)).toThrow(/Zed/);
  });

  it("rejects a seed agent with no start tile on the map", () => {
    const broken = parseSeedFile({ agents: [makeSeedAgent({ id: "nobody", name: "Nobody" })] });
    expect(() => buildSeededWorld(broken, map, items)).toThrow(/nobody has no start tile/);
  });

  it("rejects a seed file with out-of-range traits", () => {
    const first = makeSeedAgent();
    const broken = parseSeedFile({
      agents: [{ ...first, traits: { ...first.traits, openness: 3 } }],
    });
    expect(() => buildSeededWorld(broken, map, items)).toThrow(/traits.openness/);
  });
});
