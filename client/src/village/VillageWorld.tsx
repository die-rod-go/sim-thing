import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  isBodyInWorld,
  type Agent,
  type Entity,
  type Position,
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
import { FogOverlay } from "./FogOverlay";
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
import type { GodClickTarget } from "./god-mode";
import { useHoveredAgent } from "./use-hovered-agent";
import { findPointedTile, useInspectedTile, type MapPointerHandlers } from "./use-inspected-tile";
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
  /** Whom the camera keeps centered in follow mode: the played agent, else the inspected one. */
  followedAgentId: string | null;
  /** The player's own agent, marked as such on the map. */
  playedAgentId: string | null;
  /** When seeing as the played agent, only these agents are drawn; null draws everyone. */
  sensedAgentIds: ReadonlySet<string> | null;
  highlightedAgentIds: readonly string[];
  perceptionView: PerceptionView;
  /** Tiles the played agent sees, everything else under fog; null to show the whole village. */
  fogTiles: readonly number[] | null;
  /** Speech reads as the played agent heard it. */
  isSeeingAsPlayer: boolean;
  daylightTint: string;
  isPlaceLabelsOn: boolean;
  moveDurationMs: number;
  camera: CameraControls;
  mutedSpeakers: MutedSpeakers;
  onSelectAgent: (agentId: string) => void;
  onToggleMute: (agentId: string) => void;
  /** While god mode edits, takes clicks on tiles and agents instead of pinning and selecting. */
  godClick: ((target: GodClickTarget) => void) | null;
  /** While the player plays, a click on a tile walks there instead of pinning it. */
  playerTileClick: ((tile: Position) => void) | null;
}

const NO_BUBBLES: readonly SpeechBubble[] = [];

function withTileClicks(
  handlers: MapPointerHandlers,
  map: TiledMap,
  godClick: ((target: GodClickTarget) => void) | null,
  playerTileClick: ((tile: Position) => void) | null,
): MapPointerHandlers {
  if (godClick === null && playerTileClick === null) return handlers;
  return {
    ...handlers,
    onClick: (event) => {
      const pointer = { x: event.clientX, y: event.clientY };
      const tile = findPointedTile(pointer, event.currentTarget.getBoundingClientRect(), map);
      if (!tile) return;
      if (godClick) godClick({ kind: "tile", pos: tile });
      else playerTileClick?.(tile);
    },
  };
}

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
  const { map, agents, inspectedAgentId, camera, sensedAgentIds } = props;
  const world = useWorldElements();
  const bubbleKeys = useBubbleKeys();
  const { liveBubbles, expireBubble } = useLiveSpeechBubbles(props.speechBubbles);
  const agentColors = useMemo(() => buildAgentColors(agents), [agents]);
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const drawnAgents = useMemo(
    () =>
      agents.filter(
        (agent) =>
          isBodyInWorld(agent) && (sensedAgentIds === null || sensedAgentIds.has(agent.id)),
      ),
    [agents, sensedAgentIds],
  );
  const drawnAgentIds = new Set(drawnAgents.map((agent) => agent.id));
  const shownBubbles = liveBubbles.filter(
    (bubble) => drawnAgentIds.has(bubble.agentId) && !props.mutedSpeakers.has(bubble.agentId),
  );
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
  const { godClick, playerTileClick } = props;
  const mapPointerHandlers = useMemo(
    () => withTileClicks(tileInspector.mapPointerHandlers, map, godClick, playerTileClick),
    [tileInspector.mapPointerHandlers, map, godClick, playerTileClick],
  );
  const selectAgent = godClick
    ? (agentId: string) => godClick({ kind: "agent", agentId })
    : props.onSelectAgent;
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
  const followedAgentIdRef = useRef(props.followedAgentId);

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
    followedAgentIdRef.current = props.followedAgentId;
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
        {...mapPointerHandlers}
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
        {props.fogTiles && <FogOverlay map={map} visibleTiles={props.fogTiles} />}
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
            isPlayed={agent.id === props.playedAgentId}
            visibleConditions={listVisibleBodyComponents(props.catalog, agent)}
            activityCue={pickActivityCue(agent.currentAction, activity)}
            markerRef={world.markers.register(agent.id)}
            onSelect={selectAgent}
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
            isSeeingAsPlayer={props.isSeeingAsPlayer}
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
