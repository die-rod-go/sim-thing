import type { Agent, ServerMessage, WorldObject } from "@village/shared";
import { clientConfig } from "../clientConfig";
import type { ClientState, SpeechBubble } from "./clientState";

function keepNewest<Item>(items: Item[], limit: number): Item[] {
  return items.length > limit ? items.slice(items.length - limit) : items;
}

function mergeById<Item extends { id: string }>(current: Item[], updates: Item[]): Item[] {
  const updatesById = new Map(updates.map((item) => [item.id, item]));
  const merged = current.map((item) => updatesById.get(item.id) ?? item);
  const knownIds = new Set(current.map((item) => item.id));
  const added = updates.filter((item) => !knownIds.has(item.id));
  return [...merged, ...added];
}

function addSpeechBubble(bubbles: SpeechBubble[], bubble: SpeechBubble): SpeechBubble[] {
  const limit = clientConfig.state.maxSpeechBubblesPerAgent;
  const sameAgent = bubbles.filter((existing) => existing.agentId === bubble.agentId);
  const overflow = sameAgent.length + 1 - limit;
  const dropped = new Set(overflow > 0 ? sameAgent.slice(0, overflow) : []);
  return [...bubbles.filter((existing) => !dropped.has(existing)), bubble];
}

function replaceAgent(agents: Agent[], updated: Agent): Agent[] {
  return mergeById(agents, [updated]);
}

/** Pure reducer: folds one server message into the client state. */
export function applyServerMessage(state: ClientState, message: ServerMessage): ClientState {
  switch (message.type) {
    case "snapshot": {
      const isInspectedAgentKnown = message.agents.some(
        (agent) => agent.id === state.inspectedAgentId,
      );
      return {
        ...state,
        hasSnapshot: true,
        clock: message.clock,
        stats: message.stats,
        timeSettings: message.timeSettings,
        baseTicksPerSecond: message.baseTicksPerSecond,
        speedOptions: message.speedOptions,
        agents: message.agents,
        objects: message.objects,
        events: keepNewest(message.recentEvents, clientConfig.state.maxFeedEvents),
        speechBubbles: [],
        pausedReason: message.clock.isPaused ? state.pausedReason : null,
        inspectedAgentId: isInspectedAgentKnown ? state.inspectedAgentId : null,
        agentDetail: null,
      };
    }
    case "tick":
      return { ...state, clock: { ...state.clock, tick: message.tick }, stats: message.stats };
    case "paused":
      return {
        ...state,
        clock: { ...state.clock, isPaused: message.isPaused },
        pausedReason: message.isPaused ? message.reason : null,
      };
    case "settings":
      return {
        ...state,
        clock: { ...state.clock, speed: message.speed },
        stats: { ...state.stats, dailyTokenBudget: message.dailyTokenBudget },
      };
    case "agent_moved":
      return {
        ...state,
        agents: state.agents.map((agent) =>
          agent.id === message.agentId
            ? { ...agent, pos: message.pos, place: message.place }
            : agent,
        ),
      };
    case "said":
      return {
        ...state,
        speechBubbles: addSpeechBubble(state.speechBubbles, {
          agentId: message.agentId,
          text: message.text,
          volume: message.volume,
          tick: message.tick,
        }),
      };
    case "interacted":
      return state;
    case "state_changed":
      return {
        ...state,
        agents: message.agents ? mergeById(state.agents, message.agents) : state.agents,
        objects: message.objects
          ? mergeById<WorldObject>(state.objects, message.objects)
          : state.objects,
      };
    case "event_logged":
      return {
        ...state,
        events: keepNewest([...state.events, message.event], clientConfig.state.maxFeedEvents),
      };
    case "agent_detail": {
      const agents = replaceAgent(state.agents, message.agent);
      const isInspected = message.agentId === state.inspectedAgentId;
      return { ...state, agents, agentDetail: isInspected ? message : state.agentDetail };
    }
  }
}

/** Marks an agent as inspected; detail for a different agent is dropped until the server replies. */
export function selectInspectedAgent(state: ClientState, agentId: string | null): ClientState {
  const isSameAgent = state.agentDetail?.agentId === agentId;
  return {
    ...state,
    inspectedAgentId: agentId,
    agentDetail: isSameAgent ? state.agentDetail : null,
  };
}
