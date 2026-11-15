import { describe, expect, it } from "vitest";
import type { LongTermGoal } from "@village/shared";
import { buildGoalMoments, buildPersonalityMoments } from "./moments";
import { createTestSim, decisionReply } from "./test-sim";

const MARA = { id: "mara", name: "Mara" };

function makeGoal(goal: string, progress: string): LongTermGoal {
  return { goal, reason: "it matters", progress };
}

describe("moments", () => {
  it("reports added, removed and progressed goals by matching goal text", () => {
    const before = [makeGoal("Bake rye", "tried once"), makeGoal("Fix the roof", "")];
    const after = [makeGoal("Bake rye", "sold three loaves"), makeGoal("Open a stall", "")];
    const moments = buildGoalMoments(MARA, 40, before, after);
    expect(moments.map((moment) => moment.kind)).toEqual([
      "goal_progressed",
      "goal_added",
      "goal_removed",
    ]);
    expect(moments[0]).toMatchObject({ previousProgress: "tried once", agentName: "Mara" });
  });

  it("reports nothing when the goals are unchanged", () => {
    const goals = [makeGoal("Bake rye", "tried once")];
    expect(buildGoalMoments(MARA, 40, goals, goals)).toEqual([]);
  });

  it("phrases trait changes by direction", () => {
    const [moment] = buildPersonalityMoments(MARA, [
      {
        agentId: "mara",
        tick: 9,
        field: "openness",
        oldValue: "0.3",
        newValue: "0.25",
        reason: "a hard week",
      },
    ]);
    expect(moment?.text).toBe("openness fell from 0.3 to 0.25");
  });

  it("records a failed action as a moment with the event's id", async () => {
    let homePlace = "";
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: () => decisionReply({ action: "walk_to", target: homePlace }),
    });
    homePlace = sim.agent("mara").place;
    const [result] = await sim.advance();
    const failure = result?.events.find((event) => event.kind === "action_failed");
    expect(result?.moments).toEqual([
      expect.objectContaining({ id: 1, kind: "action_failed", eventId: failure?.id }),
    ]);
    expect(sim.state.nextMomentId).toBe(2);
  });

  it("keeps the latest decision's thought on the agent and on its speech", async () => {
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: () =>
        decisionReply({ thought: "Someone should hear this.", say: "Hello!", action: "wait" }),
    });
    const [result] = await sim.advance();
    expect(sim.agent("mara").lastThought).toEqual({ text: "Someone should hear this.", tick: 0 });
    const speech = result?.events.find((event) => event.kind === "said")?.speech;
    expect(speech).toMatchObject({ thought: "Someone should hear this.", llmCallId: 1 });
  });
});
