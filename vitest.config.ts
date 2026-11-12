import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Threads without per-file isolation cut module loading from ~15s to ~4s. Test files then share
    // module state within a worker, so tests must not mutate module-level values such as config.
    pool: "threads",
    isolate: false,
    // More workers than this only add contention: the suite takes as long on four as on seven, and
    // leaving cores free keeps the dev server, the editor and other test runs responsive.
    maxWorkers: "50%",
    // Sim tests and the full item-editor render pass in a few seconds alone but run up to ten
    // times slower when the whole suite shares the CPU.
    testTimeout: 60000,
    include: ["shared/src/**/*.test.ts", "server/src/**/*.test.ts", "client/src/**/*.test.ts"],
  },
});
