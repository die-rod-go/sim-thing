import { buildThingCatalog, type Agent, type Entity, type ServerMessage } from "@village/shared";
import { clientConfig } from "../client-config";
import type { ClientState, SpeechBubble } from "./client-state";

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
        isGodActionPending: false,
        clock: message.clock,
        stats: message.stats,
        timeSettings: message.timeSettings,
        baseTicksPerSecond: message.baseTicksPerSecond,
        speedOptions: message.speedOptions,
        agents: message.agents,
        entities: message.entities,
        itemDefinitions: message.itemDefinitions,
        catalog: buildThingCatalog(
          message.componentDeclarations,
          message.world,
          message.itemDefinitions,
        ),
        events: keepNewest(message.recentEvents, clientConfig.state.maxFeedEvents),
        moments: keepNewest(message.recentMoments, clientConfig.state.maxMoments),
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
          playerHearing: message.playerHearing,
        }),
      };
    case "interacted":
      return state;
    case "state_changed":
      return { ...state, agents: mergeById(state.agents, message.agents) };
    case "entities_changed": {
      const removed = new Set(message.removedEntityIds);
      const kept = state.entities.filter((entity) => !removed.has(entity.id));
      return { ...state, entities: mergeById<Entity>(kept, message.entities) };
    }
    case "event_logged":
      return {
        ...state,
        events: keepNewest([...state.events, message.event], clientConfig.state.maxFeedEvents),
      };
    case "moment":
      return {
        ...state,
        moments: keepNewest([...state.moments, message.moment], clientConfig.state.maxMoments),
      };
    case "agent_detail": {
      const agents = replaceAgent(state.agents, message.agent);
      const isInspected = message.agentId === state.inspectedAgentId;
      return { ...state, agents, agentDetail: isInspected ? message : state.agentDetail };
    }
    case "god_action_result":
      return { ...state, godRefusal: message.refusal, isGodActionPending: false };
    case "voice_spoke":
      return { ...state, lastVoice: { words: message.words, tick: message.tick } };
    case "player_view":
      return { ...state, playerView: message.view };
    case "player_act_result":
      return { ...state, playerRefusal: message.refusal };
    case "seed_file":
    case "seed_file_saved":
    case "item_file":
    case "item_file_saved":
    case "map_file":
    case "map_file_saved":
      return state;
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

/** A god mode action is on its way; its answer clears this, and so does a fresh snapshot. */
export function markGodActionSent(state: ClientState): ClientState {
  return { ...state, isGodActionPending: true, godRefusal: null };
}
