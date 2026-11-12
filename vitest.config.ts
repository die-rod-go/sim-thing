import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Threads without per-file isolation cut module loading from ~15s to ~4s. Test files then share
    // module state within a worker, so tests must not mutate module-level values such as config.
    pool: "threads",
    isolate: false,
    include: ["shared/src/**/*.test.ts", "server/src/**/*.test.ts", "client/src/**/*.test.ts"],
  },
});
