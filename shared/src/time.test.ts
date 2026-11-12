import { describe, expect, it } from "vitest";
import { formatSimTime, formatTimeOfDay, toSimTime } from "./time";

const settings = { minutesPerTick: 1, startHour: 6 };

describe("sim time", () => {
  it("starts at 6:00 am on day 1", () => {
    expect(formatSimTime(0, settings)).toBe("Day 1, 6:00 am");
  });

  it("rolls over to the next day at midnight", () => {
    expect(toSimTime(18 * 60, settings)).toEqual({ day: 2, hour: 0, minute: 0 });
  });

  it("shows noon and midnight as 12 pm and 12 am", () => {
    expect(formatTimeOfDay({ hour: 12, minute: 0 })).toBe("12:00 pm");
    expect(formatTimeOfDay({ hour: 0, minute: 5 })).toBe("12:05 am");
  });

  it("shows afternoon hours on a twelve-hour clock", () => {
    expect(formatTimeOfDay({ hour: 14, minute: 32 })).toBe("2:32 pm");
  });
});
