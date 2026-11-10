import { z } from "zod";
import type { Agent, Bucket, Memory, WorldObject } from "@village/shared";
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
  objects: WorldObject[];
  memories: Memory[];
  /** Null for saves made before the runtime was persisted; the sim then starts it fresh. */
  runtime: SimRuntime | null;
}

const RUNTIME_KEY = "runtime";

const metaSchema = z.object({
  tick: z.coerce.number().int().nonnegative(),
  rngState: z.coerce.number().int().nonnegative(),
  nextEventId: z.coerce.number().int().positive(),
  speed: z.coerce.number().positive(),
  dailyTokenBudget: z.coerce.number().int().positive(),
});

type SavedMeta = z.infer<typeof metaSchema>;

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
    rngState: world.rngState,
    nextEventId: world.nextEventId,
    speed: world.speed,
    dailyTokenBudget: world.dailyTokenBudget,
  };
  const insertMeta = database.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
  const insertAgent = database.prepare("INSERT INTO agents (id, data) VALUES (?, ?)");
  const insertObject = database.prepare("INSERT INTO objects (id, data) VALUES (?, ?)");
  const insertMemory = database.prepare(
    `INSERT INTO memories (id, agent_id, bucket, tick, text, tags, strength, last_recalled_tick)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  database.transaction(() => {
    for (const table of ["meta", "agents", "objects", "memories"]) {
      database.exec(`DELETE FROM ${table}`);
    }
    for (const [key, value] of Object.entries(meta)) insertMeta.run(key, String(value));
    if (world.runtime !== null) insertMeta.run(RUNTIME_KEY, JSON.stringify(world.runtime));
    for (const agent of world.agents) insertAgent.run(agent.id, JSON.stringify(agent));
    for (const object of world.objects) insertObject.run(object.id, JSON.stringify(object));
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
  const meta = metaSchema.parse(Object.fromEntries(metaRows.map((row) => [row.key, row.value])));
  const runtimeRow = metaRows.find((row) => row.key === RUNTIME_KEY);
  const runtime = runtimeRow ? simRuntimeSchema.parse(JSON.parse(runtimeRow.value)) : null;

  // Events are appended every tick but the world is saved less often, so after a crash the log
  // can be ahead of the saved counter; never hand out an id that is already taken.
  const { maxEventId } = database.prepare("SELECT MAX(id) AS maxEventId FROM events").get() as {
    maxEventId: number | null;
  };

  // Rows were written by saveWorld from typed values, so they are trusted as those types.
  const agents = database
    .prepare("SELECT data FROM agents ORDER BY rowid")
    .all()
    .map((row) => JSON.parse((row as { data: string }).data) as Agent);
  const objects = database
    .prepare("SELECT data FROM objects ORDER BY rowid")
    .all()
    .map((row) => JSON.parse((row as { data: string }).data) as WorldObject);
  const memories = (
    database.prepare("SELECT * FROM memories ORDER BY rowid").all() as MemoryRow[]
  ).map(toMemory);

  return {
    ...meta,
    nextEventId: Math.max(meta.nextEventId, (maxEventId ?? 0) + 1),
    agents,
    objects,
    memories,
    runtime,
  };
}
