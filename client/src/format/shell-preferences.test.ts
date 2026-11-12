import { describe, expect, it } from "vitest";
import { describeClockFace } from "./clock-face";
import { clampSidePanelWidth } from "./shell-layout";
import { cycleAgentId, resolveShortcut } from "./shortcuts";
import {
  parseStoredBoolean,
  parseStoredChoice,
  parseStoredNumber,
  parseStoredStoryFilter,
  serializeStoryFilter,
} from "./stored-preferences";

const DAYLIGHT = { dayStartHour: 6, nightStartHour: 20 };
const TIME_SETTINGS = { minutesPerTick: 1, startHour: 6 };
const MINUTES_PER_HOUR = 60;

describe("describeClockFace", () => {
  it("labels the day and time and shows the sun by day", () => {
    expect(describeClockFace(0, TIME_SETTINGS, DAYLIGHT)).toEqual({
      label: "Day 1 · 06:00",
      isDaytime: true,
    });
  });

  it("shows the moon after nightfall", () => {
    const tenPm = (22 - 6) * MINUTES_PER_HOUR;
    expect(describeClockFace(tenPm, TIME_SETTINGS, DAYLIGHT).isDaytime).toBe(false);
  });
});

describe("resolveShortcut", () => {
  it("maps keys to sim controls and ignores unbound keys", () => {
    expect(resolveShortcut(" ")).toEqual({ kind: "toggle_pause" });
    expect(resolveShortcut("2")).toEqual({ kind: "set_speed_option", optionIndex: 1 });
    expect(resolveShortcut("]")).toEqual({ kind: "cycle_agent", direction: 1 });
    expect(resolveShortcut("f")).toBeNull();
  });
});

describe("cycleAgentId", () => {
  const agentIds = ["ada", "bob", "clara"];

  it("wraps around in both directions", () => {
    expect(cycleAgentId(agentIds, "clara", 1)).toBe("ada");
    expect(cycleAgentId(agentIds, "ada", -1)).toBe("clara");
  });

  it("starts at an end when nobody is selected", () => {
    expect(cycleAgentId(agentIds, null, 1)).toBe("ada");
    expect(cycleAgentId(agentIds, null, -1)).toBe("clara");
    expect(cycleAgentId([], null, 1)).toBeNull();
  });
});

describe("clampSidePanelWidth", () => {
  const bounds = {
    minSidePanelWidthPx: 300,
    maxSidePanelWidthPx: 800,
    maxSidePanelWindowFraction: 0.5,
  };

  it("keeps the panel within its bounds and half the window", () => {
    expect(clampSidePanelWidth(100, 1600, bounds)).toBe(300);
    expect(clampSidePanelWidth(900, 1600, bounds)).toBe(800);
    expect(clampSidePanelWidth(700, 1000, bounds)).toBe(500);
  });
});

describe("stored preferences", () => {
  it("falls back to null on missing or malformed values", () => {
    expect(parseStoredNumber(null, 0, 10)).toBeNull();
    expect(parseStoredNumber("abc", 0, 10)).toBeNull();
    expect(parseStoredNumber("99", 0, 10)).toBe(10);
    expect(parseStoredBoolean("yes")).toBeNull();
    expect(parseStoredChoice("memory", ["overview", "memory"] as const)).toBe("memory");
    expect(parseStoredChoice("gone", ["overview"] as const)).toBeNull();
    expect(parseStoredStoryFilter("{not json")).toBeNull();
  });

  it("round-trips a story filter and drops unknown categories", () => {
    const filter = {
      agentId: "ada",
      place: null,
      categories: new Set(["speech", "sleep"] as const),
      isShowingMoments: true,
      isShowingActionsInThreads: true,
    };
    expect(parseStoredStoryFilter(serializeStoryFilter(filter))).toEqual(filter);
    const withUnknown = JSON.stringify({ agentId: null, place: null, categories: ["speech", "x"] });
    expect(parseStoredStoryFilter(withUnknown)?.categories).toEqual(new Set(["speech"]));
  });
});
