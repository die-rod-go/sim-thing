import type { Agent } from "@village/shared";
import { describe, expect, it } from "vitest";
import { config } from "../config";
import { makeAgent } from "../economy/test-fixtures";
import { MemoryStore } from "../memory/memory-store";
import { DAY_SUMMARY_TAG, MOOD_ENTRY_TAG } from "./reflection-memories";
import { lastPrompt, makeFakeCaller, makeMemory } from "./test-helpers";
import { runWeeklyPass } from "./weekly";

const WEEK_TICK = 7 * 24 * 60;
const OLD_GOALS: Agent["goals"] = [
  { text: "Run the best bakery", why: "pride", progress: "steady", kind: "world" },
];

function weeklyReply(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ traitChanges: [], core: null, selfImage: null, goals: [], ...overrides });
}

function traitChange(trait: string, delta: number, reason = "I spoke up more") {
  return { trait, delta, reason };
}

function makeWeekStore(): MemoryStore {
  const store = new MemoryStore();
  store.addAll([
    makeMemory({
      id: "summary",
      bucket: "reflections",
      tick: 1000,
      text: "I talked to everyone at the inn.",
      tags: [DAY_SUMMARY_TAG],
    }),
    makeMemory({
      id: "mood",
      bucket: "reflections",
      tick: 1000,
      text: "Cheerful.",
      tags: [MOOD_ENTRY_TAG],
    }),
  ]);
  return store;
}

async function runWeekly(reply: string, agent: Agent = makeAgent({ goals: OLD_GOALS })) {
  const { client, callStructured } = makeFakeCaller([reply]);
  const store = makeWeekStore();
  const result = await runWeeklyPass({ agent, health: 1, store, callStructured, tick: WEEK_TICK });
  return { result, prompt: lastPrompt(client) };
}

describe("runWeeklyPass", () => {
  it("shows traits as numbers and words, and the week's summaries and moods", async () => {
    const { prompt } = await runWeekly(weeklyReply());
    expect(prompt).toContain("extraversion: 0.00 (balanced between introvert and extrovert)");
    expect(prompt).toContain("Summary: I talked to everyone at the inn.");
    expect(prompt).toContain("Mood: Cheerful.");
    expect(prompt).toContain(
      "Wanting to be different, or having a goal to change, is not a reason",
    );
  });

  it("weekly pass clamps trait changes to 0.05", async () => {
    const { result } = await runWeekly(
      weeklyReply({
        traitChanges: [traitChange("extraversion", 0.4), traitChange("neuroticism", -0.3)],
      }),
    );
    const { traits } = result.agent.personality;
    expect(traits.extraversion).toBeCloseTo(config.traits.weeklyDeltaClamp);
    expect(traits.neuroticism).toBeCloseTo(-config.traits.weeklyDeltaClamp);
  });

  it("weekly pass keeps traits within -1..1", async () => {
    const agent = makeAgent();
    agent.personality.traits.openness = 0.98;
    agent.personality.traits.agreeableness = -1;
    const { result } = await runWeekly(
      weeklyReply({
        traitChanges: [traitChange("openness", 0.05), traitChange("agreeableness", -0.05)],
      }),
      agent,
    );
    expect(result.agent.personality.traits.openness).toBe(config.traits.max);
    expect(result.agent.personality.traits.agreeableness).toBe(config.traits.min);
    expect(result.changes.map((change) => change.field)).toEqual(["openness"]);
  });

  it("weekly pass logs a personality change with its reason", async () => {
    const { result } = await runWeekly(
      weeklyReply({
        traitChanges: [traitChange("Extraversion", 0.03, "I spent every evening at the inn")],
        selfImage: "a friendlier baker",
      }),
    );
    expect(result.changes).toEqual([
      {
        agentId: "mara",
        tick: WEEK_TICK,
        field: "extraversion",
        oldValue: "0",
        newValue: "0.03",
        reason: "I spent every evening at the inn",
      },
      expect.objectContaining({
        field: "selfImage",
        oldValue: "dependable",
        newValue: "a friendlier baker",
      }),
    ]);
    expect(result.agent.personality.selfImage).toBe("a friendlier baker");
  });

  it("keeps the old goals when the reply has none", async () => {
    const { result } = await runWeekly(weeklyReply({ goals: [] }));
    expect(result.agent.goals).toEqual(OLD_GOALS);
  });

  it("replaces the goals with the revised list", async () => {
    const newGoals = [
      { text: "Teach Clara to bake", why: "she asked", progress: "just started", kind: "social" },
    ];
    const { result } = await runWeekly(weeklyReply({ goals: newGoals }));
    expect(result.agent.goals).toEqual(newGoals);
  });
});
