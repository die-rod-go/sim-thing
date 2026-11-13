import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  isBodyInWorld,
  type Agent,
  type Entity,
  type SimTimeSettings,
  type ThingCatalog,
} from "@village/shared";
import { clientConfig } from "../client-config";
import { buildAgentColors } from "../format/agent-colors";
import { listVisibleBodyComponents } from "../format/conditions";
import type { SpeechBubble } from "../state/client-state";
import { pickActivityCue } from "./activity-cues";
import { retargetMotion, type AgentMotion } from "./agent-motion";
import { AgentMarker } from "./AgentMarker";
import { HoverCard } from "./HoverCard";
import type { MutedSpeakers } from "./muted-speakers";
import { PerceptionOverlay, type PerceptionView } from "./perception-overlay";
import { PlaceLabels } from "./screen-overlays";
import { groupBubblesBySpeaker, SpeechBubbleStack, useLiveSpeechBubbles } from "./SpeechBubbles";
import type { VisibleThought } from "./thought-bubbles";
import { EntityConditionOverlays } from "./EntityConditionOverlays";
import { EntityGlyphs } from "./EntityGlyphs";
import type { GlyphPainter } from "./glyph-painter";
import { TileCanvas } from "./TileCanvas";
import { TileCard, TileHighlight } from "./TileCard";
import type { TiledMap } from "./tiled-map";
import { useHoveredAgent } from "./use-hovered-agent";
import { useInspectedTile } from "./use-inspected-tile";
import type { CameraControls } from "./use-camera-rig";
import { tileCenter } from "./village-geometry";
import {
  computeAgentPositions,
  layOutWorld,
  useAnimationFrames,
  useElementRegistry,
  type WorldElements,
  type WorldScene,
} from "./world-layout";

interface VillageWorldProps {
  map: TiledMap;
  glyphPainter: GlyphPainter;
  agents: Agent[];
  entities: readonly Entity[];
  catalog: ThingCatalog;
  speechBubbles: SpeechBubble[];
  thoughtsByAgent: ReadonlyMap<string, VisibleThought>;
  timeSettings: SimTimeSettings;
  currentTick: number;
  inspectedAgentId: string | null;
  highlightedAgentIds: readonly string[];
  perceptionView: PerceptionView;
  daylightTint: string;
  isPlaceLabelsOn: boolean;
  moveDurationMs: number;
  camera: CameraControls;
  mutedSpeakers: MutedSpeakers;
  onSelectAgent: (agentId: string) => void;
  onToggleMute: (agentId: string) => void;
}

const NO_BUBBLES: readonly SpeechBubble[] = [];

function useBubbleKeys(): (bubble: SpeechBubble) => number {
  const [keyer] = useState(() => {
    const keysByBubble = new WeakMap<SpeechBubble, number>();
    let nextKey = 0;
    return (bubble: SpeechBubble) => {
      const existing = keysByBubble.get(bubble);
      if (existing !== undefined) return existing;
      nextKey += 1;
      keysByBubble.set(bubble, nextKey);
      return nextKey;
    };
  });
  return keyer;
}

function useWorldElements(): WorldElements {
  const markers = useElementRegistry();
  const bubbleStacks = useElementRegistry();
  const leaderLines = useElementRegistry();
  const placeLabels = useElementRegistry();
  const mapLayer = useRef<HTMLDivElement | null>(null);
  const hoverCard = useRef<HTMLElement | null>(null);
  const tileCard = useRef<HTMLElement | null>(null);
  const [motions] = useState(() => new Map<string, AgentMotion>());
  return useMemo(
    () => ({
      motions,
      mapLayer,
      markers,
      bubbleStacks,
      leaderLines,
      placeLabels,
      hoverCard,
      tileCard,
    }),
    [motions, markers, bubbleStacks, leaderLines, placeLabels],
  );
}

/** Keeps each agent's glide pointed at its current tile. */
function useAgentMotions(
  world: WorldElements,
  agents: Agent[],
  tileSize: number,
  durationMs: number,
) {
  useLayoutEffect(() => {
    const nowMs = performance.now();
    const presentIds = new Set(agents.map((agent) => agent.id));
    for (const agentId of world.motions.keys()) {
      if (!presentIds.has(agentId)) world.motions.delete(agentId);
    }
    for (const agent of agents) {
      const target = tileCenter(agent.pos, tileSize);
      const motion = world.motions.get(agent.id);
      world.motions.set(agent.id, retargetMotion(motion, target, nowMs, durationMs));
    }
  }, [world, agents, tileSize, durationMs]);
}

/**
 * The village: a camera-scaled map layer (tiles, tint, debug overlay) under a screen-space layer
 * (place names, agents, speech bubbles) that the frame loop keeps aligned.
 */
export function VillageWorld(props: VillageWorldProps) {
  const { map, agents, inspectedAgentId, camera } = props;
  const world = useWorldElements();
  const bubbleKeys = useBubbleKeys();
  const { liveBubbles, expireBubble } = useLiveSpeechBubbles(props.speechBubbles);
  const shownBubbles = liveBubbles.filter((bubble) => !props.mutedSpeakers.has(bubble.agentId));
  const agentColors = useMemo(() => buildAgentColors(agents), [agents]);
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const drawnAgents = useMemo(() => agents.filter(isBodyInWorld), [agents]);
  const bubblesBySpeaker = groupBubblesBySpeaker(shownBubbles);
  const highlighted = new Set(props.highlightedAgentIds);
  const visiblePlaces = props.isPlaceLabelsOn ? map.places : [];

  const mapPixelWidth = map.width * map.tileWidth;
  const mapPixelHeight = map.height * map.tileHeight;
  const { hoveredAgentId, startHover, endHover } = useHoveredAgent();
  const hoveredAgent = drawnAgents.find((agent) => agent.id === hoveredAgentId) ?? null;
  const setHoverCardElement = useCallback(
    (element: HTMLElement | null) => {
      world.hoverCard.current = element;
    },
    [world],
  );
  const overheadAgentIds = [
    ...new Set([...bubblesBySpeaker.keys(), ...props.thoughtsByAgent.keys()]),
  ];
  const tileInspector = useInspectedTile({
    map,
    agents: drawnAgents,
    entities: props.entities,
    catalog: props.catalog,
  });
  const { shownTile } = tileInspector;
  const setTileCardElement = useCallback(
    (element: HTMLElement | null) => {
      world.tileCard.current = element;
    },
    [world],
  );
  const sceneRef = useRef<WorldScene>({
    places: [],
    hoveredAgentId: null,
    inspectedTile: null,
    tileSize: map.tileWidth,
  });
  const followedAgentIdRef = useRef(inspectedAgentId);

  useAgentMotions(world, drawnAgents, map.tileWidth, props.moveDurationMs);

  const renderFrame = useCallback(
    (nowMs: number) => {
      const positions = computeAgentPositions(world.motions, nowMs);
      const controller = camera.advanceFrame(
        positions,
        map.tileWidth,
        followedAgentIdRef.current,
        nowMs,
      );
      if (!controller.current) return;
      layOutWorld(world, sceneRef.current, {
        camera: controller.current,
        view: camera.viewSizeRef.current,
        positions,
      });
    },
    [world, camera, map.tileWidth],
  );
  useLayoutEffect(() => {
    camera.mapSizeRef.current = { width: mapPixelWidth, height: mapPixelHeight };
    sceneRef.current = {
      places: visiblePlaces,
      hoveredAgentId: hoveredAgent?.id ?? null,
      inspectedTile: shownTile,
      tileSize: map.tileWidth,
    };
    followedAgentIdRef.current = inspectedAgentId;
    renderFrame(performance.now());
  });
  useAnimationFrames(renderFrame);

  const { activity } = clientConfig.village;
  return (
    <>
      <div
        className="village-world"
        ref={world.mapLayer}
        style={{ width: mapPixelWidth, height: mapPixelHeight }}
        {...tileInspector.mapPointerHandlers}
      >
        <TileCanvas map={map} glyphPainter={props.glyphPainter} />
        <EntityGlyphs
          map={map}
          glyphPainter={props.glyphPainter}
          entities={props.entities}
          catalog={props.catalog}
        />
        <div className="village-tint" style={{ background: props.daylightTint }} />
        <EntityConditionOverlays
          entities={props.entities}
          catalog={props.catalog}
          tileSize={map.tileWidth}
        />
        <TileHighlight
          tile={shownTile}
          isPinned={tileInspector.isPinned}
          tileSize={map.tileWidth}
        />
        {props.perceptionView && (
          <PerceptionOverlay
            view={props.perceptionView}
            mapWidthTiles={map.width}
            mapHeightTiles={map.height}
            tileSize={map.tileWidth}
          />
        )}
      </div>
      <div className="village-screen">
        <PlaceLabels places={visiblePlaces} labelRegistry={world.placeLabels} />
        {drawnAgents.map((agent) => (
          <AgentMarker
            key={agent.id}
            agentId={agent.id}
            name={agent.name}
            color={agentColors.get(agent.id) ?? "white"}
            glyphPainter={props.glyphPainter}
            isSelected={agent.id === inspectedAgentId}
            isHighlighted={highlighted.has(agent.id)}
            isSpeaking={bubblesBySpeaker.has(agent.id)}
            isMuted={props.mutedSpeakers.has(agent.id)}
            isDead={agent.death !== null}
            visibleConditions={listVisibleBodyComponents(props.catalog, agent)}
            activityCue={pickActivityCue(agent.currentAction, activity)}
            markerRef={world.markers.register(agent.id)}
            onSelect={props.onSelectAgent}
            onZoomTo={(agentId) => camera.focus({ kind: "agent", agentId })}
            onToggleMute={props.onToggleMute}
            onHoverStart={startHover}
            onHoverEnd={endHover}
          />
        ))}
        {overheadAgentIds.map((agentId) => (
          <SpeechBubbleStack
            key={agentId}
            speakerName={agentNames.get(agentId) ?? agentId}
            speakerColor={agentColors.get(agentId) ?? "white"}
            bubbles={bubblesBySpeaker.get(agentId) ?? NO_BUBBLES}
            thought={props.thoughtsByAgent.get(agentId) ?? null}
            bubbleKeys={bubbleKeys}
            stackRef={world.bubbleStacks.register(agentId)}
            leaderLineRef={world.leaderLines.register(agentId)}
            onExpire={expireBubble}
          />
        ))}
        <HoverCard
          agent={hoveredAgent}
          catalog={props.catalog}
          color={hoveredAgent ? (agentColors.get(hoveredAgent.id) ?? "white") : "white"}
          timeSettings={props.timeSettings}
          cardRef={setHoverCardElement}
        />
        <TileCard
          inspection={tileInspector.inspection}
          isPinned={tileInspector.isPinned}
          onClose={tileInspector.unpin}
          cardRef={setTileCardElement}
        />
      </div>
    </>
  );
}
