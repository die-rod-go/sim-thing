import { BUCKETS } from "@village/shared";
import type { Bucket, Goal, Plan } from "@village/shared";
import { describePlanLines } from "../memory/plans";
import { config } from "../config";
import { fillStatusWords } from "../status/impairment";
import { formatMinutesAgo } from "./around-you";
import type {
  ConversationLine,
  CurrentActionSummary,
  DecisionTargets,
  PersonOnMind,
  PromptEntityGroup,
  RecalledMemory,
  SeenPlaceLine,
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

const NO_PLANS = "No plans yet.";
const NEWLINE = "\n";

/** The numbered plans, one per line, or "No plans yet.". */
export function describePlans(plans: Plan[]): string {
  return plans.length > 0 ? describePlanLines(plans).join(NEWLINE) : NO_PLANS;
}

const NESTED_INDENT = "  ";

function describeToolUses(toolUses: string[]): string[] {
  if (toolUses.length === 0) return [];
  return [config.verbs.toolUsesWords.split("{uses}").join(toolUses.join(", "))];
}

/**
 * "tavern chest, holding 2 coins (take)": name, details, then verbs in parentheses, and for a
 * carried tool what it lets the agent do here after a semicolon.
 */
function describeEntityLine(group: PromptEntityGroup): string {
  const line = [group.text, ...group.details].join(", ");
  const verbs = [group.verbs.join(", "), ...describeToolUses(group.toolUses)].filter(Boolean);
  return verbs.length > 0 ? `${line} (${verbs.join("; ")})` : line;
}

function listEntityLines(groups: PromptEntityGroup[], depth: number): string[] {
  return groups.flatMap((group) => [
    `${NESTED_INDENT.repeat(depth)}- ${describeEntityLine(group)}`,
    ...listEntityLines(group.contents, depth + 1),
  ]);
}

function describeEntityList(groups: PromptEntityGroup[]): string {
  return listEntityLines(groups, 0).join("\n");
}

/** The bullet list under "Here:", or "Nothing." */
export function describeNearbyEntities(groups: PromptEntityGroup[]): string {
  return groups.length > 0 ? describeEntityList(groups) : NOTHING;
}

/** "You carry:" and a bullet list, then, when there are any, "You can also: punch." */
export function describeBelongings(groups: PromptEntityGroup[], itemlessVerbs: string[]): string {
  const belongings =
    groups.length > 0 ? `You carry:\n${describeEntityList(groups)}` : "You carry: nothing.";
  return itemlessVerbs.length > 0
    ? `${belongings}\nYou can also: ${itemlessVerbs.join(", ")}.`
    : belongings;
}

function describeSeenPlace(place: SeenPlaceLine): string {
  const texts = config.places.promptTexts;
  if (place.entityNames === null) return place.name;
  const template = place.seenAt === null ? texts.inViewNow : texts.seenEarlier;
  return template
    .split("{place}")
    .join(place.name)
    .split("{time}")
    .join(place.seenAt ?? "")
    .split("{entities}")
    .join(place.entityNames.length > 0 ? place.entityNames.join(", ") : texts.nothingThere);
}

/** The bullet list under "Places you have seen". */
export function describeSeenPlaces(places: SeenPlaceLine[]): string {
  return bulletList(places.map(describeSeenPlace), config.places.promptTexts.noneSeen);
}

export function describeWorkingMemory(workingMemory: string[]): string {
  return bulletList(workingMemory, NOTHING);
}

export function describePeopleOnMind(people: PersonOnMind[]): string {
  return bulletList(
    people.map((person) => `${person.name}: ${person.text}`),
    config.dossier.nobodyOnMindText,
  );
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
  const notes = [
    currentAction.slowedBy === null
      ? null
      : fillStatusWords(config.impairment.slowOngoingText, currentAction.slowedBy),
    currentAction.minutesLeft === null ? null : `about ${currentAction.minutesLeft} min left`,
  ].filter((note) => note !== null);
  const aside = notes.length === 0 ? "" : ` (${notes.join(", ")})`;
  return `You are in the middle of: ${currentAction.description}${aside}.`;
}

export function describeDecisionReason(reason: string | null): string {
  return reason ? `Just now: ${reason}.` : "";
}

export function describeLastFailure(lastFailure: string | null): string {
  return lastFailure ? `What just went wrong: ${lastFailure}` : "";
}

/** One `## Memories: <bucket>` section per bucket with recalled memories, in bucket order. */
export function describeMemories(
  memories: Partial<Record<Bucket, RecalledMemory[]>>,
  foggedBy: string | null,
): string {
  if (foggedBy !== null) return fillStatusWords(config.impairment.foggyMindText, foggedBy);
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
