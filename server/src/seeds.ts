import { readFileSync } from "node:fs";
import {
  findSeedFileProblems,
  NEED_NAMES,
  seedFileSchema,
  type Agent,
  type Entity,
  type ItemCatalog,
  type Needs,
  type PersonEntry,
  type Position,
  type SeedAgent,
  type SeenPlace,
  type SeedFile,
  type SeedProblem,
  type SeedRules,
} from "@village/shared";
import { config } from "./config";
import { resolveName } from "./decision/resolve-name";
import { createEntity, locateInside, type EntityWorld } from "./items/entity-store";
import { listPlaceEntityNames } from "./sim/place-sighting";
import { findPlaceAt } from "./world/map-loader";
import { findNearestFreeTile } from "./world/pathfinding";
import { tileIndex, type WorldMap } from "./world/types";

export interface SeededWorld {
  agents: Agent[];
  /** The map's placed objects, then every seed inventory, numbered from 1 in that order. */
  entities: Entity[];
  nextEntityId: number;
}

/** What a seed inventory may hold: every definition but the agents' body, in `items.json` order. */
export function listInventoryItems(items: ItemCatalog): { id: string; name: string }[] {
  return items.file.definitions
    .filter((definition) => definition.id !== items.world.agentBody)
    .map((definition) => ({ id: definition.id, name: definition.name }));
}

/** A blank character for the editor: no name or persona yet, with the usual starting state. */
export function buildNewAgentTemplate(): SeedAgent {
  return {
    id: "",
    name: "",
    profession: "",
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
    strength: config.seeds.newAgent.strength,
    agility: config.seeds.newAgent.agility,
    inventory: { ...config.seeds.newAgent.inventory },
    mood: "",
    goals: [],
    people: {},
    seenPlaces: [],
  };
}

export function buildSeedRules(map: WorldMap, items: ItemCatalog): SeedRules {
  return {
    traitRange: { min: config.traits.min, max: config.traits.max },
    statRange: { min: config.stats.min, max: config.stats.max },
    sleepRecoveryRange: { ...config.seeds.sleepRecoveryRange },
    agentsWithStartTiles: Object.keys(map.startTiles).sort(),
    inventoryItems: listInventoryItems(items),
    placeNames: map.places.map((place) => place.name),
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

/** The agent's start tile, or the nearest free tile when it is a wall or someone stands there. */
function findStartTile(seed: SeedAgent, map: WorldMap, takenIndexes: Set<number>): Position {
  const start = map.startTiles[seed.id];
  if (!start) {
    throw new Error(
      `Seed agent ${seed.id} has no start tile on the map; place them in the map editor`,
    );
  }
  const tile = findNearestFreeTile(map.grid, start, takenIndexes);
  if (!tile) throw new Error(`No free tile to start seed agent ${seed.id} near their start tile`);
  takenIndexes.add(tileIndex(map.grid, tile));
  return { ...tile };
}

function buildAgent(
  seed: SeedAgent,
  map: WorldMap,
  pos: Position,
  people: Record<string, PersonEntry>,
): Agent {
  return {
    id: seed.id,
    name: seed.name.trim(),
    pronouns: seed.pronouns?.trim() ?? "",
    place: findPlaceAt(map, pos),
    pos,
    personality: {
      traits: { ...seed.traits },
      core: seed.core,
      selfImage: seed.selfImage,
    },
    body: {
      sleepRecoveryPerHour: seed.sleepRecoveryPerHour,
      strength: seed.strength,
      agility: seed.agility,
    },
    profession: seed.profession,
    needs: buildStartingNeeds(),
    bodyChanges: {},
    starvingSinceTick: null,
    death: null,
    bodyReplacedById: null,
    bodyHolderId: null,
    mood: seed.mood,
    longTermGoals: seed.goals.map((goal) => ({ ...goal })),
    shortTermGoals: [],
    intention: "",
    currentAction: null,
    awareness: {},
    people,
    seenPlaces: [],
    lastThought: null,
  };
}

/** A person entry for everyone in the seed, with the fields the seed leaves out empty. */
function buildPeople(seed: SeedAgent, seedFile: SeedFile): Record<string, PersonEntry> {
  const people: Record<string, PersonEntry> = {};
  for (const [personName, seeded] of Object.entries(seed.people)) {
    const personId = resolveName(personName, seedFile.agents);
    if (personId === null) {
      if (Object.values(seeded).every((text) => text.trim() === "")) continue;
      throw new Error(`${seed.name}'s people name "${personName}", who is not in the village`);
    }
    if (personId === seed.id) continue;
    people[personId] = {
      whatIThinkOfThem: seeded.whatIThinkOfThem?.trim() ?? "",
      whatTheyThinkOfMe: seeded.whatTheyThinkOfMe?.trim() ?? "",
      whatIWantFromThem: seeded.whatIWantFromThem?.trim() ?? "",
      whatTheyWantFromMe: seeded.whatTheyWantFromMe?.trim() ?? "",
      misc: seeded.misc?.trim() ?? "",
    };
  }
  return people;
}

function seedEntities(seedFile: SeedFile, map: WorldMap, world: EntityWorld): void {
  for (const placement of map.placements) {
    const location = { kind: "tile", place: placement.place, pos: { ...placement.pos } } as const;
    createEntity(world, placement.definitionId, location, placement.label);
  }
  for (const seed of seedFile.agents) {
    for (const [definitionId, count] of Object.entries(seed.inventory)) {
      for (let made = 0; made < count; made += 1) {
        createEntity(world, definitionId, locateInside(seed.id));
      }
    }
  }
}

/** Each seeded place starts with what is really there at tick 0. */
function buildSeenPlaces(seed: SeedAgent, world: EntityWorld): SeenPlace[] {
  return [...new Set(seed.seenPlaces)].map((placeName) => ({
    name: placeName,
    firstSeenTick: 0,
    entities: { tick: 0, names: listPlaceEntityNames(world, placeName) },
  }));
}

/**
 * Builds the starting agents, with their seeded goals, person entries and seen places, and the entities: the
 * map's objects and everyone's starting inventory. Throws on any seed error.
 */
export function buildSeededWorld(
  seedFile: SeedFile,
  map: WorldMap,
  items: ItemCatalog,
): SeededWorld {
  const errors = findSeedFileProblems(seedFile, buildSeedRules(map, items)).filter(
    (problem) => problem.severity === "error",
  );
  if (errors.length > 0) {
    const descriptions = errors.map((problem) => describeProblem(seedFile, problem));
    throw new Error(`Invalid seed file:\n${descriptions.join("\n")}`);
  }
  const takenIndexes = new Set<number>();
  const agents = seedFile.agents.map((seed) =>
    buildAgent(seed, map, findStartTile(seed, map, takenIndexes), buildPeople(seed, seedFile)),
  );
  const world: EntityWorld = { agents, entities: [], nextEntityId: 1, items };
  seedEntities(seedFile, map, world);
  seedFile.agents.forEach((seed, agentIndex) => {
    const agent = agents[agentIndex];
    if (agent) agents[agentIndex] = { ...agent, seenPlaces: buildSeenPlaces(seed, world) };
  });
  return {
    agents,
    entities: world.entities,
    nextEntityId: world.nextEntityId,
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
