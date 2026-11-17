import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config";
import { createLogger } from "./logger";
import { buildReport } from "./measure/report";
import { readSaveRecords } from "./measure/save-reader";

/**
 * `npm run measure -w @village/server [-- <database path>]`: what a saved run did, read from its
 * database without changing it and without any LLM call, printed as Markdown.
 */
const logger = createLogger("measure");
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

function main(): void {
  const givenPath = process.argv[2] ?? config.server.defaultDatabasePath;
  const records = readSaveRecords(resolve(repositoryRoot, givenPath));
  process.stdout.write(buildReport(records, givenPath));
}

try {
  main();
} catch (error: unknown) {
  logger.error("measurement failed", error);
  process.exit(1);
}
