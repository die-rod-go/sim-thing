import { describe, expect, it } from "vitest";
import { clientConfig } from "../clientConfig";
import { buildSocketUrl, computeReconnectDelayMs } from "./simConnection";

describe("simConnection helpers", () => {
  it("uses wss on https pages and ws otherwise", () => {
    expect(buildSocketUrl({ protocol: "https:", host: "sim.local" })).toBe("wss://sim.local/ws");
    expect(buildSocketUrl({ protocol: "http:", host: "localhost:5173" })).toBe(
      "ws://localhost:5173/ws",
    );
  });

  it("backs off exponentially up to the configured maximum", () => {
    const { initialReconnectDelayMs, maxReconnectDelayMs } = clientConfig.connection;
    expect(computeReconnectDelayMs(0)).toBe(initialReconnectDelayMs);
    expect(computeReconnectDelayMs(1)).toBeGreaterThan(initialReconnectDelayMs);
    expect(computeReconnectDelayMs(50)).toBe(maxReconnectDelayMs);
  });
});
