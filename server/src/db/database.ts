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
  database.exec(readFileSync(schemaPath, "utf8"));
  return database;
}

/** Deletes every saved row, for a reset. */
export function wipeDatabase(database: Database): void {
  const tables = [
    "meta",
    "agents",
    "objects",
    "memories",
    "events",
    "llm_calls",
    "token_usage",
    "personality_history",
  ];
  database.transaction(() => {
    for (const table of tables) database.exec(`DELETE FROM ${table}`);
  })();
}
