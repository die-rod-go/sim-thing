import { describe, expect, it } from "vitest";
import type { AgentDetailMessage } from "@village/shared";
import { clientConfig } from "../../src/client-config";
import {
  makeSampleAgent,
  makeSampleEvent,
  makeSampleMoment,
  makeSampleSnapshot,
} from "../../src/fixtures/sample-data";
import {
  applyServerMessage,
  markGodActionSent,
  selectInspectedAgent,
} from "../../src/state/apply-server-message";
import { initialClientState, type ClientState } from "../../src/state/client-state";

const ada = makeSampleAgent("ada", "Ada", 3, 4);
const bob = makeSampleAgent("bob", "Bob", 10, 12);

function loadedState(): ClientState {
  return applyServerMessage(initialClientState, makeSampleSnapshot([ada, bob]));
}

function makeDetail(agentId: string): AgentDetailMessage {
  const agent = agentId === ada.id ? ada : bob;
  return {
    type: "agent_detail",
    agentId,
    agent: { ...agent, mood: "inspected" },
    memory: {
      stream: [],
      episodes: [],
      chronicles: [],
      daySummary: null,
      history: null,
      lastMidnightDay: 1,
      midnight: null,
      retryAtTick: null,
      passes: {
        episodesSincePeople: 0,
        episodesSinceShortTermGoals: 0,
        episodesSinceReality: 0,
        isFirstShortTermGoalsOwed: false,
        isIdentityOwed: false,
        isLongTermGoalsOwed: false,
      },
    },
    llmCalls: [],
    personalityHistory: [],
    perceptionView: null,
  };
}

describe("applyServerMessage", () => {
  it("loads agents, clock and settings from a snapshot", () => {
    const state = loadedState();
    expect(state.hasSnapshot).toBe(true);
    expect(state.agents.map((agent) => agent.id)).toEqual(["ada", "bob"]);
    expect(state.clock.tick).toBe(30);
    expect(state.speedOptions).toEqual([1, 4, 16]);
  });

  it("loads recent moments from a snapshot and appends broadcast ones", () => {
    const first = makeSampleMoment(1, ada, 20);
    const second = makeSampleMoment(2, bob, 31);
    const loaded = applyServerMessage(initialClientState, {
      ...makeSampleSnapshot([ada, bob]),
      recentMoments: [first],
    });
    const state = applyServerMessage(loaded, { type: "moment", moment: second });
    expect(state.moments.map((moment) => moment.id)).toEqual([1, 2]);
  });

  it("keeps only the newest moments", () => {
    let state = loadedState();
    const extra = 3;
    for (let index = 1; index <= clientConfig.state.maxMoments + extra; index += 1) {
      state = applyServerMessage(state, {
        type: "moment",
        moment: makeSampleMoment(index, ada, 30),
      });
    }
    expect(state.moments).toHaveLength(clientConfig.state.maxMoments);
    expect(state.moments[0]?.id).toBe(extra + 1);
  });

  it("advances the clock and stats on tick", () => {
    const stats = {
      inFlightLlmCalls: 3,
      tokensToday: 99,
      dailyTokenBudget: 100,
      isOverBudget: false,
    };
    const state = applyServerMessage(loadedState(), { type: "tick", tick: 31, stats });
    expect(state.clock.tick).toBe(31);
    expect(state.stats).toEqual(stats);
  });

  it("keeps the pause reason only while paused", () => {
    const paused = applyServerMessage(loadedState(), {
      type: "paused",
      isPaused: true,
      reason: "Daily token budget reached",
    });
    expect(paused.clock.isPaused).toBe(true);
    expect(paused.pausedReason).toBe("Daily token budget reached");
    const resumed = applyServerMessage(paused, { type: "paused", isPaused: false, reason: null });
    expect(resumed.pausedReason).toBeNull();
  });

  it("updates speed and budget from settings", () => {
    const state = applyServerMessage(loadedState(), {
      type: "settings",
      speed: 16,
      dailyTokenBudget: 500,
    });
    expect(state.clock.speed).toBe(16);
    expect(state.stats.dailyTokenBudget).toBe(500);
  });

  it("moves only the named agent", () => {
    const state = applyServerMessage(loadedState(), {
      type: "agent_moved",
      agentId: "bob",
      pos: { x: 11, y: 12 },
      place: "tavern",
    });
    expect(state.agents[1]?.pos).toEqual({ x: 11, y: 12 });
    expect(state.agents[1]?.place).toBe("tavern");
    expect(state.agents[0]?.pos).toEqual(ada.pos);
  });

  it("caps speech bubbles per agent, dropping the oldest", () => {
    let state = loadedState();
    const lineCount = clientConfig.state.maxSpeechBubblesPerAgent + 2;
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      state = applyServerMessage(state, {
        type: "said",
        agentId: "ada",
        text: `line ${lineIndex}`,
        volume: "normal",
        tick: lineIndex,
      });
    }
    state = applyServerMessage(state, {
      type: "said",
      agentId: "bob",
      text: "hi",
      volume: "shout",
      tick: 9,
    });
    const adaLines = state.speechBubbles.filter((bubble) => bubble.agentId === "ada");
    expect(adaLines).toHaveLength(clientConfig.state.maxSpeechBubblesPerAgent);
    expect(adaLines.at(-1)?.text).toBe(`line ${lineCount - 1}`);
    expect(state.speechBubbles.some((bubble) => bubble.agentId === "bob")).toBe(true);
  });

  it("caps the event feed at its configured length, keeping the newest", () => {
    let state = loadedState();
    const eventCount = clientConfig.state.maxFeedEvents + 5;
    for (let eventId = 1; eventId <= eventCount; eventId += 1) {
      state = applyServerMessage(state, {
        type: "event_logged",
        event: makeSampleEvent(eventId, ada, eventId),
      });
    }
    expect(state.events).toHaveLength(clientConfig.state.maxFeedEvents);
    expect(state.events.at(-1)?.id).toBe(eventCount);
  });

  it("merges changed agents and adds unknown ones", () => {
    const clara = makeSampleAgent("clara", "Clara", 1, 1);
    const state = applyServerMessage(loadedState(), {
      type: "state_changed",
      agents: [{ ...bob, mood: "elated" }, clara],
    });
    expect(state.agents.map((agent) => agent.id)).toEqual(["ada", "bob", "clara"]);
    expect(state.agents[1]?.mood).toBe("elated");
  });

  it("merges changed entities and drops removed ones", () => {
    const bread = (id: string) => ({
      id,
      definitionId: "bread",
      label: null,
      location: { kind: "inside" as const, holderId: "ada" },
      changes: {},
    });
    const withBread = applyServerMessage(loadedState(), {
      type: "entities_changed",
      entities: [bread("entity-1"), bread("entity-2")],
      removedEntityIds: [],
    });
    const eaten = applyServerMessage(withBread, {
      type: "entities_changed",
      entities: [],
      removedEntityIds: ["entity-1"],
    });
    expect(eaten.entities.map((entity) => entity.id)).toEqual(["entity-2"]);
  });

  it("stores agent detail only for the inspected agent", () => {
    const inspecting = selectInspectedAgent(loadedState(), "ada");
    const withOther = applyServerMessage(inspecting, makeDetail("bob"));
    expect(withOther.agentDetail).toBeNull();
    expect(withOther.agents[1]?.mood).toBe("inspected");
    const withOwn = applyServerMessage(inspecting, makeDetail("ada"));
    expect(withOwn.agentDetail?.agentId).toBe("ada");
  });

  it("drops stale detail when a different agent is selected", () => {
    const inspecting = applyServerMessage(
      selectInspectedAgent(loadedState(), "ada"),
      makeDetail("ada"),
    );
    expect(selectInspectedAgent(inspecting, "bob").agentDetail).toBeNull();
    expect(selectInspectedAgent(inspecting, "ada").agentDetail?.agentId).toBe("ada");
  });

  it("forgets the inspected agent when a new snapshot no longer has it", () => {
    const inspecting = selectInspectedAgent(loadedState(), "bob");
    const reset = applyServerMessage(inspecting, makeSampleSnapshot([ada]));
    expect(reset.inspectedAgentId).toBeNull();
    const kept = applyServerMessage(inspecting, makeSampleSnapshot([ada, bob]));
    expect(kept.inspectedAgentId).toBe("bob");
  });
});

describe("applyServerMessage catalog", () => {
  it("builds the thing catalog from the snapshot's declarations, world and definitions", () => {
    const state = applyServerMessage(initialClientState, {
      ...makeSampleSnapshot([ada]),
      componentDeclarations: {
        burning: { description: "On fire.", isVisible: false, fields: {}, words: "on fire" },
      },
      itemDefinitions: [
        { id: "door", name: "door", glyph: { index: 1, color: "#fff" }, components: {} },
      ],
    });
    expect(state.catalog.world.agentBody).toBe("person");
    expect(Object.keys(state.catalog.declarations)).toEqual(["burning"]);
    expect([...state.catalog.definitionsById.keys()]).toEqual(["door"]);
  });

  it("keeps the last words spoken from the sky for the banner", () => {
    const state = applyServerMessage(loadedState(), {
      type: "voice_spoke",
      words: "Be kind",
      tick: 42,
    });
    expect(state.lastVoice).toEqual({ words: "Be kind", tick: 42 });
  });

  it("waits for the answer to a sent god action and forgets the last refusal", () => {
    const refused = applyServerMessage(loadedState(), {
      type: "god_action_result",
      refusal: "Pause the sim to use god mode",
    });
    const sent = markGodActionSent(refused);
    expect(sent.isGodActionPending).toBe(true);
    expect(sent.godRefusal).toBeNull();
  });

  it("stops waiting once the god action is answered", () => {
    const answered = applyServerMessage(markGodActionSent(loadedState()), {
      type: "god_action_result",
      refusal: null,
    });
    expect(answered.isGodActionPending).toBe(false);
  });

  it("stops waiting for a god action answer after reconnecting", () => {
    const reconnected = applyServerMessage(
      markGodActionSent(loadedState()),
      makeSampleSnapshot([ada, bob]),
    );
    expect(reconnected.isGodActionPending).toBe(false);
  });
});
