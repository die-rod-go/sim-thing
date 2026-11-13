import { config } from "../config";
import { describeBodyName } from "../status/health";
import type { AroundYou, AwarenessEntry } from "./context";

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

/** "next to you", "a few steps away", "farther off": how far off someone in sight is. */
export function describeDistance(distanceTiles: number): string {
  const words = config.perception.distanceWords;
  if (distanceTiles <= config.economy.giveReachTiles) return words.inReach;
  return distanceTiles <= config.perception.nearTiles ? words.near : words.far;
}

/**
 * "Tobias, next to you, looks hurt, carrying a knife (chopping wood)", or "Mara's body, a few
 * steps away" for someone lying dead in sight ("Mara's body, next to you, on fire").
 */
function describeInSight(entry: AwarenessEntry): string {
  const distance = entry.distanceTiles === null ? null : describeDistance(entry.distanceTiles);
  if (entry.isDead) {
    return [describeBodyName(entry.name), distance, ...entry.visibleConditions]
      .filter(Boolean)
      .join(", ");
  }
  const carrying =
    entry.visibleCarried.length > 0 ? `carrying ${entry.visibleCarried.join(" and ")}` : null;
  const name = [entry.name, distance, entry.healthAsSeen, ...entry.visibleConditions, carrying]
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

function sentence(label: string, parts: string[]): string | null {
  return parts.length > 0 ? `${label}: ${parts.join(", ")}.` : null;
}

/**
 * The brief's "Around you" lines: who would obviously hear you, who could hear a whisper, and who
 * was perceived recently but is now out of sight. Entries past the prompt window are left out.
 */
export function describeAroundYou(aroundYou: AroundYou): string {
  const recentEntries = aroundYou.entries
    .filter((entry) => entry.minutesAgo <= config.perception.awarenessPromptWindowMinutes)
    .sort((first, second) => first.minutesAgo - second.minutesAgo);
  const normalHearers = new Set(aroundYou.normalHearerIds);
  const inSight = recentEntries.filter((entry) => entry.isInSight && !entry.isDead);
  const bodiesInSight = recentEntries.filter((entry) => entry.isInSight && entry.isDead);
  const outOfSight = recentEntries.filter((entry) => !entry.isInSight);
  const lines = [
    sentence(
      "In sight, would hear you",
      inSight.filter((entry) => normalHearers.has(entry.agentId)).map(describeInSight),
    ),
    sentence(
      "In sight, too far to hear you",
      inSight.filter((entry) => !normalHearers.has(entry.agentId)).map(describeInSight),
    ),
    sentence(
      "Within whisper reach",
      inSight
        .filter((entry) => aroundYou.whisperHearerIds.includes(entry.agentId))
        .map((entry) => entry.name),
    ),
    sentence("Also in sight", bodiesInSight.map(describeInSight)),
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
