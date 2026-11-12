import { describe, expect, it } from "vitest";
import { makeAgent } from "../economy/test-fixtures";
import { MemoryIdGenerator, MemoryStore } from "../memory/memory-store";
import { runMorningPass } from "./morning";
import { runNightPass } from "./night";
import { DAY_SUMMARY_TAG, MOOD_ENTRY_TAG } from "./reflection-memories";
import { lastPrompt, makeFakeCaller, makeMemory } from "./test-helpers";
import { runWeeklyPass } from "./weekly";

const API_FAILURE = new Error("service unavailable");

describe("runMorningPass", () => {
  it("writes the daily plan and mood from the reply, shown last night's reflection", async () => {
    const { client, callStructured } = makeFakeCaller([
      '{"dailyPlan":"Bake early, then visit Bob.","mood":"hopeful"}',
    ]);
    const recentReflections = [
      makeMemory({
        id: "r1",
        bucket: "reflections",
        text: "Bob owes me bread.",
        tags: [DAY_SUMMARY_TAG],
      }),
      makeMemory({
        id: "r2",
        bucket: "reflections",
        text: "Tired but proud.",
        tags: [MOOD_ENTRY_TAG],
      }),
    ];
    const agent = await runMorningPass({
      agent: makeAgent({ needs: { hunger: 0.4, energy: 1, social: 0.5, fun: 0.8 } }),
      health: 1,
      recentReflections,
      otherAgents: [],
      callStructured,
      tick: 1500,
      timeText: "Day 2, 07:00",
    });
    expect(agent.dailyPlan).toBe("Bake early, then visit Bob.");
    expect(agent.mood).toBe("hopeful");
    const prompt = lastPrompt(client);
    expect(prompt).toContain("Summary: Bob owes me bread.");
    expect(prompt).toContain("Mood: Tired but proud.");
    expect(prompt).toContain("quite hungry");
    expect(prompt).not.toMatch(/0\.4/);
  });

  it("keeps the old mood when the reply leaves it out", async () => {
    const { callStructured } = makeFakeCaller(['{"dailyPlan":"Rest.","mood":null}']);
    const agent = await runMorningPass({
      agent: makeAgent({ mood: "calm" }),
      health: 1,
      recentReflections: [],
      otherAgents: [],
      callStructured,
      tick: 0,
      timeText: "Day 1, 06:00",
    });
    expect(agent).toMatchObject({ dailyPlan: "Rest.", mood: "calm" });
  });

  it("shows plans and the dossier of a person named in a goal, and takes the revised plans", async () => {
    const { client, callStructured } = makeFakeCaller([
      JSON.stringify({
        dailyPlan: "Court Bob.",
        plans: [{ aim: "Buy the mill", steps: ["Save coins", "Ask Bob"], keepFrom: "Clara" }],
        mood: null,
      }),
    ]);
    const agent = await runMorningPass({
      agent: makeAgent({
        goals: [{ text: "Befriend Bob", why: "lonely", progress: "none", kind: "social" }],
        plans: [{ aim: "Old scheme", steps: ["Wait"], keepFrom: "" }],
        dossiers: { bob: { text: "Owns the mill.", updatedTick: 1 } },
      }),
      health: 1,
      recentReflections: [],
      otherAgents: [{ id: "bob", name: "Bob" }],
      callStructured,
      tick: 0,
      timeText: "Day 1, 06:00",
    });
    const prompt = lastPrompt(client);
    expect(prompt).toContain("Plan 1: Old scheme. Next: Wait.");
    expect(prompt).toContain("Bob: Owns the mill.");
    expect(agent.plans).toEqual([
      { aim: "Buy the mill", steps: ["Save coins", "Ask Bob"], keepFrom: "Clara" },
    ]);
  });
});

describe("failed reflection calls", () => {
  it("a failed reflection call leaves the agent unchanged", async () => {
    const agent = makeAgent({ dailyPlan: "old plan", mood: "calm" });
    const morning = makeFakeCaller([API_FAILURE, API_FAILURE]);
    const morningAgent = await runMorningPass({
      agent,
      health: 1,
      recentReflections: [],
      otherAgents: [],
      callStructured: morning.callStructured,
      tick: 0,
      timeText: "Day 1, 06:00",
    });
    expect(morningAgent).toEqual(agent);

    const store = new MemoryStore();
    store.add(makeMemory({ id: "kept", strength: 0.9 }));
    const night = makeFakeCaller(["not json", "still not json"]);
    const nightResult = await runNightPass({
      agent,
      health: 1,
      store,
      idGenerator: new MemoryIdGenerator(),
      callStructured: night.callStructured,
      tick: 100,
      knownNames: [],
      otherAgents: [],
    });
    expect(nightResult).toMatchObject({ agent, addedMemories: [], succeeded: false });
    expect(store.size).toBe(1);

    const weekly = makeFakeCaller([API_FAILURE, API_FAILURE]);
    const weeklyResult = await runWeeklyPass({
      agent,
      health: 1,
      store,
      callStructured: weekly.callStructured,
      tick: 100,
    });
    expect(weeklyResult).toEqual({ agent, changes: [] });
  });
});
