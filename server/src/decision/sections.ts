import { PERSON_ENTRY_FIELDS, type KeyMemory, type LongTermGoal } from "@village/shared";
import { config } from "../config";
import { truncateEntryText } from "../memory/stream";
import { fillStatusWords } from "../status/impairment";
import type {
  CurrentActionSummary,
  DecisionTargets,
  KnownPerson,
  PromptEntityGroup,
  SeenPlaceLine,
} from "./context";

const NOTHING = "Nothing.";

function bulletList(lines: string[], emptyText: string): string {
  return lines.length > 0 ? lines.map((line) => `- ${line}`).join("\n") : emptyText;
}

export function describeLongTermGoals(goals: readonly LongTermGoal[]): string {
  return bulletList(
    goals.map((goal) => `${goal.goal} (why: ${goal.reason}; so far: ${goal.progress})`),
    config.goals.noLongTermText,
  );
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
  return texts.lookedInto
    .split("{place}")
    .join(place.name)
    .split("{entities}")
    .join(place.entityNames.length > 0 ? place.entityNames.join(", ") : texts.nothingThere);
}

/** The bullet list under "Places you know". */
export function describeSeenPlaces(places: SeenPlaceLine[]): string {
  return bulletList(places.map(describeSeenPlace), config.places.promptTexts.noneSeen);
}

/** "## Earlier today" over a bullet list, or nothing at all when the level holds nothing. */
function describeMemoryLevel(title: string, lines: readonly string[]): string {
  return lines.length === 0 ? "" : `## ${title}\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

/** The memory that changes only when a chronicle forms: history, day summary and chronicles. */
export function describeOlderMemory(
  history: string | null,
  daySummary: string | null,
  chronicles: readonly string[],
): string {
  const titles = config.memory.promptTitles;
  return [
    describeMemoryLevel(titles.history, history === null ? [] : [history]),
    describeMemoryLevel(titles.daySummary, daySummary === null ? [] : [daySummary]),
    describeMemoryLevel(titles.chronicles, chronicles),
  ]
    .filter((section) => section !== "")
    .join("\n\n");
}

export function describeEpisodes(episodes: readonly string[]): string {
  return describeMemoryLevel(config.memory.promptTitles.episodes, episodes);
}

/** The stream as a bullet list, oldest first. */
export function describeStream(stream: string[]): string {
  return bulletList(stream, config.memory.streamTexts.empty);
}

/** "Day 2: Beckett died in the square": a key memory with the day it happened. */
export function describeKeyMemory(keyMemory: KeyMemory): string {
  return config.memory.keyMemoryText
    .split("{day}")
    .join(String(keyMemory.day))
    .split("{text}")
    .join(keyMemory.text);
}

/**
 * "## Things you will never forget" over one line per key memory, each with the day it happened;
 * empty when there are none.
 */
export function describeKeyMemories(keyMemories: readonly KeyMemory[]): string {
  if (keyMemories.length === 0) return "";
  const lines = keyMemories.map((keyMemory) => `- ${describeKeyMemory(keyMemory)}`);
  return `## ${config.memory.keyMemoriesTitle}\n${lines.join("\n")}`;
}

/** "Beckett (she/her)", or the bare name when no pronouns are known. */
export function describeNameWithPronouns(name: string, pronouns: string): string {
  return pronouns.trim() === "" ? name : `${name} (${pronouns.trim()})`;
}

function describePerson(person: KnownPerson): string[] {
  const name = describeNameWithPronouns(person.name, person.pronouns);
  const lines = PERSON_ENTRY_FIELDS.filter((field) => person.entry[field].trim() !== "").map(
    (field) => `${NESTED_INDENT}${config.people.fieldLabels[field]}: ${person.entry[field]}`,
  );
  if (lines.length === 0) return [`- ${name}: ${config.people.emptyEntryText}`];
  return [`- ${name}`, ...lines];
}

/** "- Tom (he/him): Fair, but slow to pay.": one short line per person the agent knows. */
export function describePersonLines(people: readonly KnownPerson[]): string {
  if (people.length === 0) return config.people.nobodyKnownText;
  return people
    .map((person) => {
      const name = describeNameWithPronouns(person.name, person.pronouns);
      const opinion = person.entry.whatIThinkOfThem.trim();
      const summary =
        opinion === ""
          ? config.people.emptyEntryText
          : truncateEntryText(opinion, config.people.summaryMaxChars);
      return `- ${name}: ${summary}`;
    })
    .join("\n");
}

/** The full entries of the people on the agent's mind, under their title; empty when none. */
export function describePeopleOnMind(people: readonly KnownPerson[]): string {
  if (people.length === 0) return "";
  const entries = people.flatMap(describePerson).join("\n");
  return `## ${config.people.onMindTitle}\n${config.people.onMindIntro}\n${entries}`;
}

/** Everyone the agent knows, each with the fields of their entry that hold something. */
export function describePeople(people: readonly KnownPerson[]): string {
  return people.length > 0
    ? people.flatMap(describePerson).join("\n")
    : config.people.nobodyKnownText;
}

/** Opens the line saying what the agent is in the middle of. */
export const CURRENT_ACTION_PREFIX = "You are in the middle of: ";
/** Opens the line saying what flagged the decision. */
export const DECISION_REASON_PREFIX = "Just now: ";

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
  return `${CURRENT_ACTION_PREFIX}${currentAction.description}${aside}.`;
}

export function describeDecisionReason(reason: string | null): string {
  return reason ? `${DECISION_REASON_PREFIX}${reason}.` : "";
}

export function describeLastFailure(lastFailure: string | null): string {
  return lastFailure ? `What just went wrong: ${lastFailure}` : "";
}

export function listTargetNames(targets: DecisionTargets): string[] {
  const allNames = [...targets.places, ...targets.agents, ...targets.entities, ...targets.aimOnly];
  return [...new Set(allNames)];
}
