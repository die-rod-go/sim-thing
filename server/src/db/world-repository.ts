import { z } from "zod";
import type { Agent, Bucket, Entity, EntityLocation, EntityState, Memory } from "@village/shared";
import { simRuntimeSchema, type SimRuntime } from "../sim/agent-runtime";
import type { Database } from "./database";

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
  memories: Memory[];
  /** Null for saves made before the runtime was persisted; the sim then starts it fresh. */
  runtime: SimRuntime | null;
}

const RUNTIME_KEY = "runtime";

const OLD_SAVE_MESSAGE =
  "The saved sim was made by an older version and can't be loaded. Run `make reset` to start fresh.";

const metaSchema = z.object({
  tick: z.coerce.number().int().nonnegative(),
  nextEntityId: z.coerce.number().int().positive(),
  rngState: z.coerce.number().int().nonnegative(),
  nextEventId: z.coerce.number().int().positive(),
  speed: z.coerce.number().positive(),
  dailyTokenBudget: z.coerce.number().int().positive(),
});

type SavedMeta = z.infer<typeof metaSchema>;

/** Fields every saved agent must have; saves from before health and stats lack them. */
const currentAgentFieldsSchema = z.object({
  health: z.number(),
  starvingSinceTick: z.number().nullable(),
  conditions: z.array(z.unknown()),
  death: z.object({ tick: z.number(), cause: z.string() }).nullable(),
  body: z.object({ strength: z.number(), agility: z.number() }),
});

/** Agent rows were written by saveWorld from typed values, so a current-format row is trusted. */
function parseSavedAgent(data: string): Agent {
  const parsed: unknown = JSON.parse(data);
  if (!currentAgentFieldsSchema.safeParse(parsed).success) throw new Error(OLD_SAVE_MESSAGE);
  return parsed as Agent;
}

interface EntityRow {
  id: string;
  definition_id: string;
  label: string | null;
  location: string;
  state: string;
}

/** Entity rows were written by saveWorld from typed values, so their JSON is trusted. */
function toEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    definitionId: row.definition_id,
    label: row.label,
    location: JSON.parse(row.location) as EntityLocation,
    state: JSON.parse(row.state) as EntityState,
  };
}

interface MemoryRow {
  id: string;
  agent_id: string;
  bucket: string;
  tick: number;
  text: string;
  tags: string;
  strength: number;
  last_recalled_tick: number | null;
}

/** Replaces the whole saved world in one transaction. */
export function saveWorld(database: Database, world: SavedWorld): void {
  const meta: SavedMeta = {
    tick: world.tick,
    nextEntityId: world.nextEntityId,
    rngState: world.rngState,
    nextEventId: world.nextEventId,
    speed: world.speed,
    dailyTokenBudget: world.dailyTokenBudget,
  };
  const insertMeta = database.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
  const insertAgent = database.prepare("INSERT INTO agents (id, data) VALUES (?, ?)");
  const insertEntity = database.prepare(
    "INSERT INTO entities (id, definition_id, label, location, state) VALUES (?, ?, ?, ?, ?)",
  );
  const insertMemory = database.prepare(
    `INSERT INTO memories (id, agent_id, bucket, tick, text, tags, strength, last_recalled_tick)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  database.transaction(() => {
    for (const table of ["meta", "agents", "entities", "memories"]) {
      database.exec(`DELETE FROM ${table}`);
    }
    for (const [key, value] of Object.entries(meta)) insertMeta.run(key, String(value));
    if (world.runtime !== null) insertMeta.run(RUNTIME_KEY, JSON.stringify(world.runtime));
    for (const agent of world.agents) insertAgent.run(agent.id, JSON.stringify(agent));
    for (const entity of world.entities) {
      insertEntity.run(
        entity.id,
        entity.definitionId,
        entity.label,
        JSON.stringify(entity.location),
        JSON.stringify(entity.state),
      );
    }
    for (const memory of world.memories) {
      insertMemory.run(
        memory.id,
        memory.agentId,
        memory.bucket,
        memory.tick,
        memory.text,
        JSON.stringify(memory.tags),
        memory.strength,
        memory.lastRecalledTick,
      );
    }
  })();
}

function toMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    agentId: row.agent_id,
    bucket: row.bucket as Bucket,
    tick: row.tick,
    text: row.text,
    tags: z.array(z.string()).parse(JSON.parse(row.tags)),
    strength: row.strength,
    lastRecalledTick: row.last_recalled_tick,
  };
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
  const runtime = runtimeRow ? simRuntimeSchema.parse(JSON.parse(runtimeRow.value)) : null;

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
  const memories = (
    database.prepare("SELECT * FROM memories ORDER BY rowid").all() as MemoryRow[]
  ).map(toMemory);

  return {
    ...meta,
    nextEventId: Math.max(meta.nextEventId, (maxEventId ?? 0) + 1),
    agents,
    entities,
    memories,
    runtime: runtime && {
      ...runtime,
      nextMomentId: Math.max(runtime.nextMomentId ?? 1, (maxMomentId ?? 0) + 1),
    },
  };
}
