import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";

export type Database = BetterSqlite3.Database;

export const IN_MEMORY_DATABASE = ":memory:";

const schemaPath = fileURLToPath(new URL("./schema.sql", import.meta.url));

/** Opens (creating if needed) the sim database and applies the schema. */
export function openDatabase(databasePath: string): Database {
  if (databasePath !== IN_MEMORY_DATABASE) mkdirSync(dirname(databasePath), { recursive: true });
  const database = new BetterSqlite3(databasePath);
  database.pragma("journal_mode = WAL");
  dropEntitiesFromBeforeComponents(database);
  database.exec(readFileSync(schemaPath, "utf8"));
  return database;
}

/** Entities used to store a `state` column; the old rows are unreadable, and the agents row check then asks for `make reset`. */
function dropEntitiesFromBeforeComponents(database: Database): void {
  const columns = database.prepare("PRAGMA table_info(entities)").all() as { name: string }[];
  if (columns.some((column) => column.name === "state")) database.exec("DROP TABLE entities");
}

/**
 * Deletes every saved row, for a reset. `token_usage` is kept: the daily spend cap must not be
 * bypassable by resetting the world.
 */
export function wipeDatabase(database: Database): void {
  const tables = [
    "meta",
    "agents",
    "entities",
    "memories",
    "events",
    "llm_calls",
    "personality_history",
    "moments",
  ];
  database.transaction(() => {
    for (const table of tables) database.exec(`DELETE FROM ${table}`);
  })();
}
