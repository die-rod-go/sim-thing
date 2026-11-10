import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "./config";
import { buildSeededWorld, loadSeedFile, parseSeedFile } from "./seeds";
import { loadWorldMap } from "./world/map-loader";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const map = loadWorldMap(resolve(repositoryRoot, config.server.mapPath));
const seedFile = loadSeedFile(resolve(repositoryRoot, config.server.seedsPath));

describe("seeds", () => {
  const world = buildSeededWorld(seedFile, map);

  it("builds every seeded agent at its spawn place with fresh state", () => {
    expect(world.agents.map((agent) => agent.id)).toEqual([
      "mara",
      "edwin",
      "wren",
      "bram",
      "tobias",
      "ilsa",
    ]);
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
    });
    expect(world.agents.find((agent) => agent.id === "ilsa")?.place).toBe("town square");
  });

  it("files one people memory per seed note, tagged with the person", () => {
    const maraMemories = world.memories.filter((memory) => memory.agentId === "mara");
    expect(maraMemories).toHaveLength(5);
    const aboutEdwin = maraMemories.find((memory) => memory.tags.includes("edwin"));
    expect(aboutEdwin).toMatchObject({
      bucket: "people",
      tick: 0,
      strength: config.memory.newMemoryStrength,
      lastRecalledTick: null,
    });
    expect(aboutEdwin?.text.startsWith("Edwin: Has farmed here")).toBe(true);
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
    const [first] = seedFile.agents;
    expect(() =>
      parseSeedFile({ agents: [{ ...first, traits: { ...first?.traits, openness: 3 } }] }),
    ).toThrow();
  });
});
