import { describe, expect, it } from "vitest";
import { config } from "../../src/config";
import { getAgentRuntime, requestDecision } from "../../src/sim/agent-runtime";
import { PlayerInbox } from "../../src/sim/player-inbox";
import { isWaitingForPlayer, needsPlayer } from "../../src/sim/player-turn";
import { createTestSim, decisionReply } from "../../src/sim/test-sim";
import { findAgent, getAgentMemory, replaceAgent } from "../../src/sim/world-access";
import { createPlayedSim, playAsIn, SQUARE } from "./player-test-kit";

const DECISION_KINDS = ["decision", "reckoning", "interact"];

describe("the player's turn", () => {
  it("never has the LLM decide for the agent the player plays", async () => {
    const { sim, playAs } = createPlayedSim(["mara", "ilsa"]);
    playAs("mara");
    await sim.advance(3);
    const callsFor = (agentId: string) =>
      sim.records.filter(
        (record) => record.agentId === agentId && DECISION_KINDS.includes(record.kind),
      );
    expect(callsFor("mara")).toEqual([]);
    expect(callsFor("ilsa").length).toBeGreaterThan(0);
  });

  it("holds the clock while the played agent has nothing to do and no act waiting", () => {
    const { sim, inbox, playAs, choose } = createPlayedSim(["mara"]);
    expect(isWaitingForPlayer(sim.state, inbox)).toBe(false);
    playAs("mara");
    expect(isWaitingForPlayer(sim.state, inbox)).toBe(true);
    expect(choose({ action: "wait", minutes: 10 })).toBeNull();
    expect(isWaitingForPlayer(sim.state, inbox)).toBe(false);
  });

  it("lets the clock run while the played agent walks, stopping only for something urgent", async () => {
    const { sim, playAs, choose } = createPlayedSim(["mara"]);
    playAs("mara");
    choose({ action: "walk_to", target: "town square" });
    await sim.advance(2);
    expect(sim.agent("mara").currentAction?.kind).toBe("walk_to");
    expect(needsPlayer(sim.state, sim.agent("mara"))).toBe(false);
    const runtime = getAgentRuntime(sim.state, "mara");
    requestDecision(runtime, config.attention.notableReason, false);
    expect(needsPlayer(sim.state, sim.agent("mara"))).toBe(false);
    requestDecision(runtime, "Ilsa attacked me", true);
    expect(needsPlayer(sim.state, sim.agent("mara"))).toBe(true);
  });

  it("ends the player's wait on anything notable, as an answer would", async () => {
    const { sim, playAs, choose } = createPlayedSim(["mara"]);
    playAs("mara");
    choose({ action: "wait", minutes: 30 });
    await sim.advance(1);
    expect(needsPlayer(sim.state, sim.agent("mara"))).toBe(false);
    requestDecision(getAgentRuntime(sim.state, "mara"), config.attention.notableReason, false);
    expect(needsPlayer(sim.state, sim.agent("mara"))).toBe(true);
  });

  it("lets go of a notable flag that didn't stop the played agent, so it can't stop a later wait", async () => {
    const { sim, playAs, choose } = createPlayedSim(["mara"]);
    playAs("mara");
    choose({ action: "walk_to", target: "town square" });
    await sim.advance(1);
    requestDecision(getAgentRuntime(sim.state, "mara"), config.attention.notableReason, false);
    await sim.advance(1);
    expect(getAgentRuntime(sim.state, "mara").pendingDecision).toBeNull();
  });

  it("lets go of what stopped the clock once the player answers it", () => {
    const { sim, playAs, choose } = createPlayedSim(["mara"]);
    playAs("mara");
    expect(getAgentRuntime(sim.state, "mara").pendingDecision?.reason).toBe(
      config.player.takeOverReason,
    );
    choose({ action: "continue" });
    expect(getAgentRuntime(sim.state, "mara").pendingDecision).toBeNull();
  });

  it("doesn't wait for a player whose agent has died", () => {
    const { sim, inbox, playAs } = createPlayedSim(["mara"]);
    playAs("mara");
    const mara = findAgent(sim.state, "mara");
    replaceAgent(sim.state, { ...mara, death: { tick: 0, cause: "starved", sourceId: null } });
    expect(isWaitingForPlayer(sim.state, inbox)).toBe(false);
  });
});

describe("taking an agent over and handing it back", () => {
  it("drops what the LLM queued and meant, and gives the player the turn", () => {
    const { sim, playAs } = createPlayedSim(["mara"]);
    const runtime = getAgentRuntime(sim.state, "mara");
    runtime.queuedActs = [{ act: { kind: "wait", minutes: 5 }, speech: null }];
    replaceAgent(sim.state, { ...sim.agent("mara"), intention: "selling bread on the square" });
    expect(playAs("mara")).toBeNull();
    expect(sim.agent("mara")).toMatchObject({ isPlayed: true, intention: "" });
    expect(runtime.queuedActs).toEqual([]);
    expect(runtime.pendingDecision).toMatchObject({ isUrgent: true });
  });

  it("plays one agent at a time: playing another hands the first back", () => {
    const { sim, playAs } = createPlayedSim(["mara", "ilsa"]);
    playAs("mara");
    playAs("ilsa");
    expect(sim.agent("mara").isPlayed).toBe(false);
    expect(sim.agent("ilsa").isPlayed).toBe(true);
  });

  it("hands an agent back to plan the rest of its day and take stock, forgetting waiting acts", () => {
    const { sim, inbox, playAs, choose } = createPlayedSim(["mara"]);
    playAs("mara");
    choose({ action: "wait", minutes: 10 });
    expect(playAs(null)).toBeNull();
    expect(sim.agent("mara").isPlayed).toBe(false);
    expect(inbox.hasAny("mara")).toBe(false);
    expect(getAgentRuntime(sim.state, "mara").pendingDecision).toBeNull();
    const memory = getAgentMemory(sim.state, "mara");
    expect(memory.dayPlanOwedSinceTick).toBe(sim.state.tick);
    expect(memory.reflection.isOwed).toBe(true);
  });

  it("drops an LLM decision still being made when the player took the agent over", async () => {
    let releaseReply: (reply: string) => void = () => undefined;
    const pendingReply = new Promise<string>((resolveReply) => {
      releaseReply = resolveReply;
    });
    const inbox = new PlayerInbox();
    const sim = createTestSim({
      agentIds: ["mara"],
      responder: () => pendingReply,
      shouldCallLlmInBackground: true,
      idleDecisionWaitMs: 0,
      playerInbox: inbox,
    });
    await sim.advance(1);
    playAsIn(sim, inbox, "mara");
    releaseReply(decisionReply({ action: "walk_to", target: "town square" }));
    await sim.advance(2);
    expect(sim.agent("mara").currentAction).toBeNull();
  });

  it("won't play someone who isn't there or has died", () => {
    const { sim, playAs } = createPlayedSim(["mara"]);
    expect(playAs("nobody")).toBe(config.player.refusals.unknownAgent);
    const mara = sim.agent("mara");
    replaceAgent(sim.state, { ...mara, death: { tick: 0, cause: "starved", sourceId: null } });
    expect(playAs("mara")).toBe("Mara is dead");
  });
});

describe("the LLM work a played agent is spared", () => {
  it("summarizes its memory but plans no day, checks no reality and takes no stock for it", async () => {
    const { sim, playAs } = createPlayedSim(["mara"]);
    playAs("mara");
    const memory = getAgentMemory(sim.state, "mara");
    sim.state.agentMemories.mara = {
      ...memory,
      dayPlanOwedSinceTick: 0,
      isRealityPassOwed: true,
      reflection: { ...memory.reflection, isOwed: true },
      stream: Array.from({ length: config.memory.streamMax }, (_unused, index) => ({
        text: `I noticed thing ${index}`,
        tick: 0,
      })),
    };
    await sim.advance(1);
    const kinds = sim.records
      .filter((record) => record.agentId === "mara")
      .map((record) => record.kind);
    expect(kinds).toContain("episode");
    expect(kinds).not.toContain("day_plan");
    expect(kinds).not.toContain("reality");
    expect(kinds).not.toContain("reflection");
  });

  it("reminds no one of an agenda the LLM wrote before the player took over", async () => {
    const { sim, playAs } = createPlayedSim(["mara"]);
    sim.placeAgent("mara", SQUARE);
    playAs("mara");
    const startHour = config.clock.startHour;
    replaceAgent(sim.state, {
      ...sim.agent("mara"),
      agenda: [{ number: 1, text: "Dice at the tavern", hour: startHour }],
    });
    await sim.advance(1);
    expect(getAgentRuntime(sim.state, "mara").firedReminderNumbers).toEqual([]);
  });
});
