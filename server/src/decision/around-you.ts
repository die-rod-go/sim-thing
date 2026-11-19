import { config } from "../config";
import { describePlace } from "../memory/filing";
import { describeBodyName } from "../status/health";
import type { AroundYou, AwarenessEntry } from "./context";
import { describeNameWithPronouns } from "./sections";

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

export function formatMinutesAgo(minutesAgo: number): string {
  const minutes = Math.max(0, Math.round(minutesAgo));
  if (minutes === 0) return "just now";
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min ago`;
  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `${hours} h ago`;
  const days = Math.round(hours / HOURS_PER_DAY);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

type DistanceBand = keyof typeof config.perception.distanceTitles;

const DISTANCE_BANDS: readonly DistanceBand[] = ["inReach", "near", "far"];

/** Which section of "Around you" something in sight goes under, by how many tiles off it is. */
export function findDistanceBand(distanceTiles: number | null): DistanceBand {
  if (distanceTiles === null) return "far";
  if (distanceTiles <= config.economy.giveReachTiles) return "inReach";
  return distanceTiles <= config.perception.nearTiles ? "near" : "far";
}

interface ThingInSight {
  distanceTiles: number | null;
  text: string;
}

/**
 * "Tobias (he/him), looks in poor shape, carrying a knife (chopping wood)", or "Mara's body,
 * carried by Tobias, on fire" for someone lying dead in sight. Someone who would not hear a normal
 * voice is noted as too far to hear.
 */
function describeInSight(entry: AwarenessEntry, canHear: boolean): string {
  if (entry.isDead) {
    return [describeBodyName(entry.name), entry.holding, ...entry.visibleConditions]
      .filter(Boolean)
      .join(", ");
  }
  const carrying =
    entry.visibleCarried.length > 0 ? `carrying ${entry.visibleCarried.join(" and ")}` : null;
  const name = [
    describeNameWithPronouns(entry.name, entry.pronouns),
    entry.healthAsSeen,
    ...entry.visibleConditions,
    carrying,
    canHear ? null : config.perception.outOfEarshotWords,
  ]
    .filter(Boolean)
    .join(", ");
  return entry.doing ? `${name} (${entry.doing})` : name;
}

function describeOutOfSight(entry: AwarenessEntry): string {
  const when = formatMinutesAgo(entry.minutesAgo);
  if (entry.via === "saw") {
    const doing = entry.doing ? ` ${entry.doing}` : "";
    return `${entry.name}, seen ${when}${doing} (${entry.place})`;
  }
  const muffled = entry.via === "heard_muffled" ? "muffled, " : "";
  const isVoice = !entry.doing || entry.doing === "talking";
  const source = isVoice ? `${entry.name}'s voice` : `${entry.name} ${entry.doing}`;
  return `${source}, heard ${muffled}${when} from ${entry.place}`;
}

function sentence(label: string, parts: string[], separator = ", "): string | null {
  return parts.length > 0 ? `${label}: ${parts.join(separator)}.` : null;
}

/** One line per distance section, nearest first, each listing what is in it nearest first. */
function describeDistanceSections(thingsInSight: ThingInSight[]): (string | null)[] {
  const sorted = [...thingsInSight].sort(
    (first, second) =>
      (first.distanceTiles ?? Number.POSITIVE_INFINITY) -
      (second.distanceTiles ?? Number.POSITIVE_INFINITY),
  );
  return DISTANCE_BANDS.map((band) =>
    sentence(
      config.perception.distanceTitles[band],
      sorted
        .filter((thing) => findDistanceBand(thing.distanceTiles) === band)
        .map((thing) => thing.text),
      "; ",
    ),
  );
}

/**
 * The brief's "Around you" lines: everyone and every creature in sight, sorted into sections by how
 * far off they are, who could hear a whisper, and who was perceived recently but is now out of
 * sight. Entries past the prompt window are left out.
 */
export function describeAroundYou(aroundYou: AroundYou): string {
  const recentEntries = aroundYou.entries
    .filter((entry) => entry.minutesAgo <= config.perception.awarenessPromptWindowMinutes)
    .sort((first, second) => first.minutesAgo - second.minutesAgo);
  const normalHearers = new Set(aroundYou.normalHearerIds);
  const inSight = recentEntries.filter((entry) => entry.isInSight);
  const outOfSight = recentEntries.filter((entry) => !entry.isInSight);
  const thingsInSight: ThingInSight[] = [
    ...inSight.map((entry) => ({
      distanceTiles: entry.distanceTiles,
      text: describeInSight(entry, entry.isDead || normalHearers.has(entry.agentId)),
    })),
    ...aroundYou.creatures.map((creature) => ({
      distanceTiles: creature.distanceTiles,
      text: creature.name,
    })),
  ];
  const lines = [
    ...describeDistanceSections(thingsInSight),
    sentence(
      "Within whisper reach",
      inSight
        .filter((entry) => !entry.isDead && aroundYou.whisperHearerIds.includes(entry.agentId))
        .map((entry) => entry.name),
    ),
    sentence(
      "Recently around, now out of sight",
      outOfSight.filter((entry) => entry.via === "saw").map(describeOutOfSight),
    ),
    ...outOfSight
      .filter((entry) => entry.via !== "saw")
      .map((entry) => `${describeOutOfSight(entry)}.`),
  ];
  const presentLines = lines.filter((line): line is string => line !== null);
  return presentLines.length > 0 ? presentLines.join("\n") : "No one else is around.";
}

function describeLastPerceived(entry: AwarenessEntry): string {
  const when = formatMinutesAgo(entry.minutesAgo);
  const where = describePlace(entry.place);
  if (entry.via === "saw") {
    return entry.doing ? `seen ${when} at ${where}, ${entry.doing}` : `seen ${when} at ${where}`;
  }
  const muffled = entry.via === "heard_muffled" ? "muffled, " : "";
  return `heard ${muffled}${when} from ${where}`;
}

/**
 * Everyone the agent has perceived, but not within `perception.awarenessPromptWindowMinutes`, with
 * how long ago and where: "- Cobb: seen 9 h ago at the quarry, mining". Empty when there is no one.
 */
export function describeNotSeenLately(aroundYou: AroundYou): string {
  const window = config.perception.awarenessPromptWindowMinutes;
  const lines = aroundYou.entries
    .filter((entry) => !entry.isInSight && entry.minutesAgo > window)
    .sort((first, second) => first.minutesAgo - second.minutesAgo)
    .map((entry) => `- ${entry.name}: ${describeLastPerceived(entry)}`);
  if (lines.length === 0) return "";
  return `## ${config.perception.notSeenLatelyTitle}\n${lines.join("\n")}`;
}
