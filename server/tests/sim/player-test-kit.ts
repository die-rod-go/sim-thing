import type { Position, PlayerAct } from "@village/shared";
import { listHeldEntities } from "../../src/items/entity-store";
import { acceptPlayerAct } from "../../src/sim/player-acts";
import { choosePlayedAgent } from "../../src/sim/player-control";
import { PlayerInbox } from "../../src/sim/player-inbox";
import {
  createTestSim,
  scriptByAgent,
  type AgentScript,
  type TestSim,
} from "../../src/sim/test-sim";
import { createEmptyTickResult } from "../../src/sim/world-state";
import { isWalkable } from "../../src/world/pathfinding";

/** An open tile in the test map's town square. */
export const SQUARE = { x: 19, y: 15 };

export interface PlayedSim {
  sim: TestSim;
  inbox: PlayerInbox;
  /** Plays the agent (null: nobody), as the take-over control does; returns why not, or null. */
  playAs: (agentId: string | null) => string | null;
  /** Lines an act up as the player's panel would; returns why it was turned down, or null. */
  choose: (act: PlayerAct) => string | null;
}

/** A test sim with a player inbox; the agents named in `scripts` are driven by the fake LLM. */
export function createPlayedSim(
  agentIds: string[],
  scripts: Record<string, AgentScript> = {},
): PlayedSim {
  const inbox = new PlayerInbox();
  const sim = createTestSim({ agentIds, responder: scriptByAgent(scripts), playerInbox: inbox });
  return {
    sim,
    inbox,
    playAs: (agentId) => {
      const context = {
        state: sim.state,
        result: createEmptyTickResult(sim.state.tick),
        dependencies: { callStructured: sim.llm.callStructured, playerInbox: inbox },
      };
      return choosePlayedAgent(context, agentId, inbox);
    },
    choose: (act) => acceptPlayerAct(sim.state, inbox, act),
  };
}

export function countCarried(sim: TestSim, agentId: string, definitionId: string): number {
  return listHeldEntities(sim.state, agentId).filter(
    (entity) => entity.definitionId === definitionId,
  ).length;
}

/** A free tile with a wall just to its east and another free tile to its west. */
export function findTileBesideWall(sim: TestSim): { standOn: Position; wall: Position } {
  const { grid } = sim.state.map;
  for (let y = 1; y < grid.height - 1; y += 1) {
    for (let x = 1; x < grid.width - 2; x += 1) {
      const wall = { x: x + 1, y };
      const isOpenToTheWest = isWalkable(grid, { x: x - 1, y });
      if (isWalkable(grid, { x, y }) && isOpenToTheWest && !isWalkable(grid, wall)) {
        return { standOn: { x, y }, wall };
      }
    }
  }
  throw new Error("The test map has no free tile beside a wall");
}
