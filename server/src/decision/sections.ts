import { BUCKETS } from "@village/shared";
import type { Bucket, Goal } from "@village/shared";
import { formatMinutesAgo } from "./around-you";
import type {
  ConversationLine,
  CurrentActionSummary,
  DecisionTargets,
  PromptEntityGroup,
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

/** "wheat field (harvest wheat; empty)": verbs first, then what can be seen of it. */
function describeEntityGroup(group: PromptEntityGroup): string {
  const details = [group.verbs.join(", "), group.condition ?? ""].filter(Boolean);
  return details.length > 0 ? `${group.text} (${details.join("; ")})` : group.text;
}

/** "oven (bake bread), bakery door (open, close; open)" */
export function describeNearbyEntities(groups: PromptEntityGroup[]): string {
  if (groups.length === 0) return NOTHING;
  return groups.map(describeEntityGroup).join(", ");
}

/** "You carry: 30 coins, 3 bread (eat)." then, when there are any, "You can also: punch." */
export function describeBelongings(groups: PromptEntityGroup[], itemlessVerbs: string[]): string {
  const carried = groups.length > 0 ? groups.map(describeEntityGroup).join(", ") : "nothing";
  const belongings = `You carry: ${carried}.`;
  return itemlessVerbs.length > 0
    ? `${belongings}\nYou can also: ${itemlessVerbs.join(", ")}.`
    : belongings;
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
  const allNames = [...targets.places, ...targets.agents, ...targets.entities, ...targets.aimOnly];
  return [...new Set(allNames)];
}
