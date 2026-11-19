import { useMemo } from "react";
import type { Entity } from "@village/shared";
import type { ClientState, SpeechBubble } from "../state/client-state";
import {
  buildSensedTiles,
  selectSensedAgents,
  selectSensedBubbles,
  selectSensedEntities,
} from "./player-senses";
import type { PlayerControls } from "./use-player";

/** The village as the map draws it. */
export interface SensedWorld {
  entities: readonly Entity[];
  speechBubbles: SpeechBubble[];
  /** Only these agents are drawn; null draws everyone. */
  sensedAgentIds: ReadonlySet<string> | null;
  /** The tiles out of the fog; null for no fog. */
  fogTiles: readonly number[] | null;
}

/**
 * The village as the played agent perceives it while the player sees through its eyes; otherwise
 * the whole village. `mapWidth` is null until the map has loaded.
 */
export function useSensedWorld(
  state: ClientState,
  player: PlayerControls,
  mapWidth: number | null,
): SensedWorld {
  const { view, agent, isSeeingAsPlayer } = player;
  const playedAgentId = agent?.id ?? null;
  const { agents, entities, speechBubbles } = state;
  return useMemo(() => {
    if (!isSeeingAsPlayer || view === null || playedAgentId === null || mapWidth === null) {
      return { entities, speechBubbles, sensedAgentIds: null, fogTiles: null };
    }
    const tiles = buildSensedTiles(view, mapWidth);
    const sensedAgents = selectSensedAgents(agents, playedAgentId, tiles);
    return {
      entities: selectSensedEntities(entities, view.creatureIds, tiles),
      speechBubbles: selectSensedBubbles(speechBubbles),
      sensedAgentIds: new Set(sensedAgents.map((sensed) => sensed.id)),
      fogTiles: view.visibleTiles,
    };
  }, [isSeeingAsPlayer, view, playedAgentId, mapWidth, agents, entities, speechBubbles]);
}
