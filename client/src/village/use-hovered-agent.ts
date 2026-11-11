import { useCallback, useEffect, useRef, useState } from "react";
import { clientConfig } from "../client-config";

export interface HoveredAgent {
  hoveredAgentId: string | null;
  startHover: (agentId: string) => void;
  endHover: (agentId: string) => void;
}

/** Which agent the pointer has rested on long enough to show its hover card. */
export function useHoveredAgent(): HoveredAgent {
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const pendingTimer = useRef<number | null>(null);

  const cancelPending = useCallback(() => {
    if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
  }, []);

  const startHover = useCallback(
    (agentId: string) => {
      cancelPending();
      pendingTimer.current = window.setTimeout(() => {
        pendingTimer.current = null;
        setHoveredAgentId(agentId);
      }, clientConfig.village.hoverCardDelayMs);
    },
    [cancelPending],
  );

  const endHover = useCallback(
    (agentId: string) => {
      cancelPending();
      setHoveredAgentId((current) => (current === agentId ? null : current));
    },
    [cancelPending],
  );

  useEffect(() => cancelPending, [cancelPending]);
  return { hoveredAgentId, startHover, endHover };
}
