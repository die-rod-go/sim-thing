import { describe, expect, it } from "vitest";
import {
  computeDaylightTint,
  computeHourOfDay,
  type DaylightKeyframe,
} from "../../src/village/daylight";

const KEYFRAMES: DaylightKeyframe[] = [
  { hour: 0, color: [0, 0, 100], alpha: 0.5 },
  { hour: 12, color: [200, 100, 0], alpha: 0 },
  { hour: 24, color: [0, 0, 100], alpha: 0.5 },
];

describe("daylight", () => {
  it("reads the hour of day from the sim clock", () => {
    expect(computeHourOfDay(90, { minutesPerTick: 1, startHour: 6 })).toBe(7.5);
    expect(computeHourOfDay(18 * 60, { minutesPerTick: 1, startHour: 6 })).toBe(0);
  });

  it("blends the tint between the surrounding keyframes", () => {
    expect(computeDaylightTint(6, KEYFRAMES)).toBe("rgba(100, 50, 50, 0.250)");
    expect(computeDaylightTint(12, KEYFRAMES)).toBe("rgba(200, 100, 0, 0.000)");
    expect(computeDaylightTint(0, KEYFRAMES)).toBe("rgba(0, 0, 100, 0.500)");
  });
});
