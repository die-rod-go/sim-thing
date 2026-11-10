import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { formatSimTime } from "@village/shared";
import { config } from "./config";
import { openDatabase, wipeDatabase, type Database } from "./db/database";
import { appendEvent } from "./db/log-repository";
import { loadWorld, saveWorld } from "./db/world-repository";
import { createLogger } from "./logger";
import { buildSeededWorld, loadSeedFile } from "./seeds";
import { SimLoop } from "./sim/loop";
import { createRandomWalkStrategy } from "./sim/random-walk";
import { createRealScheduler } from "./sim/scheduler";
import {
  createDefaultSettings,
  createWorldState,
  restoreWorldState,
  toSavedWorld,
  type SimSettings,
  type WorldState,
} from "./sim/world-state";
import { loadWorldMap } from "./world/map-loader";
import type { WorldMap } from "./world/types";
import { startSimServer } from "./ws/sim-server";

const logger = createLogger("main");
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const timeSettings = {
  minutesPerTick: config.clock.minutesPerTick,
  startHour: config.clock.startHour,
};

const environmentSchema = z.object({
  SIM_PORT: z.coerce.number().int().min(0).max(65535).default(config.server.defaultPort),
  SIM_DATABASE_PATH: z.string().min(1).default(config.server.defaultDatabasePath),
});

function loadEnvironment(): z.infer<typeof environmentSchema> {
  const envFilePath = resolve(repositoryRoot, ".env");
  if (existsSync(envFilePath)) process.loadEnvFile(envFilePath);
  return environmentSchema.parse({
    SIM_PORT: process.env.SIM_PORT || undefined,
    SIM_DATABASE_PATH: process.env.SIM_DATABASE_PATH || undefined,
  });
}

function seedNewWorld(map: WorldMap): WorldState {
  const seedFile = loadSeedFile(resolve(repositoryRoot, config.server.seedsPath));
  return createWorldState(map, buildSeededWorld(seedFile, map));
}

function saveState(database: Database, state: WorldState, settings: SimSettings): void {
  saveWorld(database, toSavedWorld(state, settings));
  logger.info(`saved world at tick ${state.tick} (${formatSimTime(state.tick, timeSettings)})`);
}

function resetDatabase(database: Database, map: WorldMap, settings: SimSettings): WorldState {
  wipeDatabase(database);
  const state = seedNewWorld(map);
  saveState(database, state, settings);
  return state;
}

async function run(): Promise<void> {
  const environment = loadEnvironment();
  const databasePath =
    environment.SIM_DATABASE_PATH === ":memory:"
      ? environment.SIM_DATABASE_PATH
      : resolve(repositoryRoot, environment.SIM_DATABASE_PATH);
  const database = openDatabase(databasePath);
  const map = loadWorldMap(resolve(repositoryRoot, config.server.mapPath));

  if (process.argv.includes("--reset-only")) {
    resetDatabase(database, map, createDefaultSettings());
    database.close();
    logger.info(`reset ${databasePath} from the seed file`);
    return;
  }

  const saved = loadWorld(database);
  const restored = saved ? restoreWorldState(saved, map) : null;
  const settings = restored?.settings ?? createDefaultSettings();
  const initialState = restored?.state ?? resetDatabase(database, map, settings);
  logger.info(
    `${restored ? "resumed" : "seeded"} world at ${formatSimTime(initialState.tick, timeSettings)}`,
  );

  const loop = new SimLoop({
    state: initialState,
    advanceTick: createRandomWalkStrategy(),
    scheduler: createRealScheduler(),
    speed: settings.speed,
  });
  loop.addTickListener((result, state) => {
    for (const event of result.events) appendEvent(database, event);
    if (state.tick % config.clock.saveEveryTicks === 0) saveState(database, state, settings);
  });

  const server = await startSimServer({
    port: environment.SIM_PORT,
    loop,
    database,
    settings,
    countInFlightLlmCalls: () => 0,
    resetWorld: () =>
      loop.runBetweenTicks(() => loop.replaceState(resetDatabase(database, map, settings))),
  });
  loop.start();

  let isShuttingDown = false;
  const shutDown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`${signal} received; saving and shutting down`);
    await loop.stop();
    saveState(database, loop.getState(), settings);
    await server.close();
    database.close();
    process.exit(0);
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      shutDown(signal).catch((error: unknown) => {
        logger.error("shutdown failed", error);
        process.exit(1);
      });
    });
  }
}

run().catch((error: unknown) => {
  logger.error("sim server failed to start", error);
  process.exit(1);
});
