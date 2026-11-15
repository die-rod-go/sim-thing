import { useCallback, useEffect, useState } from "react";
import type { ClientMessage } from "@village/shared";
import type { ClientState } from "../state/client-state";
import { resolveGodClick, type GodClickTarget, type GodTool } from "./god-mode";

export interface GodMode {
  isOn: boolean;
  setOn: (isOn: boolean) => void;
  tool: GodTool;
  setTool: (tool: GodTool) => void;
  /** Whether clicks change the world now: god mode is on and the sim is paused. */
  canEdit: boolean;
  /** Takes a map click in place of the usual pin or select; null while it can't edit. */
  click: ((target: GodClickTarget) => void) | null;
}

const IDLE_TOOL: GodTool = { kind: "grab" };

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/** G turns god mode on and off; Escape lets go of whatever is held. */
function useGodModeKeys(isOn: boolean, setOn: (isOn: boolean) => void, letGo: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key.toLowerCase() === "g") setOn(!isOn);
      else if (event.key === "Escape" && isOn) letGo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOn, setOn, letGo]);
}

/** God mode's tool and the clicks it turns into god actions for the server. */
export function useGodMode(
  state: ClientState,
  sendControl: (message: ClientMessage) => void,
): GodMode {
  const [isOn, setIsOn] = useState(false);
  const [tool, setTool] = useState<GodTool>(IDLE_TOOL);
  const canEdit = isOn && state.hasSnapshot && state.clock.isPaused;
  const setOn = useCallback((isTurnedOn: boolean) => {
    setIsOn(isTurnedOn);
    setTool(IDLE_TOOL);
  }, []);
  const letGo = useCallback(
    () => setTool((current) => (current.kind === "holding" ? IDLE_TOOL : current)),
    [],
  );
  useGodModeKeys(isOn, setOn, letGo);

  const { agents, entities, catalog } = state;
  const click = useCallback(
    (target: GodClickTarget) => {
      const outcome = resolveGodClick(tool, target, { agents, entities, catalog });
      setTool(outcome.nextTool);
      if (outcome.action) sendControl({ type: "god_action", action: outcome.action });
    },
    [tool, agents, entities, catalog, sendControl],
  );
  return { isOn, setOn, tool, setTool, canEdit, click: canEdit ? click : null };
}
