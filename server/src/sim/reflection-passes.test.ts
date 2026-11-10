import { describe, expect, it } from "vitest";
import type { PersonalityChange } from "@village/shared";
import { createFakeResponder } from "../llm/fake-responder";
import { createTestSim, decisionReply } from "./test-sim";

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
          ? decisionReply({ action: "interact", target: "rose cottage bed", interaction: "sleep" })
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

    await sim.advance(6 * 60);
    const morning = sim.records.find((record) => record.kind === "morning");
    expect(morning).toBeDefined();
    expect(morning?.prompt).toContain("I went about my work and talked with a few people.");
    expect(sim.agent("mara").dailyPlan).toBe(
      "Work in the morning, eat at midday, see who is around in the afternoon.",
    );
    expect(sim.state.reflectionSchedules.mara?.sleepStartedAtTick).toBeNull();
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
    };
    const ticksTo2am = 20 * 60;
    await sim.advance(ticksTo2am + 1);
    expect(sim.records.filter((record) => record.kind === "weekly")).toHaveLength(1);
    expect(changes).toHaveLength(1);
    const weekly = sim.records.find((record) => record.kind === "weekly");
    expect(changes[0]).toMatchObject({ agentId: "mara", tick: weekly?.tick });
    expect(sim.state.reflectionSchedules.mara?.nightPassCount).toBeGreaterThanOrEqual(7);
    expect(changes[0]?.reason).toContain("This week");
  });
});
