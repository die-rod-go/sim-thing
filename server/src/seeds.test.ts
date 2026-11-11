import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "./config";
import type { SeedAgent } from "@village/shared";
import { buildSeededWorld, loadSeedFile, parseSeedFile } from "./seeds";
import { loadWorldMap } from "./world/map-loader";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const map = loadWorldMap(resolve(repositoryRoot, config.server.mapPath));

function makeSeedAgent(overrides: Partial<SeedAgent> = {}): SeedAgent {
  return {
    id: "mara",
    name: "Mara",
    profession: "baker; works at the bakery",
    spawnPlace: "rose cottage",
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
    coins: 30,
    inventory: { bread: 2, wheat: 4, wood: 2 },
    mood: "Up early.",
    goals: [
      { text: "Bake every day", why: "It is my job", progress: "Not started", kind: "world" },
    ],
    peopleNotes: {
      Edwin: "Has farmed here all his life.",
      Wren: "The young farmer.",
    },
    ...overrides,
  };
}

describe("seeds", () => {
  const seedFile = parseSeedFile({
    agents: [
      makeSeedAgent(),
      makeSeedAgent({ id: "ilsa", name: "Ilsa", spawnPlace: "town square", peopleNotes: {} }),
    ],
  });
  const world = buildSeededWorld(seedFile, map);

  it("builds the project's own seed file, whatever agents it holds", () => {
    const projectSeedFile = loadSeedFile(resolve(repositoryRoot, config.server.seedsPath));
    const projectWorld = buildSeededWorld(projectSeedFile, map);
    expect(projectWorld.agents.map((agent) => agent.id)).toEqual(
      projectSeedFile.agents.map((agent) => agent.id),
    );
  });

  it("builds every seeded agent at its spawn place with fresh state", () => {
    expect(world.agents.map((agent) => agent.id)).toEqual(["mara", "ilsa"]);
    const mara = world.agents[0];
    expect(mara?.place).toBe("rose cottage");
    expect(mara?.pos).toEqual(map.spawnPoints["rose cottage"]);
    expect(mara?.needs).toEqual({ hunger: 0.8, energy: 0.8, social: 0.8, fun: 0.8 });
    expect(mara?.inventory).toEqual({ bread: 2, wheat: 4, wood: 2 });
    expect(mara).toMatchObject({
      dailyPlan: "",
      intention: "",
      currentAction: null,
      workingMemory: [],
      awareness: {},
      lastThought: null,
    });
    expect(world.agents.find((agent) => agent.id === "ilsa")?.place).toBe("town square");
  });

  it("files one people memory per seed note, tagged with the person", () => {
    const maraMemories = world.memories.filter((memory) => memory.agentId === "mara");
    expect(maraMemories).toHaveLength(2);
    const aboutEdwin = maraMemories.find((memory) => memory.tags.includes("edwin"));
    expect(aboutEdwin).toMatchObject({
      bucket: "people",
      tick: 0,
      strength: config.memory.newMemoryStrength,
      lastRecalledTick: null,
    });
    expect(aboutEdwin?.text).toBe("Edwin: Has farmed here all his life.");
    const ids = world.memories.map((memory) => memory.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects a seed agent that spawns at an unknown place", () => {
    const broken = parseSeedFile({
      agents: seedFile.agents.map((agent) => ({ ...agent, spawnPlace: "the moon" })),
    });
    expect(() => buildSeededWorld(broken, map)).toThrow(/the moon/);
  });

  it("rejects a seed file with out-of-range traits", () => {
    const first = makeSeedAgent();
    const broken = parseSeedFile({
      agents: [{ ...first, traits: { ...first.traits, openness: 3 } }],
    });
    expect(() => buildSeededWorld(broken, map)).toThrow(/traits.openness/);
  });

  it("files no people memory for a blank note", () => {
    const withBlankNote = {
      ...makeSeedAgent(),
      peopleNotes: { Edwin: "  ", Wren: "Young farmer." },
    };
    const blankWorld = buildSeededWorld({ agents: [withBlankNote] }, map);
    expect(blankWorld.memories.map((memory) => memory.text)).toEqual(["Wren: Young farmer."]);
  });
});
