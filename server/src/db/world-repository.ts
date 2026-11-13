import { z } from "zod";
import type {
  Agent,
  Bucket,
  ComponentChanges,
  Dossier,
  Entity,
  EntityLocation,
  Memory,
  Plan,
} from "@village/shared";
import { resolveName } from "../decision/resolve-name";
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
  nextFreshId: number;
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
  nextFreshId: z.coerce.number().int().positive(),
  rngState: z.coerce.number().int().nonnegative(),
  nextEventId: z.coerce.number().int().positive(),
  speed: z.coerce.number().positive(),
  dailyTokenBudget: z.coerce.number().int().positive(),
});

type SavedMeta = z.infer<typeof metaSchema>;

/** Fields every saved agent must have; older saves lack `bodyChanges` or `bodyReplacedById`. */
const currentAgentFieldsSchema = z.object({
  bodyChanges: z.record(z.string(), z.unknown()),
  starvingSinceTick: z.number().nullable(),
  death: z.object({ tick: z.number(), cause: z.string() }).nullable(),
  bodyReplacedById: z.string().nullable(),
  body: z.object({ strength: z.number(), agility: z.number() }),
});

/** A saved agent; saves from before dossiers lack them. */
type SavedAgent = Omit<Agent, "dossiers" | "plans"> & {
  dossiers?: Record<string, Dossier>;
  plans?: Plan[];
};

/** Agent rows were written by saveWorld from typed values, so a current-format row is trusted. */
function parseSavedAgent(data: string): SavedAgent {
  const parsed: unknown = JSON.parse(data);
  if (!currentAgentFieldsSchema.safeParse(parsed).success) throw new Error(OLD_SAVE_MESSAGE);
  return parsed as SavedAgent;
}

/** Saves from before dossiers kept a `people` bucket of memories. */
const LEGACY_PEOPLE_BUCKET = "people";

/**
 * Dossiers for an agent saved without any, from its seed people notes: the `people` memories filed
 * at tick 0, as "Name: note". Later people notes are dropped on purpose, since many recorded
 * intended outcomes as facts. A note whose person is no longer in the village is dropped too.
 */
function buildDossiersFromLegacyNotes(
  agent: SavedAgent,
  agents: readonly SavedAgent[],
  legacyRows: readonly MemoryRow[],
): Record<string, Dossier> {
  const dossiers: Record<string, Dossier> = {};
  const seedNotes = legacyRows.filter((row) => row.agent_id === agent.id && row.tick === 0);
  for (const row of seedNotes) {
    const separatorIndex = row.text.indexOf(": ");
    if (separatorIndex < 0) continue;
    const personId = resolveName(row.text.slice(0, separatorIndex), agents);
    if (personId === null || personId === agent.id) continue;
    dossiers[personId] = { text: row.text.slice(separatorIndex + 2), updatedTick: 0 };
  }
  return dossiers;
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
        JSON.stringify(entity.changes),
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

  const savedAgents = database
    .prepare("SELECT data FROM agents ORDER BY rowid")
    .all()
    .map((row) => parseSavedAgent((row as { data: string }).data));
  const entities = (
    database.prepare("SELECT * FROM entities ORDER BY rowid").all() as EntityRow[]
  ).map(toEntity);
  const memoryRows = database.prepare("SELECT * FROM memories ORDER BY rowid").all() as MemoryRow[];
  const legacyRows = memoryRows.filter((row) => row.bucket === LEGACY_PEOPLE_BUCKET);
  const memories = memoryRows.filter((row) => row.bucket !== LEGACY_PEOPLE_BUCKET).map(toMemory);
  const agents = savedAgents.map((agent): Agent => ({
    ...agent,
    plans: agent.plans ?? [],
    dossiers: agent.dossiers ?? buildDossiersFromLegacyNotes(agent, savedAgents, legacyRows),
  }));

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
