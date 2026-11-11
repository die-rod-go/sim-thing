import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { formatSimTime } from "@village/shared";
import { config } from "./config";
import { openDatabase, wipeDatabase, type Database } from "./db/database";
import {
  appendEvent,
  appendLlmCall,
  appendMoment,
  appendPersonalityChange,
  createTokenUsageStore,
} from "./db/log-repository";
import { loadWorld, saveWorld } from "./db/world-repository";
import { buildLlmStack, llmProviderSchema } from "./llm/llm-stack";
import type { TokenBudget } from "./llm/token-budget";
import { createLogger } from "./logger";
import { createSeedEditor } from "./seed-editor";
import { buildSeededWorld, loadSeedFile } from "./seeds";
import { SimLoop } from "./sim/loop";
import { createReflectionHook } from "./sim/reflection-passes";
import { createRealScheduler } from "./sim/scheduler";
import { createDecisionStrategy } from "./sim/tick-pipeline";
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
  LLM_PROVIDER: llmProviderSchema,
});

function loadEnvironment(): z.infer<typeof environmentSchema> {
  const envFilePath = resolve(repositoryRoot, ".env");
  if (existsSync(envFilePath)) process.loadEnvFile(envFilePath);
  return environmentSchema.parse({
    SIM_PORT: process.env.SIM_PORT || undefined,
    SIM_DATABASE_PATH: process.env.SIM_DATABASE_PATH || undefined,
    LLM_PROVIDER: process.env.LLM_PROVIDER?.trim().toLowerCase() || undefined,
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

function describeBudgetPause(budget: TokenBudget): string | null {
  if (!budget.isOverBudget()) return null;
  return (
    `Daily token budget reached (${budget.tokensToday} of ${budget.dailyTokenBudget} tokens). ` +
    "Raise the budget in settings to resume."
  );
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

  const llm = buildLlmStack({
    provider: environment.LLM_PROVIDER,
    tokenUsageStore: createTokenUsageStore(database),
    dailyTokenBudget: settings.dailyTokenBudget,
    recordLlmCall: (record) => appendLlmCall(database, record),
  });
  logger.info(`LLM provider: ${environment.LLM_PROVIDER} (model ${llm.client.model})`);
  const findPauseReason = () => describeBudgetPause(llm.budget);

  const loop = new SimLoop({
    state: initialState,
    advanceTick: createDecisionStrategy({
      callStructured: llm.callStructured,
      shouldDecideInBackground: config.decision.shouldDecideInBackground,
      reflectionHook: createReflectionHook({
        callStructured: llm.callStructured,
        recordPersonalityChange: (change) => {
          appendPersonalityChange(database, change);
        },
      }),
    }),
    scheduler: createRealScheduler(),
    speed: settings.speed,
  });
  loop.addTickListener((result, state) => {
    for (const event of result.events) appendEvent(database, event);
    for (const moment of result.moments) appendMoment(database, moment);
    if (state.tick % config.clock.saveEveryTicks === 0) saveState(database, state, settings);
    const pauseReason = findPauseReason();
    if (pauseReason !== null) loop.pause(pauseReason);
  });

  const server = await startSimServer({
    port: environment.SIM_PORT,
    loop,
    database,
    settings,
    countInFlightLlmCalls: () => llm.limiter.inFlightCount,
    tokenBudget: llm.budget,
    findPauseReason,
    seedEditor: createSeedEditor({
      seedFilePath: resolve(repositoryRoot, config.server.seedsPath),
      map,
    }),
    resetWorld: () =>
      loop.runBetweenTicks(() => loop.replaceState(resetDatabase(database, map, settings))),
  });
  loop.start();
  const startupPauseReason = findPauseReason();
  if (startupPauseReason !== null) loop.pause(startupPauseReason);

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
