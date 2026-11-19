import { useCallback, useEffect } from "react";
import type { Agent, ClientMessage, PlayerAct, PlayerView, Position } from "@village/shared";
import { clientConfig } from "../client-config";
import type { ClientState } from "../state/client-state";
import { useStoredState } from "../ui/use-stored-state";
import { PLAYER_TALK_INPUT_ID } from "./PlayerForms";
import { buildTileAct, resolveMoveKey } from "./player-controls";

export interface PlayerControls {
  /** The agent the player plays, alive or dead; null when nobody is played. */
  agent: Agent | null;
  view: PlayerView | null;
  /** The map shows only what the played agent perceives. */
  isSeeingAsPlayer: boolean;
  setSeeingAsPlayer: (isOn: boolean) => void;
  /** Sends an act for the played agent; false when nothing was sent. */
  act: (act: PlayerAct) => boolean;
  /** Walks or moves to a clicked map tile; null while nobody alive is played. */
  clickTile: ((tile: Position) => void) | null;
  stopPlaying: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

const parseIsOn = (raw: string | null): boolean => raw !== "false";

/** The arrow keys and WASD move the played agent a tile; Enter puts the cursor in the talk box. */
function usePlayerKeys(isActive: boolean, act: (act: PlayerAct) => boolean): void {
  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "Enter") {
        document.getElementById(PLAYER_TALK_INPUT_ID)?.focus();
        event.preventDefault();
        return;
      }
      const move = resolveMoveKey(event.key);
      if (move === null) return;
      event.preventDefault();
      act(move);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, act]);
}

/**
 * The player's side of the village view: who they play, their acts, and whether the map shows
 * only what that agent perceives. Keys and clicks act only while `canTakeInput` (god mode off).
 */
export function usePlayer(
  state: ClientState,
  sendControl: (message: ClientMessage) => boolean,
  canTakeInput: boolean,
): PlayerControls {
  const agent = state.agents.find((candidate) => candidate.isPlayed) ?? null;
  const view = agent !== null && state.playerView?.agentId === agent.id ? state.playerView : null;
  const [isSensesOn, setSeeingAsPlayer] = useStoredState(
    clientConfig.storageKeys.isSeeingAsPlayer,
    true,
    parseIsOn,
  );
  const act = useCallback(
    (playerAct: PlayerAct) => sendControl({ type: "player_act", act: playerAct }),
    [sendControl],
  );
  const stopPlaying = useCallback(
    () => void sendControl({ type: "play_as", agentId: null }),
    [sendControl],
  );
  const isAlive = agent !== null && agent.death === null && view !== null;
  const isTakingInput = isAlive && canTakeInput;
  usePlayerKeys(isTakingInput, act);
  const agentPos = agent?.pos;
  const clickTile = useCallback(
    (tile: Position) => {
      if (agentPos === undefined) return;
      const tileAct = buildTileAct(agentPos, tile);
      if (tileAct !== null) act(tileAct);
    },
    [agentPos, act],
  );
  return {
    agent,
    view,
    isSeeingAsPlayer: isSensesOn && view !== null,
    setSeeingAsPlayer,
    act,
    clickTile: isTakingInput ? clickTile : null,
    stopPlaying,
  };
}
