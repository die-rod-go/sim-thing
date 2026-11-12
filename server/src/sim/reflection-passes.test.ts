import { describe, expect, it } from "vitest";
import type { PersonalityChange } from "@village/shared";
import type { FakeReply } from "../llm/fake-llm-client";
import { createFakeResponder } from "../llm/fake-responder";
import { createTestSim, decisionReply } from "./test-sim";

/** An agent awake from the start first thinks things over two sim-hours in. */
const DAYTIME_START_TICK = 2 * 60;

describe("reflection hook", () => {
  it("writes a night reflection on falling asleep and a morning plan after a night's sleep", async () => {
    const fake = createFakeResponder();
    let decisionCount = 0;
    const sim = createTestSim({
      agentIds: ["mara"],
      reflection: () => undefined,
      responder: (request, callIndex) => {
        if (request.schemaName !== "decision_reply") return fake(request, callIndex);
        decisionCount += 1;
        return decisionCount === 1
          ? decisionReply({ action: "interact", item: "rose cottage bed", verb: "sleep" })
          : decisionReply({ action: "wait", minutes: 240 });
      },
    });
    sim.placeAgent("mara", { x: 4, y: 3 });
    const mara = sim.agent("mara");
    sim.state.agents[0] = { ...mara, needs: { ...mara.needs, energy: 0.3 } };
    await sim.advance();
    expect(sim.agent("mara").currentAction?.kind).toBe("sleep");
    expect(sim.records.map((record) => record.kind)).toEqual(["decision", "night"]);
    expect(sim.state.reflectionSchedules.mara).toMatchObject({
      lastNightPassTick: 0,
      nightPassCount: 1,
      sleepStartedAtTick: 0,
    });
    const summaries = sim.state.memoryStore.listByAgentAndBucket("mara", "reflections");
    expect(summaries.map((memory) => memory.text)).toContain(
      "I went about my work and talked with a few people.",
    );
    expect(sim.results[0]?.moments).toContainEqual(
      expect.objectContaining({
        agentId: "mara",
        kind: "reflection",
        pass: "night",
        summary: "I went about my work and talked with a few people.",
      }),
    );

    await sim.advance(6 * 60);
    const morning = sim.records.find((record) => record.kind === "morning");
    expect(morning).toBeDefined();
    expect(morning?.prompt).toContain("I went about my work and talked with a few people.");
    expect(sim.agent("mara").dailyPlan).toBe(
      "Work in the morning, eat at midday, see who is around in the afternoon.",
    );
    const planMoments = sim.results
      .flatMap((result) => result.moments)
      .filter((moment) => moment.kind === "daily_plan");
    expect(planMoments).toHaveLength(1);
    expect(sim.state.reflectionSchedules.mara?.sleepStartedAtTick).toBeNull();
  });

  it("an awake agent thinks things over every two hours and keeps the thought in mind", async () => {
    const fake = createFakeResponder();
    const sim = createTestSim({
      agentIds: ["mara"],
      reflection: () => undefined,
      responder: (request, callIndex) =>
        request.schemaName === "decision_reply"
          ? decisionReply({ action: "say", minutes: 60, say: "Is anyone about?" })
          : fake(request, callIndex),
    });
    await sim.advance(2 * 60 + 1);
    const daytimeRecords = sim.records.filter((record) => record.kind === "daytime");
    expect(daytimeRecords).toHaveLength(1);
    expect(daytimeRecords[0]?.prompt).toContain("Is anyone about?");
    expect(sim.agent("mara").workingMemory).toContainEqual(
      expect.stringContaining("I thought: The work goes better when I keep at it."),
    );
    expect(sim.state.reflectionSchedules.mara?.lastReflectionTick).toBe(daytimeRecords[0]?.tick);
  });

  it("keeps the clock running while a daytime pass thinks, and files the thought once it arrives", async () => {
    const fake = createFakeResponder();
    const heldDaytimeReplies: (() => void)[] = [];
    const sim = createTestSim({
      agentIds: ["mara"],
      reflection: () => undefined,
      shouldCallLlmInBackground: true,
      responder: (request, callIndex) => {
        if (request.schemaName === "decision_reply") {
          return decisionReply({ action: "say", minutes: 60, say: "Is anyone about?" });
        }
        const reply = fake(request, callIndex);
        if (request.schemaName !== "daytime_reply") return reply;
        return new Promise<FakeReply>((release) => heldDaytimeReplies.push(() => release(reply)));
      },
    });
    await sim.advance(DAYTIME_START_TICK + 5);
    expect(heldDaytimeReplies).toHaveLength(1);
    expect(sim.state.reflectionSchedules.mara?.lastReflectionTick).not.toBe(DAYTIME_START_TICK);
    expect(sim.agent("mara").workingMemory).not.toContainEqual(
      expect.stringContaining("I thought:"),
    );
    heldDaytimeReplies[0]?.();
    await new Promise((resolveSettled) => setTimeout(resolveSettled, 0));
    await sim.advance();
    expect(sim.agent("mara").workingMemory).toContainEqual(
      expect.stringContaining("I thought: The work goes better when I keep at it."),
    );
    expect(sim.records.find((record) => record.kind === "daytime")?.tick).toBe(DAYTIME_START_TICK);
    expect(sim.state.reflectionSchedules.mara?.lastReflectionTick).toBe(DAYTIME_START_TICK);
  });

  it("runs the weekly pass after the seventh night and records personality changes", async () => {
    const changes: Omit<PersonalityChange, "id">[] = [];
    const sim = createTestSim({
      agentIds: ["mara"],
      reflection: (change) => changes.push(change),
      responder: createFakeResponder(),
    });
    sim.state.reflectionSchedules.mara = {
      lastNightPassTick: null,
      nightPassCount: 6,
      sleepStartedAtTick: null,
      lastReflectionTick: null,
    };
    const ticksTo2am = 20 * 60;
    await sim.advance(ticksTo2am + 1);
    expect(sim.records.filter((record) => record.kind === "weekly")).toHaveLength(1);
    expect(changes).toHaveLength(1);
    const weekly = sim.records.find((record) => record.kind === "weekly");
    expect(changes[0]).toMatchObject({ agentId: "mara", tick: weekly?.tick });
    expect(sim.state.reflectionSchedules.mara?.nightPassCount).toBeGreaterThanOrEqual(7);
    expect(changes[0]?.reason).toContain("This week");
    const personalityMoments = sim.results
      .flatMap((result) => result.moments)
      .filter((moment) => moment.kind === "personality_changed");
    expect(personalityMoments).toHaveLength(1);
    expect(personalityMoments[0]).toMatchObject({ agentId: "mara", reason: changes[0]?.reason });
  });

  it("plans the first morning for an awake agent with no plan, but not after a restart when it has one", async () => {
    const fresh = createTestSim({
      agentIds: ["mara"],
      reflection: () => undefined,
      responder: createFakeResponder(),
    });
    await fresh.advance();
    expect(fresh.records.filter((record) => record.kind === "morning")).toHaveLength(1);
    expect(fresh.agent("mara").dailyPlan).not.toBe("");

    const restarted = createTestSim({
      agentIds: ["mara"],
      reflection: () => undefined,
      responder: createFakeResponder(),
    });
    const mara = restarted.agent("mara");
    restarted.state.agents[0] = { ...mara, dailyPlan: "Bake, then rest." };
    await restarted.advance();
    expect(restarted.records.filter((record) => record.kind === "morning")).toHaveLength(0);

    const planned = createTestSim({
      agentIds: ["mara"],
      reflection: () => undefined,
      responder: createFakeResponder(),
    });
    const unplanned = planned.agent("mara");
    planned.state.agents[0] = {
      ...unplanned,
      plans: [{ aim: "Buy the mill", steps: ["Save coins"], keepFrom: "" }],
    };
    await planned.advance();
    expect(planned.records.filter((record) => record.kind === "morning")).toHaveLength(0);
  });
});
