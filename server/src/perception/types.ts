import type { AwarenessVia, Position, WorldEvent } from "@village/shared";
import type { TileGrid } from "../world/types";

/** What perception needs to know about the world on one tick. */
export interface PerceptionWorld {
  grid: TileGrid;
  /** Tile indexes of doors that are currently closed: they block sight and cost extra for sound. */
  closedDoorTiles: Set<number>;
}

export interface Perceiver {
  agentId: string;
  name: string;
  pos: Position;
  isAsleep: boolean;
}

export type Hearing = "clear" | "muffled" | "none";

/** How one perceiver took in one event. */
export interface EventPerception {
  agentId: string;
  via: AwarenessVia | null;
  isInSight: boolean;
  hearing: Hearing;
  /** Rough compass direction of the source when heard but not seen, e.g. "north-east". */
  direction: string | null;
}

export interface PerceivedEvent {
  event: WorldEvent;
  perceptions: EventPerception[];
}
