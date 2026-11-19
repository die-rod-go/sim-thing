import type { Agent, Entity, PlayerView, Position } from "@village/shared";
import { clientConfig } from "../client-config";
import type { SpeechBubble } from "../state/client-state";

/*
 * Seeing the village as the played agent does: only the people and creatures in its sight, and
 * speech as it heard it. The server says what the agent sees and hears; this only filters.
 */

/** The tiles the played agent sees, by index (y * width + x). */
export interface SensedTiles {
  visible: ReadonlySet<number>;
  mapWidth: number;
}

export function buildSensedTiles(view: PlayerView, mapWidth: number): SensedTiles {
  return { visible: new Set(view.visibleTiles), mapWidth };
}

export function isInSight(tiles: SensedTiles, pos: Position): boolean {
  return tiles.visible.has(pos.y * tiles.mapWidth + pos.x);
}

/** The played agent itself, and whoever stands in its sight. */
export function selectSensedAgents(
  agents: readonly Agent[],
  playedAgentId: string,
  tiles: SensedTiles,
): Agent[] {
  return agents.filter((agent) => agent.id === playedAgentId || isInSight(tiles, agent.pos));
}

/** Everything on the map but the creatures out of sight; things stay where they were last seen. */
export function selectSensedEntities(
  entities: readonly Entity[],
  creatureIds: readonly string[],
  tiles: SensedTiles,
): Entity[] {
  const creatures = new Set(creatureIds);
  return entities.filter((entity) => {
    if (!creatures.has(entity.id) || entity.location.kind !== "tile") return true;
    return isInSight(tiles, entity.location.pos);
  });
}

/**
 * The lines the played agent heard, clearly or muffled: none it didn't hear, nor any said before
 * the player took it over. The same bubbles, so each still fades on its own clock.
 */
export function selectSensedBubbles(bubbles: readonly SpeechBubble[]): SpeechBubble[] {
  return bubbles.filter(
    (bubble) => bubble.playerHearing === "clear" || bubble.playerHearing === "muffled",
  );
}

/** A line as it reads: whole, or as a murmur when seen as the played agent who heard it muffled. */
export function describeBubbleText(bubble: SpeechBubble, isSeeingAsPlayer: boolean): string {
  const isMuffled = isSeeingAsPlayer && bubble.playerHearing === "muffled";
  return isMuffled ? clientConfig.player.muffledSpeechText : bubble.text;
}
