import { describe, expect, it } from "vitest";
import { formatSimTime, toSimTime } from "./time";

const settings = { minutesPerTick: 1, startHour: 6 };

describe("sim time", () => {
  it("starts at 06:00 on day 1", () => {
    expect(formatSimTime(0, settings)).toBe("Day 1, 06:00");
  });

  it("rolls over to the next day at midnight", () => {
    expect(toSimTime(18 * 60, settings)).toEqual({ day: 2, hour: 0, minute: 0 });
  });
});
