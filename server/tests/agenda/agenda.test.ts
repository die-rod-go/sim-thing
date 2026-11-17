import { describe, expect, it } from "vitest";
import {
  applyAgendaChanges,
  describeAgenda,
  describeAgendaItem,
  describeReminderReason,
  findDueReminders,
  replaceAgenda,
} from "../../src/agenda/agenda";
import { buildDayPlanReplySchema } from "../../src/agenda/day-plan";
import { config } from "../../src/config";
import { makeAgent } from "../economy/test-fixtures";

const TICKS_PER_HOUR = 60 / config.clock.minutesPerTick;
/** The tick at which the given hour of day 1 begins. */
function tickAtHour(hour: number): number {
  return (hour - config.clock.startHour) * TICKS_PER_HOUR;
}

describe("the agenda", () => {
  it("numbers a new agenda on from where the last one left off", () => {
    const agent = replaceAgenda(makeAgent(), [
      { text: "Bake two batches", hour: null },
      { text: "Dice at the tavern", hour: 19 },
    ]);
    expect(agent.agenda.map((item) => item.number)).toEqual([1, 2]);
    const next = replaceAgenda(agent, [{ text: "Sleep early", hour: null }]);
    expect(next.agenda).toEqual([{ number: 3, text: "Sleep early", hour: null }]);
    expect(next.agendaRevision).toBe(agent.agendaRevision + 1);
  });

  it("reads each item with its number, and its hour when it has one", () => {
    expect(describeAgendaItem({ number: 3, text: "Dice at the tavern", hour: 19 })).toBe(
      "3. 7:00 pm: Dice at the tavern",
    );
    expect(describeAgenda([])).toBe(config.agenda.nothingPlannedText);
  });

  it("files finished and dropped items in the agent's own words and adds new ones", () => {
    const planned = replaceAgenda(makeAgent(), [
      { text: "Bake two batches", hour: null },
      { text: "Fit the lock", hour: null },
    ]);
    const { agent, streamTexts } = applyAgendaChanges(planned, {
      done: [1],
      dropped: [2],
      added: [{ text: "Buy wheat from Wil", hour: null }],
    });
    expect(streamTexts).toEqual(["I finished: Bake two batches", "I gave up on: Fit the lock"]);
    expect(agent.agenda).toEqual([{ number: 3, text: "Buy wheat from Wil", hour: null }]);
  });

  it("ignores numbers it doesn't hold and adds no more than allowed", () => {
    const planned = replaceAgenda(makeAgent(), [{ text: "Bake", hour: null }]);
    const many = Array.from(
      { length: config.agenda.maxAddedPerDecision + 2 },
      (_unused, index) => ({
        text: `extra ${index}`,
        hour: null,
      }),
    );
    const { agent, streamTexts } = applyAgendaChanges(planned, {
      done: [99],
      dropped: [],
      added: many,
    });
    expect(streamTexts).toEqual([]);
    expect(agent.agenda).toHaveLength(1 + config.agenda.maxAddedPerDecision);
  });

  it("leaves the agent as it was when nothing changed", () => {
    const planned = replaceAgenda(makeAgent(), [{ text: "Bake", hour: null }]);
    const { agent } = applyAgendaChanges(planned, { done: [], dropped: [], added: [] });
    expect(agent).toBe(planned);
  });

  it("reminds of an item on the first tick of its hour, and only once", () => {
    const agenda = [{ number: 4, text: "Dice at the tavern", hour: 19 }];
    expect(findDueReminders(agenda, tickAtHour(19), [])).toEqual(agenda);
    expect(findDueReminders(agenda, tickAtHour(19) + 1, [])).toEqual([]);
    expect(findDueReminders(agenda, tickAtHour(19), [4])).toEqual([]);
    expect(describeReminderReason(agenda[0]!)).toBe("it is 7:00 pm: Dice at the tavern");
  });

  it("keeps a day plan to the most items allowed and checks each item's hour", () => {
    const { schema } = buildDayPlanReplySchema();
    const items = Array.from({ length: config.agenda.maxItems + 2 }, () => ({
      text: "Bake",
      hour: null,
    }));
    const parsed = schema.parse({ agenda: items, longTermGoals: null });
    expect(parsed.agenda).toHaveLength(config.agenda.maxItems);
    const lateHour = { agenda: [{ text: "Bake", hour: 24 }], longTermGoals: null };
    expect(schema.safeParse(lateHour).success).toBe(false);
  });
});
