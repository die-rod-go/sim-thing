import { readFileSync } from "node:fs";
import {
  findSeedFileProblems,
  NEED_NAMES,
  seedFileSchema,
  type Agent,
  type Memory,
  type Needs,
  type SeedAgent,
  type SeedFile,
  type SeedProblem,
  type SeedRules,
} from "@village/shared";
import { config } from "./config";
import { findPlaceAt } from "./world/map-loader";
import type { WorldMap } from "./world/types";

export interface SeededWorld {
  agents: Agent[];
  memories: Memory[];
}

/** Every item name a recipe or held-item interaction knows about, sorted. */
export function listKnownItemNames(): string[] {
  const itemNames = new Set(Object.keys(config.heldItems));
  for (const recipe of Object.values(config.interactions)) {
    for (const itemName of Object.keys(recipe.inputs)) itemNames.add(itemName);
    for (const itemName of Object.keys(recipe.outputs)) itemNames.add(itemName);
  }
  return [...itemNames].sort();
}

/** A blank character for the editor: no name or persona yet, with the usual starting state. */
export function buildNewAgentTemplate(rules: SeedRules): SeedAgent {
  return {
    id: "",
    name: "",
    profession: "",
    spawnPlace: rules.spawnPlaces[0] ?? "",
    traits: {
      extraversion: 0,
      agreeableness: 0,
      conscientiousness: 0,
      neuroticism: 0,
      openness: 0,
    },
    core: "",
    selfImage: "",
    sleepRecoveryPerHour: config.seeds.newAgent.sleepRecoveryPerHour,
    coins: config.economy.startingCoins,
    inventory: { ...config.seeds.newAgent.inventory },
    mood: "",
    goals: [],
    peopleNotes: {},
  };
}

export function buildSeedRules(map: WorldMap): SeedRules {
  return {
    traitRange: { min: config.traits.min, max: config.traits.max },
    sleepRecoveryRange: { ...config.seeds.sleepRecoveryRange },
    spawnPlaces: Object.keys(map.spawnPoints).sort(),
    itemNames: listKnownItemNames(),
  };
}

function describeProblem(seedFile: SeedFile, problem: SeedProblem): string {
  const agent = problem.agentIndex === null ? undefined : seedFile.agents[problem.agentIndex];
  const owner = agent ? `seed agent ${agent.id || `#${problem.agentIndex}`}` : "seed file";
  return `${owner} ${problem.field}: ${problem.message}`;
}

function buildStartingNeeds(): Needs {
  const needs = {} as Needs;
  for (const needName of NEED_NAMES) needs[needName] = config.needs.startValue;
  return needs;
}

function buildAgent(seed: SeedAgent, map: WorldMap): Agent {
  const spawn = map.spawnPoints[seed.spawnPlace];
  if (!spawn) throw new Error(`Seed agent ${seed.id} spawns at unknown place "${seed.spawnPlace}"`);
  const pos = { ...spawn };
  return {
    id: seed.id,
    name: seed.name.trim(),
    place: findPlaceAt(map, pos),
    pos,
    personality: {
      traits: { ...seed.traits },
      core: seed.core,
      selfImage: seed.selfImage,
    },
    body: { sleepRecoveryPerHour: seed.sleepRecoveryPerHour },
    profession: seed.profession,
    coins: seed.coins,
    inventory: { ...seed.inventory },
    needs: buildStartingNeeds(),
    mood: seed.mood,
    goals: seed.goals.map((goal) => ({ ...goal })),
    dailyPlan: "",
    intention: "",
    currentAction: null,
    workingMemory: [],
    awareness: {},
    lastThought: null,
  };
}

function buildPeopleMemories(seed: SeedAgent): Memory[] {
  return Object.entries(seed.peopleNotes)
    .filter(([, note]) => note.trim() !== "")
    .map(([personName, note], index) => ({
      id: `${seed.id}-seed-people-${index + 1}`,
      agentId: seed.id,
      bucket: "people",
      tick: 0,
      text: `${personName}: ${note}`.slice(0, config.memory.maxMemoryChars),
      tags: [personName.toLowerCase()],
      strength: config.memory.newMemoryStrength,
      lastRecalledTick: null,
    }));
}

/** Builds the starting agents and their seeded people memories; throws on any seed error. */
export function buildSeededWorld(seedFile: SeedFile, map: WorldMap): SeededWorld {
  const errors = findSeedFileProblems(seedFile, buildSeedRules(map)).filter(
    (problem) => problem.severity === "error",
  );
  if (errors.length > 0) {
    const descriptions = errors.map((problem) => describeProblem(seedFile, problem));
    throw new Error(`Invalid seed file:\n${descriptions.join("\n")}`);
  }
  return {
    agents: seedFile.agents.map((seed) => buildAgent(seed, map)),
    memories: seedFile.agents.flatMap(buildPeopleMemories),
  };
}

export function parseSeedFile(json: unknown): SeedFile {
  return seedFileSchema.parse(json);
}

export function loadSeedFile(filePath: string): SeedFile {
  try {
    return parseSeedFile(JSON.parse(readFileSync(filePath, "utf8")));
  } catch (error) {
    throw new Error(`Could not load seed file ${filePath}`, { cause: error });
  }
}
