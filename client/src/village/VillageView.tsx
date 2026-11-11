import { useEffect, useRef, useState, type RefObject } from "react";
import { clientConfig } from "../client-config";
import { computeTickDurationMs } from "../format/formatters";
import type { ClientState } from "../state/client-state";
import { useVillageMap } from "./use-village-map";
import { computeFitZoom } from "./village-geometry";
import { VillageWorld } from "./VillageWorld";

interface ViewSize {
  width: number;
  height: number;
}

interface VillageViewProps {
  state: ClientState;
  isDebugOverlayOn: boolean;
  onSelectAgent: (agentId: string) => void;
}

function useElementSize(elementRef: RefObject<HTMLElement | null>): ViewSize {
  const [size, setSize] = useState<ViewSize>({ width: 0, height: 0 });
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

/** The village map scaled to fit its panel; renders only what the client state says. */
export function VillageView({ state, isDebugOverlayOn, onSelectAgent }: VillageViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewSize = useElementSize(containerRef);
  const mapStatus = useVillageMap();
  const moveDurationMs = computeTickDurationMs(
    state.baseTicksPerSecond,
    state.clock.speed,
    clientConfig.village.maxMoveTweenMs,
  );

  let world = null;
  if (mapStatus.kind === "ready") {
    const { map } = mapStatus;
    const mapPixelWidth = map.width * map.tileWidth;
    const mapPixelHeight = map.height * map.tileHeight;
    const zoom = computeFitZoom(viewSize.width, viewSize.height, mapPixelWidth, mapPixelHeight);
    const offsetX = (viewSize.width - mapPixelWidth * zoom) / 2;
    const offsetY = (viewSize.height - mapPixelHeight * zoom) / 2;
    world = (
      <div
        className="village-world"
        style={{
          width: mapPixelWidth,
          height: mapPixelHeight,
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`,
        }}
      >
        <VillageWorld
          map={map}
          tilesetImage={mapStatus.tilesetImage}
          agents={state.agents}
          speechBubbles={state.speechBubbles}
          inspectedAgentId={state.inspectedAgentId}
          perceptionView={selectPerceptionView(state, isDebugOverlayOn)}
          moveDurationMs={moveDurationMs}
          onSelectAgent={onSelectAgent}
        />
      </div>
    );
  }

  return (
    <div className="village-view">
      <div className="village-canvas" ref={containerRef}>
        {world}
      </div>
      {mapStatus.kind === "loading" && <div className="village-notice">Loading map…</div>}
      {mapStatus.kind === "error" && (
        <div className="village-notice village-notice-error">
          <strong>The village map failed to load.</strong>
          <span>{mapStatus.message}</span>
          <span>
            Generate it with <code>npm run generate-map</code> (writes maps/village.json and
            maps/tileset.png), then reload.
          </span>
        </div>
      )}
    </div>
  );
}
