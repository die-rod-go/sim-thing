import type { Position } from "@village/shared";
import type { ConversationThread } from "./conversations";

export interface WebNode {
  agentId: string;
  position: Position;
  /** Lines either of the two spoke in conversations they shared; drawn as edge thickness only. */
  sharedLineCount: number;
}

export interface WebLayout {
  center: Position;
  nodes: WebNode[];
  maxSharedLineCount: number;
}

export interface WebGeometry {
  size: number;
  ringRadius: number;
}

function countSharedLines(threads: ConversationThread[], agentId: string, otherId: string): number {
  let count = 0;
  for (const thread of threads) {
    if (!thread.speakerIds.includes(agentId) || !thread.speakerIds.includes(otherId)) continue;
    for (const entry of thread.entries) {
      if (entry.kind === "line" && (entry.speakerId === agentId || entry.speakerId === otherId)) {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * Who this agent has talked with lately, laid out on a ring around it; most talked-with first,
 * starting at the top and going clockwise. Display only.
 */
export function layOutRelationshipWeb(
  agentId: string,
  otherAgentIds: readonly string[],
  threads: ConversationThread[],
  geometry: WebGeometry,
): WebLayout {
  const center = { x: geometry.size / 2, y: geometry.size / 2 };
  const talkedWith = otherAgentIds
    .map((otherId) => ({ otherId, count: countSharedLines(threads, agentId, otherId) }))
    .filter((entry) => entry.count > 0)
    .sort(
      (first, second) => second.count - first.count || first.otherId.localeCompare(second.otherId),
    );
  const angleStep = (2 * Math.PI) / Math.max(talkedWith.length, 1);
  const nodes = talkedWith.map((entry, index): WebNode => {
    const angle = -Math.PI / 2 + index * angleStep;
    return {
      agentId: entry.otherId,
      sharedLineCount: entry.count,
      position: {
        x: center.x + geometry.ringRadius * Math.cos(angle),
        y: center.y + geometry.ringRadius * Math.sin(angle),
      },
    };
  });
  const maxSharedLineCount = nodes.reduce((max, node) => Math.max(max, node.sharedLineCount), 0);
  return { center, nodes, maxSharedLineCount };
}
