import { describe, expect, it } from "vitest";
import { config } from "../config";
import { SUMMARY_SCHEMA_NAMES } from "../memory/summary-prompts";
import { createTestSim, decisionReply, DEFAULT_SUMMARY, promptOf, scriptByAgent } from "./test-sim";
import { appendToStream, getAgentMemory } from "./world-access";

const { streamMax, streamKeep, retryAfterTicks } = config.memory;
const TICKS_TO_FIRST_MIDNIGHT = ((24 - config.clock.startHour) * 60) / config.clock.minutesPerTick;

type TestSim = ReturnType<typeof createTestSim>;

function fillStream(sim: TestSim, agentId: string, count: number): void {
  for (let index = 0; index < count; index += 1) {
    appendToStream(sim.state, agentId, `test event ${index}`);
  }
}

function summaryKinds(sim: TestSim): string[] {
  return sim.records.filter((record) => record.kind !== "decision").map((record) => record.kind);
}

describe("memory work", () => {
  it("turns a full stream into an episode and shows it in the next decision prompt", async () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
    await sim.advance();
    fillStream(sim, "mara", streamMax);
    await sim.advance();
    const memory = getAgentMemory(sim.state, "mara");
    expect(summaryKinds(sim)).toEqual(["episode"]);
    expect(memory.episodes.map((episode) => episode.text)).toEqual([DEFAULT_SUMMARY]);
    expect(memory.stream).toHaveLength(streamKeep);
    const episodePrompt = sim.records.find((record) => record.kind === "episode")?.prompt ?? "";
    expect(episodePrompt).toContain("You are Mara.");
    expect(episodePrompt).toContain("test event 0");
    expect(episodePrompt).not.toContain(`test event ${streamMax - 1}`);
    sim.state.agents = sim.state.agents.map((agent) => ({ ...agent, currentAction: null }));
    await sim.advance();
    const decisionPrompt = sim.records.filter((record) => record.kind === "decision").at(-1);
    expect(decisionPrompt?.prompt).toContain(
      `## ${config.memory.promptTitles.episodes}\n- [Day 1, 6:0`,
    );
  });

  it("leaves everything in place after a failed summary and tries again later", async () => {
    let shouldFail = true;
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: (request) => {
        if (!SUMMARY_SCHEMA_NAMES.includes(request.schemaName ?? "")) {
          return decisionReply({ action: "wait", minutes: config.decision.maxWaitMinutes });
        }
        return shouldFail ? "not json" : JSON.stringify({ summary: "It worked out." });
      },
    });
    await sim.advance();
    fillStream(sim, "mara", streamMax);
    await sim.advance();
    const failed = getAgentMemory(sim.state, "mara");
    expect(failed.episodes).toEqual([]);
    expect(failed.stream.length).toBeGreaterThanOrEqual(streamMax);
    expect(failed.retryAtTick).toBe(sim.state.tick - 1 + retryAfterTicks);
    shouldFail = false;
    await sim.advance(retryAfterTicks - 1);
    expect(getAgentMemory(sim.state, "mara").episodes).toEqual([]);
    await sim.advance();
    expect(getAgentMemory(sim.state, "mara").episodes.map((episode) => episode.text)).toEqual([
      "It worked out.",
    ]);
  });

  it("runs the midnight steps for every living agent when the day number goes up", async () => {
    const sim = createTestSim({ agentIds: ["mara", "ilsa"], responder: scriptByAgent({}) });
    await sim.advance();
    fillStream(sim, "mara", streamKeep + 4);
    sim.state.agents = sim.state.agents.map((agent) =>
      agent.id === "ilsa"
        ? { ...agent, death: { tick: 0, cause: "x", sourceAgentId: null } }
        : agent,
    );
    fillStream(sim, "ilsa", streamKeep + 4);
    sim.state.tick = TICKS_TO_FIRST_MIDNIGHT - 1;
    sim.records.length = 0;
    await sim.advance();
    expect(summaryKinds(sim)).toEqual([]);
    await sim.advance();
    const mara = getAgentMemory(sim.state, "mara");
    expect(sim.records.filter((record) => record.agentId === "ilsa")).toEqual([]);
    expect(summaryKinds(sim)).toEqual(["episode"]);
    expect(mara.lastMidnightDay).toBe(2);
    expect(mara.midnight).toBeNull();
    expect(mara.stream.length).toBeLessThanOrEqual(streamKeep + 1);
  });

  it("gives summarizers the earlier summary as context and asks for the first person", async () => {
    const sim = createTestSim({ agentIds: ["mara"], responder: scriptByAgent({}) });
    await sim.advance();
    fillStream(sim, "mara", streamMax);
    await sim.advance();
    fillStream(sim, "mara", streamMax);
    await sim.advance();
    const prompts = sim.client.requests.map(promptOf).filter((prompt) => prompt.includes("fade"));
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain(config.memory.noEarlierText);
    expect(prompts[1]).toContain(DEFAULT_SUMMARY);
    expect(prompts[1]).toContain("in the first person and the past tense");
    expect(prompts[1]).toContain(`At most ${config.memory.episodeMaxChars} characters`);
  });
});
