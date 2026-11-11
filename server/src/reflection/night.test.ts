import { describe, expect, it } from "vitest";
import { config } from "../config";
import { makeAgent } from "../economy/test-fixtures";
import { MemoryIdGenerator, MemoryStore } from "../memory/memory-store";
import { runNightPass } from "./night";
import type { NightPassInput } from "./night";
import { DAY_SUMMARY_TAG, INSIGHT_TAG, MOOD_ENTRY_TAG } from "./reflection-memories";
import { lastPrompt, makeFakeCaller, makeMemory, TICKS_PER_HOUR } from "./test-helpers";

const NIGHT_TICK = 20 * TICKS_PER_HOUR;

function nightReply(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    summary: "I baked all day and Bob paid me.",
    moodEntry: "Tired but content.",
    insights: [{ text: "Bob keeps his word." }, { text: "Mornings are my best hours." }],
    peopleNotes: [],
    ...overrides,
  });
}

function setUpNight(reply: string, store = new MemoryStore()) {
  const { client, callStructured } = makeFakeCaller([reply]);
  const input: NightPassInput = {
    agent: makeAgent({ mood: "busy" }),
    health: 1,
    store,
    idGenerator: new MemoryIdGenerator(),
    callStructured,
    tick: NIGHT_TICK,
    knownNames: ["Bob", "Clara", "bakery"],
    otherAgentNames: ["Bob", "Clara"],
  };
  return { client, input, store };
}

describe("runNightPass", () => {
  it("night pass stores summary, mood entry and insights as reflections", async () => {
    const { input, store } = setUpNight(nightReply());
    const result = await runNightPass(input);
    const reflections = store.listByAgentAndBucket("mara", "reflections");
    expect(reflections).toHaveLength(4);
    expect(result.addedMemories).toEqual(expect.arrayContaining(reflections));
    const summary = reflections.find((memory) => memory.tags.includes(DAY_SUMMARY_TAG));
    expect(summary).toMatchObject({ text: "I baked all day and Bob paid me.", tick: NIGHT_TICK });
    expect(summary?.tags).toContain("bob");
    const moodEntry = reflections.find((memory) => memory.tags.includes(MOOD_ENTRY_TAG));
    expect(moodEntry?.text).toBe("Tired but content.");
    expect(result.agent.mood).toBe("Tired but content.");
    expect(result.succeeded).toBe(true);
  });

  it("insights are stored at high strength", async () => {
    const { input, store } = setUpNight(nightReply());
    await runNightPass(input);
    const insights = store
      .listByAgentAndBucket("mara", "reflections")
      .filter((memory) => memory.tags.includes(INSIGHT_TAG));
    expect(insights.map((memory) => memory.text)).toEqual([
      "Bob keeps his word.",
      "Mornings are my best hours.",
    ]);
    for (const insight of insights) {
      expect(insight.strength).toBe(config.memory.reflectionInsightStrength);
    }
  });

  it("night pass rewrites people notes only for known people", async () => {
    const store = new MemoryStore();
    store.addAll([
      makeMemory({
        id: "talk",
        bucket: "conversations",
        tick: NIGHT_TICK - TICKS_PER_HOUR,
        text: 'Bob said: "Here are your coins"',
        tags: ["bob"],
      }),
      makeMemory({
        id: "old-note",
        bucket: "people",
        tick: 10,
        text: "About Bob: owes me 3 coins",
        tags: ["bob"],
      }),
    ]);
    const reply = nightReply({
      peopleNotes: [
        { person: "bob", text: "paid his debt; reliable" },
        { person: "Zed", text: "a stranger I made up" },
      ],
    });
    const { input, client } = setUpNight(reply, store);
    const result = await runNightPass(input);
    expect(lastPrompt(client)).toContain("Bob: About Bob: owes me 3 coins");
    const notes = store.listByAgentAndBucket("mara", "people");
    expect(notes.map((note) => note.text)).toEqual(["About Bob: paid his debt; reliable"]);
    expect(notes[0]?.tags).toEqual(["bob"]);
    expect(result.deletedMemoryIds).toContain("old-note");
  });

  it("night pass deletes faded memories", async () => {
    const store = new MemoryStore();
    store.addAll([
      makeMemory({ id: "faded", strength: config.memory.deleteBelowStrength / 2 }),
      makeMemory({ id: "strong", strength: 0.9, tick: NIGHT_TICK - TICKS_PER_HOUR }),
      makeMemory({ id: "other-agent", agentId: "bob", strength: 0.01 }),
    ]);
    const { input } = setUpNight(nightReply(), store);
    const result = await runNightPass(input);
    expect(result.deletedMemoryIds).toEqual(["faded"]);
    expect(store.get("faded")).toBeUndefined();
    expect(store.get("strong")).toBeDefined();
    expect(store.get("other-agent")).toBeDefined();
  });

  it("shows only the last day's memories in the prompt", async () => {
    const store = new MemoryStore();
    store.addAll([
      makeMemory({ id: "today", tick: NIGHT_TICK - 2 * TICKS_PER_HOUR, text: "I baked bread" }),
      makeMemory({
        id: "long-ago",
        tick: NIGHT_TICK - 30 * TICKS_PER_HOUR,
        text: "I chopped wood",
      }),
    ]);
    const { input, client } = setUpNight(nightReply(), store);
    await runNightPass(input);
    expect(lastPrompt(client)).toContain("I baked bread");
    expect(lastPrompt(client)).not.toContain("I chopped wood");
  });
});
