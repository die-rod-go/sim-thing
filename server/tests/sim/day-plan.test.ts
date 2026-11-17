import { describe, expect, it } from "vitest";
import { buildDayPlanReplySchema } from "../../src/agenda/day-plan";
import { config } from "../../src/config";
import type { FakeResponder } from "../../src/llm/fake-llm-client";
import { wakeAgent } from "../../src/sim/action-stopping";
import { getAgentRuntime } from "../../src/sim/agent-runtime";
import { takeInWaking } from "../../src/sim/agenda-reminders";
import {
  createTestSim,
  decisionReply,
  findPromptAgentName,
  promptOf,
  scriptByAgent,
} from "../../src/sim/test-sim";
import { getAgentMemory, replaceAgent } from "../../src/sim/world-access";
import { contextOf } from "./combat-test-kit";

const DAY_PLAN = buildDayPlanReplySchema().schemaName;
const PLAN = {
  agenda: [
    { text: "Bake two batches of bread", hour: null },
    { text: "Dice at the tavern", hour: 19 },
  ],
  longTermGoals: [{ goal: "Run the best bakery", reason: "Pride", progress: "Just started" }],
};
const TICKS_PER_HOUR = 60 / config.clock.minutesPerTick;

function respondWithPlan(plan: unknown, decide: FakeResponder): FakeResponder {
  return (request, callIndex) =>
    request.schemaName === DAY_PLAN ? JSON.stringify(plan) : decide(request, callIndex);
}

describe("the day plan", () => {
  it("plans the day before the first decision, and shows it as Today", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      shouldRunFirstDayPlan: true,
      responder: respondWithPlan(PLAN, scriptByAgent({})),
    });
    await sim.advance(2);
    expect(sim.records.map((record) => record.kind)).toEqual(["day_plan", "decision"]);
    expect(sim.agent("mara").agenda.map((item) => item.text)).toEqual([
      "Bake two batches of bread",
      "Dice at the tavern",
    ]);
    expect(sim.agent("mara").longTermGoals.map((goal) => goal.goal)).toEqual([
      "Run the best bakery",
    ]);
    expect(sim.records[0]?.prompt).toContain("## The question: today");
    expect(sim.records[0]?.prompt).toContain("## How the world works");
    expect(sim.records[1]?.prompt).toContain("## Today\n1. Bake two batches of bread");
  });

  it("lets a waiting agent decide anyway once its plan is long overdue", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      shouldRunFirstDayPlan: true,
      responder: respondWithPlan("not a plan", scriptByAgent({})),
    });
    await sim.advance(config.agenda.dayPlanMaxWaitTicks + 1);
    const decisionTicks = sim.records
      .filter((record) => record.kind === "decision")
      .map((record) => record.tick);
    expect(decisionTicks).toEqual([config.agenda.dayPlanMaxWaitTicks]);
  });

  it("owes a day plan after a night's sleep, but not after a nap", () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
    const minutesPerHour = TICKS_PER_HOUR * config.clock.minutesPerTick;
    takeInWaking(sim.state, "mara", minutesPerHour);
    expect(getAgentMemory(sim.state, "mara").dayPlanOwedSinceTick).toBeNull();
    takeInWaking(sim.state, "mara", config.agenda.dayPlanMinSleepHours * minutesPerHour);
    expect(getAgentMemory(sim.state, "mara").dayPlanOwedSinceTick).toBe(sim.state.tick);
  });
});

describe("keeping the agenda", () => {
  it("files an item marked done in the agent's own words and drops it from Today", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      shouldRunFirstDayPlan: true,
      responder: respondWithPlan(
        PLAN,
        scriptByAgent({
          Mara: (request) =>
            promptOf(request).includes("1. Bake two batches")
              ? decisionReply({ action: "wait", minutes: 30, done: [1] })
              : undefined,
        }),
      ),
    });
    await sim.advance(2);
    expect(sim.streamTexts("mara")).toContain("I finished: Bake two batches of bread");
    expect(sim.agent("mara").agenda.map((item) => item.number)).toEqual([2]);
  });

  it("reminds an awake agent at an item's hour, urgently, and only once", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: scriptByAgent({
        Mara: () => decisionReply({ action: "wait", minutes: config.decision.maxWaitMinutes }),
      }),
    });
    const hour = config.clock.startHour + 1;
    replaceAgent(sim.state, {
      ...sim.agent("mara"),
      agenda: [{ number: 1, text: "Meet Ilsa at the well", hour }],
      nextAgendaNumber: 2,
    });
    await sim.advance(TICKS_PER_HOUR + 2);
    const reasons = sim.client.requests
      .filter((request) => findPromptAgentName(request) === "Mara")
      .map((request) => /Just now: (.*)\./.exec(promptOf(request))?.[1] ?? null);
    expect(reasons).toEqual([null, "it is 7:00 am: Meet Ilsa at the well"]);
  });

  it("lets a sleeper sleep through an item's hour and tells it so on waking", () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
    replaceAgent(sim.state, {
      ...sim.agent("mara"),
      agenda: [{ number: 1, text: "Meet Ilsa at the well", hour: config.clock.startHour }],
      currentAction: { kind: "sleep", endsAtTick: null },
    });
    getAgentRuntime(sim.state, "mara").missedReminderNumbers = [1];
    wakeAgent(contextOf(sim), "mara");
    expect(sim.streamTexts("mara")).toContain("I slept through: Meet Ilsa at the well");
  });
});
