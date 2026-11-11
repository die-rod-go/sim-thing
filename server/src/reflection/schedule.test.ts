import { describe, expect, it } from "vitest";
import {
  createReflectionSchedule,
  findDaytimeWindowStart,
  isDaytimePassDue,
  isMorningPassDue,
  isNightPassDue,
  isWeeklyPassDue,
  recordDaytimePass,
  recordNightPass,
  recordSleepStart,
  recordWake,
} from "./schedule";
import { TICKS_PER_HOUR } from "./test-helpers";

/** The clock starts at 06:00, so 02:00 on day 1 is 20 hours in. */
const TWO_AM_TICK = 20 * TICKS_PER_HOUR;
const NOT_STARTING_SLEEP = { isStartingSleep: false };
const STARTING_SLEEP = { isStartingSleep: true };

describe("reflection schedule", () => {
  it("morning pass is due after a sleep of four hours or more", () => {
    const asleep = recordSleepStart(createReflectionSchedule(), 100);
    expect(isMorningPassDue(asleep, 100 + 4 * TICKS_PER_HOUR)).toBe(true);
    expect(isMorningPassDue(asleep, 100 + 8 * TICKS_PER_HOUR)).toBe(true);
  });

  it("no morning pass after a short nap", () => {
    const asleep = recordSleepStart(createReflectionSchedule(), 100);
    expect(isMorningPassDue(asleep, 100 + 2 * TICKS_PER_HOUR)).toBe(false);
    expect(
      isMorningPassDue(recordWake(asleep, 100 + 2 * TICKS_PER_HOUR), 100 + 8 * TICKS_PER_HOUR),
    ).toBe(false);
  });

  it("night pass runs when starting sleep but not twice within 16 hours", () => {
    const fresh = createReflectionSchedule();
    expect(isNightPassDue(fresh, 600, STARTING_SLEEP)).toBe(true);
    expect(isNightPassDue(fresh, 600, NOT_STARTING_SLEEP)).toBe(false);
    const afterPass = recordNightPass(fresh, 600);
    expect(isNightPassDue(afterPass, 600 + 15 * TICKS_PER_HOUR, STARTING_SLEEP)).toBe(false);
    expect(isNightPassDue(afterPass, 600 + 16 * TICKS_PER_HOUR, STARTING_SLEEP)).toBe(true);
  });

  it("night pass is forced at 02:00 for an agent still awake", () => {
    const awake = createReflectionSchedule();
    expect(isNightPassDue(awake, TWO_AM_TICK, NOT_STARTING_SLEEP)).toBe(true);
    expect(isNightPassDue(awake, TWO_AM_TICK - TICKS_PER_HOUR, NOT_STARTING_SLEEP)).toBe(false);
    const asleep = recordSleepStart(awake, TWO_AM_TICK - TICKS_PER_HOUR);
    expect(isNightPassDue(asleep, TWO_AM_TICK, NOT_STARTING_SLEEP)).toBe(false);
    const reflectedEarlier = recordNightPass(awake, TWO_AM_TICK - 2 * TICKS_PER_HOUR);
    expect(isNightPassDue(reflectedEarlier, TWO_AM_TICK, NOT_STARTING_SLEEP)).toBe(false);
  });

  it("daytime pass is due two awake hours after the last one", () => {
    const fresh = createReflectionSchedule();
    expect(isDaytimePassDue(fresh, 2 * TICKS_PER_HOUR - 1)).toBe(false);
    expect(isDaytimePassDue(fresh, 2 * TICKS_PER_HOUR)).toBe(true);
    const afterPass = recordDaytimePass(fresh, 2 * TICKS_PER_HOUR);
    expect(isDaytimePassDue(afterPass, 3 * TICKS_PER_HOUR)).toBe(false);
    expect(isDaytimePassDue(afterPass, 4 * TICKS_PER_HOUR)).toBe(true);
  });

  it("no daytime pass while asleep", () => {
    const asleep = recordSleepStart(createReflectionSchedule(), 100);
    expect(isDaytimePassDue(asleep, 100 + 6 * TICKS_PER_HOUR)).toBe(false);
  });

  it("waking and the night pass restart the daytime count", () => {
    const wakeTick = 30 * TICKS_PER_HOUR;
    const woken = recordWake(recordSleepStart(createReflectionSchedule(), 0), wakeTick);
    expect(findDaytimeWindowStart(woken)).toBe(wakeTick);
    expect(isDaytimePassDue(woken, wakeTick + TICKS_PER_HOUR)).toBe(false);
    expect(isDaytimePassDue(woken, wakeTick + 2 * TICKS_PER_HOUR)).toBe(true);
    const afterNight = recordNightPass(createReflectionSchedule(), TWO_AM_TICK);
    expect(isDaytimePassDue(afterNight, TWO_AM_TICK + TICKS_PER_HOUR)).toBe(false);
  });

  it("weekly pass follows every seventh night pass", () => {
    let schedule = createReflectionSchedule();
    const weeklyAfter: number[] = [];
    for (let night = 1; night <= 14; night += 1) {
      schedule = recordNightPass(schedule, night * 24 * TICKS_PER_HOUR);
      if (isWeeklyPassDue(schedule)) weeklyAfter.push(night);
    }
    expect(weeklyAfter).toEqual([7, 14]);
  });
});
