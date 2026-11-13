import { describe, expect, it } from "vitest";
import { makeAgent } from "../economy/test-fixtures";
import { config } from "../config";
import { MemoryIdGenerator, MemoryStore } from "../memory/memory-store";
import { runDaytimePass } from "./daytime";
import type { DaytimePassInput } from "./daytime";
import { INSIGHT_TAG } from "./reflection-memories";
import { lastPrompt, makeFakeCaller, makeMemory, TICKS_PER_HOUR } from "./test-helpers";

const LAST_REFLECTION_TICK = 2 * TICKS_PER_HOUR;
const DAYTIME_TICK = 4 * TICKS_PER_HOUR;

function daytimeReply(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    thinking: "Bob may not be real.",
    insights: [{ text: "Nobody has actually met the miller Bob keeps talking about." }],
    mood: "uneasy",
    ...overrides,
  });
}

function setUpDaytime(reply: string, store = new MemoryStore()) {
  const { client, callStructured } = makeFakeCaller([reply]);
  const input: DaytimePassInput = {
    agent: makeAgent({ mood: "busy", intention: "Wait for the miller" }),
    health: 1,
    store,
    idGenerator: new MemoryIdGenerator(),
    callStructured,
    tick: DAYTIME_TICK,
    sinceTick: LAST_REFLECTION_TICK,
    knownNames: ["Bob", "bakery"],
    otherAgents: [{ id: "bob", name: "Bob" }],
  };
  return { client, input, store };
}

function storeWithMemories(): MemoryStore {
  const store = new MemoryStore();
  store.addAll([
    makeMemory({ id: "before", tick: LAST_REFLECTION_TICK - 1, text: "I baked bread" }),
    makeMemory({
      id: "since",
      bucket: "overheard",
      tick: LAST_REFLECTION_TICK + 30,
      text: 'I overheard Bob say: "The miller is on his way."',
    }),
  ]);
  return store;
}

describe("runDaytimePass", () => {
  it("files insights as reflections and updates the mood", async () => {
    const { input, store } = setUpDaytime(daytimeReply(), storeWithMemories());
    const result = await runDaytimePass(input);
    const insights = store
      .listByAgentAndBucket("mara", "reflections")
      .filter((memory) => memory.tags.includes(INSIGHT_TAG));
    expect(insights.map((memory) => memory.text)).toEqual([
      "Nobody has actually met the miller Bob keeps talking about.",
    ]);
    expect(insights[0]?.tick).toBe(DAYTIME_TICK);
    expect(result.insights).toEqual([
      "Nobody has actually met the miller Bob keeps talking about.",
    ]);
    expect(result.agent.mood).toBe("uneasy");
  });

  it("shows only memories filed since the last reflection", async () => {
    const { client, input } = setUpDaytime(daytimeReply(), storeWithMemories());
    await runDaytimePass(input);
    const prompt = lastPrompt(client);
    expect(prompt).toContain("The miller is on his way.");
    expect(prompt).not.toContain("I baked bread");
    expect(prompt).toContain("Wait for the miller");
  });

  it("asks for private thinking without asking for an audit of what was seen and told", async () => {
    const { client, input } = setUpDaytime(daytimeReply(), storeWithMemories());
    await runDaytimePass(input);
    const prompt = lastPrompt(client);
    expect(prompt).toContain("how they would react if they knew what you are after");
    expect(prompt).not.toContain("Keep apart what you saw yourself");
    expect(prompt).not.toContain("Weigh what you saw");
  });

  it("applies goal progress, plans and dossiers, and the thinking is stored nowhere", async () => {
    const reply = daytimeReply({
      goalProgress: [
        { goal: 2, progress: "Bob agreed" },
        { goal: 9, progress: "ignored" },
      ],
      plans: [{ aim: "Win Bob over", steps: ["Bring him bread"], keepFrom: "Clara" }],
      dossiers: [
        { person: "Bob", text: "Agreed to trade." },
        { person: "Nobody", text: "dropped" },
      ],
    });
    const { input, store } = setUpDaytime(reply, storeWithMemories());
    const agent = makeAgent({
      goals: [
        { text: "Bake rye", why: "pride", progress: "none", kind: "world" },
        { text: "Befriend Bob", why: "lonely", progress: "met once", kind: "social" },
      ],
    });
    const result = await runDaytimePass({ ...input, agent });
    expect(result.agent.goals.map((goal) => goal.progress)).toEqual(["none", "Bob agreed"]);
    expect(result.agent.plans).toEqual([
      { aim: "Win Bob over", steps: ["Bring him bread"], keepFrom: "Clara" },
    ]);
    expect(result.agent.dossiers.bob?.text).toBe("Agreed to trade.");
    expect(Object.keys(result.agent.dossiers)).toEqual(["bob"]);
    const filedTexts = store.listByAgent("mara").map((memory) => memory.text);
    expect(filedTexts.some((text) => text.includes("Bob may not be real"))).toBe(false);
  });

  it("keeps the current plans when the reply gives null", async () => {
    const plans = [{ aim: "Win Bob over", steps: ["Bring bread"], keepFrom: "" }];
    const { input } = setUpDaytime(daytimeReply({ plans: null }), storeWithMemories());
    const result = await runDaytimePass({ ...input, agent: makeAgent({ plans }) });
    expect(result.agent.plans).toEqual(plans);
  });

  it("trims plans and steps over the limits and files at most the daytime insight limit", async () => {
    const tooManyPlans = Array.from({ length: 5 }, (_unused, index) => ({
      aim: `Aim ${index}`,
      steps: Array.from({ length: 8 }, (_step, stepIndex) => `Step ${stepIndex}`),
      keepFrom: "",
    }));
    const insights = Array.from({ length: 4 }, (_unused, index) => ({ text: `Thought ${index}.` }));
    const { input } = setUpDaytime(
      daytimeReply({ plans: tooManyPlans, insights }),
      storeWithMemories(),
    );
    const result = await runDaytimePass(input);
    expect(result.agent.plans).toHaveLength(config.plans.maxPlans);
    expect(result.agent.plans[0]?.steps).toHaveLength(config.plans.maxSteps);
    expect(result.insights).toHaveLength(config.reflection.daytimeMaxInsights);
  });

  it("shows the plans and the dossier of a person named in a plan", async () => {
    const { client, input } = setUpDaytime(daytimeReply(), storeWithMemories());
    const agent = makeAgent({
      plans: [{ aim: "Get Bob to share the mill", steps: ["Ask nicely"], keepFrom: "" }],
      dossiers: { bob: { text: "Owns the mill.", updatedTick: 1 } },
    });
    await runDaytimePass({ ...input, agent });
    const prompt = lastPrompt(client);
    expect(prompt).toContain("Plan 1: Get Bob to share the mill. Next: Ask nicely.");
    expect(prompt).toContain("Bob: Owns the mill.");
  });

  it("skips the call when nothing new was filed", async () => {
    const { client, input } = setUpDaytime(daytimeReply());
    const result = await runDaytimePass(input);
    expect(client.requests).toHaveLength(0);
    expect(result.insights).toEqual([]);
    expect(result.agent).toBe(input.agent);
  });

  it("keeps the mood and adds nothing when there are no insights", async () => {
    const reply = daytimeReply({ insights: [], mood: null });
    const { input, store } = setUpDaytime(reply, storeWithMemories());
    const result = await runDaytimePass(input);
    expect(result.addedMemories).toEqual([]);
    expect(result.agent.mood).toBe("busy");
    expect(store.listByAgentAndBucket("mara", "reflections")).toEqual([]);
  });
});
