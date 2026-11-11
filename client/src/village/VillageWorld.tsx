import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  Agent,
  ConditionDefinition,
  Entity,
  ItemDefinition,
  SimTimeSettings,
} from "@village/shared";
import { clientConfig } from "../client-config";
import { buildAgentColors } from "../format/agent-colors";
import { listVisibleConditions } from "../format/conditions";
import type { SpeechBubble } from "../state/client-state";
import { pickActivityCue, type ConversationLink } from "./activity-cues";
import { retargetMotion, type AgentMotion } from "./agent-motion";
import { AgentMarker } from "./AgentMarker";
import { HoverCard } from "./HoverCard";
import type { MutedSpeakers } from "./muted-speakers";
import { PerceptionOverlay, type PerceptionView } from "./perception-overlay";
import { ConversationLinks, PlaceLabels } from "./screen-overlays";
import { groupBubblesBySpeaker, SpeechBubbleStack, useLiveSpeechBubbles } from "./SpeechBubbles";
import type { VisibleThought } from "./thought-bubbles";
import { EntityConditionOverlays } from "./EntityConditionOverlays";
import { EntityGlyphs } from "./EntityGlyphs";
import type { GlyphPainter } from "./glyph-painter";
import { TileCanvas } from "./TileCanvas";
import type { TiledMap } from "./tiled-map";
import { useHoveredAgent } from "./use-hovered-agent";
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
  itemDefinitions: readonly ItemDefinition[];
  conditionDefinitions: readonly ConditionDefinition[];
  speechBubbles: SpeechBubble[];
  thoughtsByAgent: ReadonlyMap<string, VisibleThought>;
  timeSettings: SimTimeSettings;
  inspectedAgentId: string | null;
  highlightedAgentIds: readonly string[];
  perceptionView: PerceptionView;
  conversationLinks: readonly ConversationLink[];
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
  const linkLines = useElementRegistry<SVGLineElement>();
  const mapLayer = useRef<HTMLDivElement | null>(null);
  const hoverCard = useRef<HTMLElement | null>(null);
  const [motions] = useState(() => new Map<string, AgentMotion>());
  return useMemo(
    () => ({
      motions,
      mapLayer,
      markers,
      bubbleStacks,
      leaderLines,
      placeLabels,
      linkLines,
      hoverCard,
    }),
    [motions, markers, bubbleStacks, leaderLines, placeLabels, linkLines],
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
 * (conversation links, place names, agents, speech bubbles) that the frame loop keeps aligned.
 */
export function VillageWorld(props: VillageWorldProps) {
  const { map, agents, inspectedAgentId, camera } = props;
  const world = useWorldElements();
  const bubbleKeys = useBubbleKeys();
  const { liveBubbles, expireBubble } = useLiveSpeechBubbles(props.speechBubbles);
  const shownBubbles = liveBubbles.filter((bubble) => !props.mutedSpeakers.has(bubble.agentId));
  const agentColors = useMemo(() => buildAgentColors(agents), [agents]);
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const bubblesBySpeaker = groupBubblesBySpeaker(shownBubbles);
  const highlighted = new Set(props.highlightedAgentIds);
  const visiblePlaces = props.isPlaceLabelsOn ? map.places : [];

  const mapPixelWidth = map.width * map.tileWidth;
  const mapPixelHeight = map.height * map.tileHeight;
  const { hoveredAgentId, startHover, endHover } = useHoveredAgent();
  const hoveredAgent = agents.find((agent) => agent.id === hoveredAgentId) ?? null;
  const setHoverCardElement = useCallback(
    (element: HTMLElement | null) => {
      world.hoverCard.current = element;
    },
    [world],
  );
  const overheadAgentIds = [
    ...new Set([...bubblesBySpeaker.keys(), ...props.thoughtsByAgent.keys()]),
  ];
  const sceneRef = useRef<WorldScene>({ places: [], links: [], hoveredAgentId: null });
  const followedAgentIdRef = useRef(inspectedAgentId);

  useAgentMotions(world, agents, map.tileWidth, props.moveDurationMs);

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
      links: props.conversationLinks,
      hoveredAgentId: hoveredAgent?.id ?? null,
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
      >
        <TileCanvas map={map} glyphPainter={props.glyphPainter} />
        <EntityGlyphs
          map={map}
          glyphPainter={props.glyphPainter}
          entities={props.entities}
          definitions={props.itemDefinitions}
        />
        <div className="village-tint" style={{ background: props.daylightTint }} />
        <EntityConditionOverlays
          entities={props.entities}
          definitions={props.conditionDefinitions}
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
        <ConversationLinks links={props.conversationLinks} lineRegistry={world.linkLines} />
        <PlaceLabels places={visiblePlaces} labelRegistry={world.placeLabels} />
        {agents.map((agent) => (
          <AgentMarker
            key={agent.id}
            agentId={agent.id}
            name={agent.name}
            color={agentColors.get(agent.id) ?? "white"}
            isSelected={agent.id === inspectedAgentId}
            isHighlighted={highlighted.has(agent.id)}
            isSpeaking={bubblesBySpeaker.has(agent.id)}
            isMuted={props.mutedSpeakers.has(agent.id)}
            isDead={agent.death !== null}
            visibleConditions={listVisibleConditions(agent.conditions, props.conditionDefinitions)}
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
          conditionDefinitions={props.conditionDefinitions}
          color={hoveredAgent ? (agentColors.get(hoveredAgent.id) ?? "white") : "white"}
          timeSettings={props.timeSettings}
          cardRef={setHoverCardElement}
        />
      </div>
    </>
  );
}
