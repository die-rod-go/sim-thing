import { z } from "zod";
import type { Agent, AgentMemory, ComponentChanges, Entity, EntityLocation } from "@village/shared";
import { simRuntimeSchema, type SimRuntime } from "../sim/agent-runtime";
import type { Database } from "./database";
import { agentMemorySchema } from "./memory-schema";

/** Everything needed to resume a sim, apart from the map, which is reloaded from its file. */
export interface SavedWorld {
  tick: number;
  rngState: number;
  nextEventId: number;
  speed: number;
  dailyTokenBudget: number;
  agents: Agent[];
  entities: Entity[];
  nextEntityId: number;
  nextFreshId: number;
  /** What each agent remembers, by agent id. */
  agentMemories: Record<string, AgentMemory>;
  runtime: SimRuntime;
}

const RUNTIME_KEY = "runtime";

const OLD_SAVE_MESSAGE =
  "The saved sim was made by an older version and can't be loaded. Run `make reset` to start fresh.";

const metaSchema = z.object({
  tick: z.coerce.number().int().nonnegative(),
  nextEntityId: z.coerce.number().int().positive(),
  nextFreshId: z.coerce.number().int().positive(),
  rngState: z.coerce.number().int().nonnegative(),
  nextEventId: z.coerce.number().int().positive(),
  speed: z.coerce.number().positive(),
  dailyTokenBudget: z.coerce.number().int().positive(),
});

type SavedMeta = z.infer<typeof metaSchema>;

/** Fields every saved agent must have; a save without them is from an older version. */
const currentAgentFieldsSchema = z.object({
  bodyChanges: z.record(z.string(), z.unknown()),
  bodyReplacedById: z.string().nullable(),
  seenPlaces: z.array(z.unknown()),
});

/** Agent rows were written by saveWorld from typed values, so a current-format row is trusted. */
function parseSavedAgent(data: string): Agent {
  const parsed: unknown = JSON.parse(data);
  if (!currentAgentFieldsSchema.safeParse(parsed).success) throw new Error(OLD_SAVE_MESSAGE);
  return parsed as Agent;
}

function parseSavedMemory(data: string): AgentMemory {
  const parsed = agentMemorySchema.safeParse(JSON.parse(data));
  if (!parsed.success) throw new Error(OLD_SAVE_MESSAGE, { cause: parsed.error });
  return parsed.data;
}

interface EntityRow {
  id: string;
  definition_id: string;
  label: string | null;
  location: string;
  changes: string;
}

/** Entity rows were written by saveWorld from typed values, so their JSON is trusted. */
function toEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    definitionId: row.definition_id,
    label: row.label,
    location: JSON.parse(row.location) as EntityLocation,
    changes: JSON.parse(row.changes) as ComponentChanges,
  };
}

/** Replaces the whole saved world in one transaction. */
export function saveWorld(database: Database, world: SavedWorld): void {
  const meta: SavedMeta = {
    tick: world.tick,
    nextEntityId: world.nextEntityId,
    nextFreshId: world.nextFreshId,
    rngState: world.rngState,
    nextEventId: world.nextEventId,
    speed: world.speed,
    dailyTokenBudget: world.dailyTokenBudget,
  };
  const insertMeta = database.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
  const insertAgent = database.prepare("INSERT INTO agents (id, data) VALUES (?, ?)");
  const insertEntity = database.prepare(
    "INSERT INTO entities (id, definition_id, label, location, changes) VALUES (?, ?, ?, ?, ?)",
  );
  const insertMemory = database.prepare(
    "INSERT INTO agent_memories (agent_id, data) VALUES (?, ?)",
  );
  database.transaction(() => {
    for (const table of ["meta", "agents", "entities", "agent_memories"]) {
      database.exec(`DELETE FROM ${table}`);
    }
    for (const [key, value] of Object.entries(meta)) insertMeta.run(key, String(value));
    insertMeta.run(RUNTIME_KEY, JSON.stringify(world.runtime));
    for (const agent of world.agents) insertAgent.run(agent.id, JSON.stringify(agent));
    for (const entity of world.entities) {
      insertEntity.run(
        entity.id,
        entity.definitionId,
        entity.label,
        JSON.stringify(entity.location),
        JSON.stringify(entity.changes),
      );
    }
    for (const [agentId, memory] of Object.entries(world.agentMemories)) {
      insertMemory.run(agentId, JSON.stringify(memory));
    }
  })();
}

/** Loads the saved world, or null if nothing has been saved yet. */
export function loadWorld(database: Database): SavedWorld | null {
  const metaRows = database.prepare("SELECT key, value FROM meta").all() as {
    key: string;
    value: string;
  }[];
  if (metaRows.length === 0) return null;
  const parsedMeta = metaSchema.safeParse(
    Object.fromEntries(metaRows.map((row) => [row.key, row.value])),
  );
  if (!parsedMeta.success) throw new Error(OLD_SAVE_MESSAGE, { cause: parsedMeta.error });
  const meta = parsedMeta.data;
  const runtimeRow = metaRows.find((row) => row.key === RUNTIME_KEY);
  if (!runtimeRow) throw new Error(OLD_SAVE_MESSAGE);
  const parsedRuntime = simRuntimeSchema.safeParse(JSON.parse(runtimeRow.value));
  if (!parsedRuntime.success) throw new Error(OLD_SAVE_MESSAGE, { cause: parsedRuntime.error });
  const runtime = parsedRuntime.data;

  // Events are appended every tick but the world is saved less often, so after a crash the log
  // can be ahead of the saved counter; never hand out an id that is already taken.
  const { maxEventId } = database.prepare("SELECT MAX(id) AS maxEventId FROM events").get() as {
    maxEventId: number | null;
  };
  const { maxMomentId } = database.prepare("SELECT MAX(id) AS maxMomentId FROM moments").get() as {
    maxMomentId: number | null;
  };

  const agents = database
    .prepare("SELECT data FROM agents ORDER BY rowid")
    .all()
    .map((row) => parseSavedAgent((row as { data: string }).data));
  const entities = (
    database.prepare("SELECT * FROM entities ORDER BY rowid").all() as EntityRow[]
  ).map(toEntity);
  const memoryRows = database.prepare("SELECT agent_id, data FROM agent_memories").all() as {
    agent_id: string;
    data: string;
  }[];
  const agentMemories = Object.fromEntries(
    memoryRows.map((row) => [row.agent_id, parseSavedMemory(row.data)]),
  );

  return {
    ...meta,
    nextEventId: Math.max(meta.nextEventId, (maxEventId ?? 0) + 1),
    agents,
    entities,
    agentMemories,
    runtime: {
      ...runtime,
      nextMomentId: Math.max(runtime.nextMomentId, (maxMomentId ?? 0) + 1),
    },
  };
}
