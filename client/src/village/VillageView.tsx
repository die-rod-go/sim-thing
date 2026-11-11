import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import "../styles/village.css";
import { clientConfig } from "../client-config";
import { groupConversations } from "../format/conversations";
import { computeTickDurationMs } from "../format/formatters";
import type { ClientState } from "../state/client-state";
import { useStoredState } from "../ui/use-stored-state";
import { listConversationLinks } from "./activity-cues";
import type { Size } from "./camera";
import { CameraControls } from "./CameraControls";
import { computeDaylightTint, computeHourOfDay } from "./daylight";
import { parseThoughtMode, selectVisibleThoughts, type ThoughtMode } from "./thought-bubbles";
import { useCameraInput } from "./use-camera-input";
import { useCameraRig } from "./use-camera-rig";
import {
  parseMutedSpeakers,
  serializeMutedSpeakers,
  toggleMutedSpeaker,
  type MutedSpeakers,
} from "./muted-speakers";
import { useDirector } from "./use-director";
import { useVillageMap } from "./use-village-map";
import { VillageWorld } from "./VillageWorld";

/** Asks the camera to frame these agents; a new requestId repeats the request. */
export interface CameraFocus {
  agentIds: string[];
  requestId: number;
}

interface VillageViewProps {
  state: ClientState;
  isDebugOverlayOn: boolean;
  onSelectAgent: (agentId: string) => void;
  cameraFocus?: CameraFocus | null;
  highlightedAgentIds?: readonly string[];
}

const NO_HIGHLIGHTS: readonly string[] = [];
const NO_MUTED_SPEAKERS: MutedSpeakers = new Set();

function useElementSize(elementRef: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef]);
  return size;
}

function selectPerceptionView(state: ClientState, isDebugOverlayOn: boolean) {
  const detail = state.agentDetail;
  if (!isDebugOverlayOn || !detail || detail.agentId !== state.inspectedAgentId) return null;
  return detail.perceptionView;
}

function useConversations(state: ClientState) {
  const { maxGapTicks } = clientConfig.conversations;
  const threads = useMemo(
    () => groupConversations(state.events, maxGapTicks),
    [state.events, maxGapTicks],
  );
  const links = useMemo(
    () => listConversationLinks(threads, state.clock.tick, maxGapTicks),
    [threads, state.clock.tick, maxGapTicks],
  );
  return { threads, links };
}

function useVisibleThoughts(state: ClientState, mode: ThoughtMode) {
  const { thoughtMaxAgeTicks, thoughtBubbleMaxLength } = clientConfig.village;
  return useMemo(
    () =>
      selectVisibleThoughts(state.agents, {
        mode,
        inspectedAgentId: state.inspectedAgentId,
        currentTick: state.clock.tick,
        maxAgeTicks: thoughtMaxAgeTicks,
        maxLength: thoughtBubbleMaxLength,
      }),
    [
      state.agents,
      state.inspectedAgentId,
      state.clock.tick,
      mode,
      thoughtMaxAgeTicks,
      thoughtBubbleMaxLength,
    ],
  );
}

/** The village map with a pan-and-zoom camera; renders only what the client state says. */
export function VillageView({
  state,
  isDebugOverlayOn,
  onSelectAgent,
  cameraFocus = null,
  highlightedAgentIds = NO_HIGHLIGHTS,
}: VillageViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewSize = useElementSize(containerRef);
  const mapStatus = useVillageMap();
  const { mode, manualInputCount, controls } = useCameraRig();
  const [isPlaceLabelsOn, setPlaceLabelsOn] = useState(false);
  const [thoughtMode, setThoughtMode] = useStoredState<ThoughtMode>(
    clientConfig.village.thoughtModeStorageKey,
    "selected",
    parseThoughtMode,
  );
  const [mutedSpeakers, setMutedSpeakers] = useStoredState(
    clientConfig.village.mutedSpeakersStorageKey,
    NO_MUTED_SPEAKERS,
    parseMutedSpeakers,
    serializeMutedSpeakers,
  );
  const toggleMute = (agentId: string) =>
    setMutedSpeakers(toggleMutedSpeaker(mutedSpeakers, agentId));
  const canFollow = state.inspectedAgentId !== null;
  useCameraInput(containerRef, controls, canFollow);
  const conversations = useConversations(state);
  const thoughtsByAgent = useVisibleThoughts(state, thoughtMode);
  const director = useDirector(controls, manualInputCount, {
    threads: conversations.threads,
    events: state.events,
    currentTick: state.clock.tick,
  });

  useLayoutEffect(() => {
    controls.viewSizeRef.current = viewSize;
  }, [controls, viewSize]);

  // Only a new request id refocuses; a re-rendered request with the same id does not.
  const focusRequestId = cameraFocus?.requestId;
  const focusAgentIds = cameraFocus?.agentIds;
  const latestFocusAgentIds = useRef(focusAgentIds);
  latestFocusAgentIds.current = focusAgentIds;
  useEffect(() => {
    const agentIds = latestFocusAgentIds.current;
    if (focusRequestId === undefined || !agentIds) return;
    controls.focus({ kind: "agents", agentIds });
  }, [controls, focusRequestId]);

  const moveDurationMs = computeTickDurationMs(
    state.baseTicksPerSecond,
    state.clock.speed,
    clientConfig.village.maxMoveTweenMs,
  );
  const daylightTint = computeDaylightTint(
    computeHourOfDay(state.clock.tick, state.timeSettings),
    clientConfig.village.daylightKeyframes,
  );

  return (
    <div className="village-view">
      <div className="village-canvas" ref={containerRef}>
        {mapStatus.kind === "ready" && (
          <VillageWorld
            map={mapStatus.map}
            glyphPainter={mapStatus.glyphPainter}
            agents={state.agents}
            entities={state.entities}
            catalog={state.catalog}
            speechBubbles={state.speechBubbles}
            thoughtsByAgent={thoughtsByAgent}
            timeSettings={state.timeSettings}
            currentTick={state.clock.tick}
            inspectedAgentId={state.inspectedAgentId}
            highlightedAgentIds={highlightedAgentIds}
            perceptionView={selectPerceptionView(state, isDebugOverlayOn)}
            conversationLinks={conversations.links}
            daylightTint={daylightTint}
            isPlaceLabelsOn={isPlaceLabelsOn}
            moveDurationMs={moveDurationMs}
            camera={controls}
            mutedSpeakers={mutedSpeakers}
            onSelectAgent={onSelectAgent}
            onToggleMute={toggleMute}
          />
        )}
      </div>
      {mapStatus.kind === "ready" && (
        <CameraControls
          mode={mode}
          controls={controls}
          canFollow={canFollow}
          isPlaceLabelsOn={isPlaceLabelsOn}
          onPlaceLabelsChange={setPlaceLabelsOn}
          thoughtMode={thoughtMode}
          onThoughtModeChange={setThoughtMode}
          isDirectorOn={director.isDirectorOn}
          onDirectorChange={director.setDirectorOn}
        />
      )}
      {mapStatus.kind === "loading" && <div className="village-notice">Loading map…</div>}
      {mapStatus.kind === "error" && (
        <div className="village-notice village-notice-error">
          <strong>The village map failed to load.</strong>
          <span>{mapStatus.message}</span>
          <span>
            Generate it with <code>npm run generate-map</code> (writes maps/village.json), check
            maps/acorn-tileset-8x8.png is there, then reload.
          </span>
        </div>
      )}
    </div>
  );
}
