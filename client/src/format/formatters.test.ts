import { describe, expect, it } from "vitest";
import {
  computeTickDurationMs,
  formatCount,
  formatCountdown,
  formatLatency,
  formatMinutesAgo,
  formatParsedReply,
  parsePositiveInteger,
} from "./formatters";

describe("formatters", () => {
  it("groups thousands in counts", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
  });

  it("describes elapsed sim-minutes in minutes and hours", () => {
    expect(formatMinutesAgo(0)).toBe("just now");
    expect(formatMinutesAgo(5)).toBe("5 min ago");
    expect(formatMinutesAgo(120)).toBe("2 h ago");
    expect(formatMinutesAgo(125)).toBe("2 h 5 min ago");
  });

  it("shows sub-second latency in milliseconds and longer in seconds", () => {
    expect(formatLatency(930)).toBe("930 ms");
    expect(formatLatency(2450)).toBe("2.5 s");
  });

  it("matches tick duration to speed and caps it", () => {
    expect(computeTickDurationMs(1, 4, 1000)).toBe(250);
    expect(computeTickDurationMs(0.8, 1, 1000)).toBe(1000);
    expect(computeTickDurationMs(0, 1, 1000)).toBe(1000);
  });

  it("pretty-prints parsed objects and passes strings through", () => {
    expect(formatParsedReply({ action: "wait" })).toBe('{\n  "action": "wait"\n}');
    expect(formatParsedReply("raw")).toBe("raw");
    expect(formatParsedReply(null)).toBe("(nothing parsed)");
  });

  it("accepts only positive whole numbers as a budget", () => {
    expect(parsePositiveInteger("2,000,000")).toBe(2_000_000);
    expect(parsePositiveInteger("0")).toBeNull();
    expect(parsePositiveInteger("1.5")).toBeNull();
    expect(parsePositiveInteger("-3")).toBeNull();
    expect(parsePositiveInteger("abc")).toBeNull();
  });

  it("formats a countdown with hours only when there are any, rounding seconds up", () => {
    expect(formatCountdown(90 * 60_000)).toBe("1:30:00");
    expect(formatCountdown(4 * 60_000 + 6_200)).toBe("4:07");
    expect(formatCountdown(-500)).toBe("0:00");
  });
});
