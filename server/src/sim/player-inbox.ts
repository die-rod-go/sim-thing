import type { PlayerAct } from "@village/shared";
import { config } from "../config";

/**
 * The acts the player has chosen for played agents, oldest first, until the clock reaches them:
 * one each tick, where decisions are applied. Like an LLM reply on its way, it is input from
 * outside the world, so it isn't saved; a restart forgets what was still waiting.
 */
export class PlayerInbox {
  private readonly actsByAgentId = new Map<string, PlayerAct[]>();

  /**
   * Lines the act up after the others. A move replaces a move still waiting at the end, so
   * holding a key down never runs ahead of the clock. False when too many are waiting.
   */
  put(agentId: string, act: PlayerAct): boolean {
    const waiting = this.list(agentId);
    if (act.action === "move" && waiting.at(-1)?.action === "move") {
      this.actsByAgentId.set(agentId, [...waiting.slice(0, -1), act]);
      return true;
    }
    if (waiting.length >= config.player.maxPendingActs) return false;
    this.actsByAgentId.set(agentId, [...waiting, act]);
    return true;
  }

  /** Removes and returns the oldest act waiting for the agent; null when none is. */
  take(agentId: string): PlayerAct | null {
    const [next, ...rest] = this.list(agentId);
    if (next === undefined) return null;
    if (rest.length === 0) this.actsByAgentId.delete(agentId);
    else this.actsByAgentId.set(agentId, rest);
    return next;
  }

  list(agentId: string): readonly PlayerAct[] {
    return this.actsByAgentId.get(agentId) ?? [];
  }

  hasAny(agentId: string): boolean {
    return this.list(agentId).length > 0;
  }

  /** Forgets what was waiting for one agent, or for everyone when no agent is named. */
  clear(agentId?: string): void {
    if (agentId === undefined) this.actsByAgentId.clear();
    else this.actsByAgentId.delete(agentId);
  }
}
