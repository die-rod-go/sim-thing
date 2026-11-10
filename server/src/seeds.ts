import { readFileSync } from "node:fs";
import { z } from "zod";
import { NEED_NAMES, type Agent, type Memory, type Needs } from "@village/shared";
import { config } from "./config";
import { findPlaceAt } from "./world/map-loader";
import type { WorldMap } from "./world/types";

const traitValueSchema = z.number().min(config.traits.min).max(config.traits.max);

const seedAgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  profession: z.string(),
  spawnPlace: z.string().min(1),
  traits: z.object({
    extraversion: traitValueSchema,
    agreeableness: traitValueSchema,
    conscientiousness: traitValueSchema,
    neuroticism: traitValueSchema,
    openness: traitValueSchema,
  }),
  core: z.string(),
  selfImage: z.string(),
  sleepRecoveryPerHour: z.number().positive(),
  coins: z.number().int().nonnegative(),
  inventory: z.record(z.string(), z.number().int().nonnegative()),
  mood: z.string(),
  goals: z.array(
    z.object({
      text: z.string(),
      why: z.string(),
      progress: z.string(),
      kind: z.enum(["world", "social", "self"]),
    }),
  ),
  peopleNotes: z.record(z.string(), z.string()),
});

export const seedFileSchema = z.object({ agents: z.array(seedAgentSchema).min(1) });

export type SeedFile = z.infer<typeof seedFileSchema>;
type SeedAgent = z.infer<typeof seedAgentSchema>;

export interface SeededWorld {
  agents: Agent[];
  memories: Memory[];
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
    name: seed.name,
    place: findPlaceAt(map, pos),
    pos,
    personality: { traits: { ...seed.traits }, core: seed.core, selfImage: seed.selfImage },
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
  };
}

function buildPeopleMemories(seed: SeedAgent): Memory[] {
  return Object.entries(seed.peopleNotes).map(([personName, note], index) => ({
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

/** Builds the starting agents and their seeded people memories from a parsed seed file. */
export function buildSeededWorld(seedFile: SeedFile, map: WorldMap): SeededWorld {
  const agentIds = new Set<string>();
  for (const seed of seedFile.agents) {
    if (agentIds.has(seed.id)) throw new Error(`Duplicate seed agent id "${seed.id}"`);
    agentIds.add(seed.id);
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
