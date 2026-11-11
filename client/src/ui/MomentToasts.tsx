import { useCallback, useEffect, useRef, useState } from "react";
import type { Moment } from "@village/shared";
import { clientConfig } from "../client-config";
import { describeMomentDetail, findNewestMomentId, selectToastMoments } from "../format/moments";
import { usePanelContext } from "./panel-context";
import { ColorDot } from "./widgets";

/**
 * Collects personality changes that arrive while the page is open. The first snapshot only sets
 * the starting point, so opening the page never replays old changes.
 */
function useToastQueue(isEnabled: boolean) {
  const { state } = usePanelContext();
  const lastSeenIdRef = useRef<number | null>(null);
  const [toasts, setToasts] = useState<Moment[]>([]);

  useEffect(() => {
    if (!state.hasSnapshot) return;
    const newestId = findNewestMomentId(state.moments);
    const lastSeenId = lastSeenIdRef.current;
    lastSeenIdRef.current = Math.max(newestId, lastSeenId ?? 0);
    if (lastSeenId === null || !isEnabled) return;
    const arrived = selectToastMoments(state.moments, lastSeenId);
    if (arrived.length === 0) return;
    setToasts((previous) => [...previous, ...arrived].slice(-clientConfig.ui.maxMomentToastsShown));
  }, [state.hasSnapshot, state.moments, isEnabled]);

  const dismiss = useCallback(
    (momentId: number) =>
      setToasts((previous) => previous.filter((toast) => toast.id !== momentId)),
    [],
  );
  return { toasts, dismiss };
}

interface MomentToastProps {
  moment: Moment;
  onDismiss: (momentId: number) => void;
}

function MomentToast({ moment, onDismiss }: MomentToastProps) {
  const { selectAgent } = usePanelContext();
  const momentId = moment.id;
  useEffect(() => {
    const timerId = window.setTimeout(
      () => onDismiss(momentId),
      clientConfig.ui.momentToastLifetimeMs,
    );
    return () => window.clearTimeout(timerId);
  }, [momentId, onDismiss]);
  const detail = describeMomentDetail(moment);
  return (
    <button
      className="moment-toast"
      onClick={() => {
        selectAgent(moment.agentId);
        onDismiss(momentId);
      }}
      title={`Open ${moment.agentName}`}
    >
      <ColorDot agentId={moment.agentId} />
      <span>
        <strong>{moment.agentName}</strong> {moment.text}
        {detail && <span className="moment-toast-detail">{detail}</span>}
      </span>
    </button>
  );
}

/** Small pop-ups for personality changes; only shown when the viewer turned them on. */
export function MomentToasts({ isEnabled }: { isEnabled: boolean }) {
  const { toasts, dismiss } = useToastQueue(isEnabled);
  if (toasts.length === 0) return null;
  return (
    <div className="moment-toasts" role="status">
      {toasts.map((toast) => (
        <MomentToast key={toast.id} moment={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}
