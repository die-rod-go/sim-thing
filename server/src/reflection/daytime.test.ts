import { describe, expect, it } from "vitest";
import { makeAgent } from "../economy/test-fixtures";
import { MemoryIdGenerator, MemoryStore } from "../memory/memory-store";
import { runDaytimePass } from "./daytime";
import type { DaytimePassInput } from "./daytime";
import { INSIGHT_TAG } from "./reflection-memories";
import { lastPrompt, makeFakeCaller, makeMemory, TICKS_PER_HOUR } from "./test-helpers";

const LAST_REFLECTION_TICK = 2 * TICKS_PER_HOUR;
const DAYTIME_TICK = 4 * TICKS_PER_HOUR;

function daytimeReply(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
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

  it("asks the agent to weigh what it only heard against what it saw", async () => {
    const { client, input } = setUpDaytime(daytimeReply(), storeWithMemories());
    await runDaytimePass(input);
    expect(lastPrompt(client)).toContain("what you only heard or assumed");
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
