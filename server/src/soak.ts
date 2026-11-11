import { createLogger } from "./logger";
import { runSoak } from "./sim/soak-run";

/** `npm run soak -w @village/server [-- <sim-days>]`: the full headless soak on the fake LLM. */
const logger = createLogger("soak");
const MINUTES_PER_DAY = 1440;
const DEFAULT_DAYS = 3;
/** From this many days on, the run must also show a weekly personality change. */
const WEEKLY_DAYS = 7;

async function main(): Promise<void> {
  const days = Number(process.argv[2] ?? DEFAULT_DAYS);
  const startedAt = performance.now();
  const report = await runSoak({
    ticks: days * MINUTES_PER_DAY,
    onHour: (tick) => {
      if (tick % MINUTES_PER_DAY === 0) logger.info(`day ${tick / MINUTES_PER_DAY} done`);
    },
  });
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  logger.info(
    `${report.ticks} ticks, ${report.llmCalls} LLM calls, ${report.events} events in ${seconds}s`,
  );
  logger.info(`${report.personalityChanges.length} personality changes`);
  logger.info(`${report.deaths.length} deaths`, report.deaths);
  if (days >= WEEKLY_DAYS && report.personalityChanges.length === 0) {
    report.problems.push("no personality change after a week");
  }
  if (report.problems.length > 0) {
    logger.error(`${report.problems.length} problems`, report.problems.slice(0, 20));
    process.exit(1);
  }
  logger.info("soak passed");
}

main().catch((error: unknown) => {
  logger.error("soak crashed", error);
  process.exit(1);
});
