import { BUCKETS } from "@village/shared";
import type { Bucket, Goal } from "@village/shared";
import { config } from "../config";
import { formatMinutesAgo } from "./around-you";
import type {
  ConversationLine,
  CurrentActionSummary,
  DecisionTargets,
  NearbyObject,
  RecalledMemory,
} from "./context";

const NOTHING = "Nothing.";

function bulletList(lines: string[], emptyText: string): string {
  return lines.length > 0 ? lines.map((line) => `- ${line}`).join("\n") : emptyText;
}

export function describeGoals(goals: Goal[]): string {
  return bulletList(
    goals.map((goal) => `${goal.text} (why: ${goal.why}; so far: ${goal.progress})`),
    "No particular goals right now.",
  );
}

export function describeNearbyObjects(objects: NearbyObject[]): string {
  if (objects.length === 0) return NOTHING;
  return objects
    .map((object) =>
      object.interactions.length > 0
        ? `${object.name} (${object.interactions.join(", ")})`
        : object.name,
    )
    .join(", ");
}

export function describeBelongings(coins: number, inventory: Record<string, number>): string {
  const items = Object.entries(inventory)
    .filter(([, count]) => count > 0)
    .map(([item, count]) => {
      const interactions = config.heldItems[item]?.interactions ?? [];
      return interactions.length > 0
        ? `${count} ${item} (${interactions.join(", ")})`
        : `${count} ${item}`;
    });
  const carried = items.length > 0 ? items.join(", ") : "nothing else";
  return `Coins: ${coins}. You carry: ${carried}.`;
}

export function describeWorkingMemory(workingMemory: string[]): string {
  return bulletList(workingMemory, NOTHING);
}

export function describeConversation(lines: ConversationLine[]): string {
  return bulletList(
    lines.map(
      (line) => `${line.speakerName} (${formatMinutesAgo(line.minutesAgo)}): "${line.words}"`,
    ),
    "No one has been talking with you.",
  );
}

export function describeCurrentAction(
  currentAction: CurrentActionSummary | null,
  isMidActionInterrupt: boolean,
): string {
  if (!currentAction || !isMidActionInterrupt) return "";
  const timeLeft =
    currentAction.minutesLeft === null ? "" : ` (about ${currentAction.minutesLeft} min left)`;
  return `You are in the middle of: ${currentAction.description}${timeLeft}.`;
}

export function describeLastFailure(lastFailure: string | null): string {
  return lastFailure ? `What just went wrong: ${lastFailure}` : "";
}

/** One `## Memories: <bucket>` section per bucket with recalled memories, in bucket order. */
export function describeMemories(memories: Partial<Record<Bucket, RecalledMemory[]>>): string {
  return BUCKETS.flatMap((bucket) => {
    const bucketMemories = memories[bucket] ?? [];
    if (bucketMemories.length === 0) return [];
    const lines = [...bucketMemories]
      .sort((first, second) => first.minutesAgo - second.minutesAgo)
      .map((memory) => `- ${memory.text} (${formatMinutesAgo(memory.minutesAgo)})`);
    return [`## Memories: ${bucket}\n${lines.join("\n")}`];
  }).join("\n\n");
}

export function listTargetNames(targets: DecisionTargets): string[] {
  const allNames = [...targets.places, ...targets.agents, ...targets.objects, ...targets.heldItems];
  return [...new Set(allNames)];
}
