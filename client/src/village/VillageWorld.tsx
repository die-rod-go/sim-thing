import { useLayoutEffect, useMemo, useState } from "react";
import type { Agent } from "@village/shared";
import { buildAgentColors } from "../format/agent-colors";
import type { SpeechBubble } from "../state/client-state";
import { retargetMotion, type AgentMotion } from "./agent-motion";
import { AgentMarker } from "./AgentMarker";
import { PerceptionOverlay, type PerceptionView } from "./perception-overlay";
import { groupBubblesBySpeaker, SpeechBubbleStack, useLiveSpeechBubbles } from "./SpeechBubbles";
import { TileCanvas } from "./TileCanvas";
import type { TiledMap } from "./tiled-map";
import { tileCenter } from "./village-geometry";
import {
  layOutWorld,
  useElementRegistry,
  useWorldAnimation,
  type WorldElements,
} from "./world-layout";

interface VillageWorldProps {
  map: TiledMap;
  tilesetImage: HTMLImageElement;
  agents: Agent[];
  speechBubbles: SpeechBubble[];
  inspectedAgentId: string | null;
  perceptionView: PerceptionView;
  moveDurationMs: number;
  onSelectAgent: (agentId: string) => void;
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

/** The map at native pixel size: tiles, debug overlay, agents and their speech bubbles. */
export function VillageWorld({
  map,
  tilesetImage,
  agents,
  speechBubbles,
  inspectedAgentId,
  perceptionView,
  moveDurationMs,
  onSelectAgent,
}: VillageWorldProps) {
  const markers = useElementRegistry();
  const bubbleStacks = useElementRegistry();
  const leaderLines = useElementRegistry();
  const [motions] = useState(() => new Map<string, AgentMotion>());
  const world = useMemo<WorldElements>(
    () => ({ motions, markers, bubbleStacks, leaderLines }),
    [motions, markers, bubbleStacks, leaderLines],
  );
  const bubbleKeys = useBubbleKeys();
  const { liveBubbles, expireBubble } = useLiveSpeechBubbles(speechBubbles);
  const agentColors = useMemo(() => buildAgentColors(agents), [agents]);
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));

  useLayoutEffect(() => {
    const nowMs = performance.now();
    const presentIds = new Set(agents.map((agent) => agent.id));
    for (const agentId of motions.keys()) {
      if (!presentIds.has(agentId)) motions.delete(agentId);
    }
    for (const agent of agents) {
      const target = tileCenter(agent.pos, map.tileWidth);
      motions.set(agent.id, retargetMotion(motions.get(agent.id), target, nowMs, moveDurationMs));
    }
  }, [agents, map.tileWidth, moveDurationMs, motions]);

  useLayoutEffect(() => layOutWorld(world, performance.now()));
  useWorldAnimation(world);

  return (
    <>
      <TileCanvas map={map} tilesetImage={tilesetImage} />
      {perceptionView && (
        <PerceptionOverlay
          view={perceptionView}
          mapWidthTiles={map.width}
          mapHeightTiles={map.height}
          tileSize={map.tileWidth}
        />
      )}
      {agents.map((agent) => (
        <AgentMarker
          key={agent.id}
          agentId={agent.id}
          name={agent.name}
          color={agentColors.get(agent.id) ?? "white"}
          isSelected={agent.id === inspectedAgentId}
          markerRef={markers.register(agent.id)}
          onSelect={onSelectAgent}
        />
      ))}
      {[...groupBubblesBySpeaker(liveBubbles)].map(([agentId, bubbles]) => (
        <SpeechBubbleStack
          key={agentId}
          speakerName={agentNames.get(agentId) ?? agentId}
          bubbles={bubbles}
          bubbleKeys={bubbleKeys}
          stackRef={bubbleStacks.register(agentId)}
          leaderLineRef={leaderLines.register(agentId)}
          onExpire={expireBubble}
        />
      ))}
    </>
  );
}
