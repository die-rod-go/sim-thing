import { formatDuration, formatSimTime } from "@village/shared";
import { config } from "../config";
import { listUnpricedModels, summarizeCostsByKind } from "./costs";
import {
  measureDeathNotice,
  summarizeFailures,
  summarizeMergedRepeats,
  type DeathNotice,
} from "./deaths";
import {
  measureMeanPromptChars,
  summarizeAgents,
  summarizeDays,
  summarizePromptSections,
  summarizeReasons,
} from "./decisions";
import type { SaveRecords } from "./records";
import { measureConversations, measureNearRepeats, measurePassedOn } from "./speech";

type Cell = string | number;

function formatCell(cell: Cell): string {
  return typeof cell === "number" ? formatNumber(cell) : cell.replace(/\|/g, "\\|");
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function formatDollars(dollars: number): string {
  return `$${dollars.toFixed(dollars < 1 ? 3 : 2)}`;
}

function formatTable(headers: readonly string[], rows: readonly Cell[][]): string {
  const lines = [headers, headers.map(() => "---"), ...rows.map((row) => row.map(formatCell))];
  return lines.map((line) => `| ${line.join(" | ")} |`).join("\n");
}

function formatSection(title: string, body: string): string {
  return `## ${title}\n\n${body}`;
}

function describeDays(records: SaveRecords): string {
  const rows = summarizeDays(records).map((day) => [
    day.day,
    day.hours,
    day.agentCount,
    day.decisions,
    day.decisionsPerAgentHour,
    formatShare(day.continue),
    formatShare(day.wait),
    formatShare(day.act),
    day.passCallsPerAgent,
    day.tokens,
    formatDollars(day.dollars),
  ]);
  return formatTable(
    ["Day", "Hours", "Agents", "Decisions", "Per agent-hour", "Continue", "Wait", "Act"].concat([
      "Passes per agent",
      "Tokens",
      "Spend",
    ]),
    rows,
  );
}

function describeAgents(records: SaveRecords): string {
  const rows = summarizeAgents(records).map((agent) => [
    agent.name,
    agent.hoursAlive,
    agent.decisions,
    agent.decisionsPerHour,
    formatShare(agent.continue),
    formatShare(agent.wait),
    formatShare(agent.act),
    agent.passCalls,
    formatDollars(agent.dollars),
  ]);
  return formatTable(
    ["Agent", "Hours alive", "Decisions", "Per hour", "Continue", "Wait", "Act", "Passes", "Spend"],
    rows,
  );
}

function describeReasons(records: SaveRecords): string {
  const rows = summarizeReasons(records).map((row) => [
    row.reason,
    row.count,
    formatShare(row.share),
    row.midActionCount,
    row.continueCount,
  ]);
  return formatTable(["Reason", "Decisions", "Share", "Mid-action", "Answered continue"], rows);
}

function describeCosts(records: SaveRecords): string {
  const rows = summarizeCostsByKind(records.calls).map((row) => [
    row.kind,
    row.calls,
    row.uncachedTokens,
    row.cacheReadTokens,
    row.cacheWriteTokens,
    row.completionTokens,
    formatDollars(row.dollars),
    formatDollars(row.dollars / Math.max(1, row.calls)),
  ]);
  const unpriced = listUnpricedModels(records.calls);
  const note = unpriced.length === 0 ? "" : `\n\nNo price for: ${unpriced.join(", ")}.`;
  return (
    formatTable(
      ["Kind", "Calls", "Uncached in", "Cache read", "Cache write", "Out", "Spend", "Per call"],
      rows,
    ) + note
  );
}

function describeSections(records: SaveRecords): string {
  const rows = summarizePromptSections(records.decisions).map((row) => [
    row.title,
    row.meanChars,
    formatShare(row.share),
  ]);
  const mean = measureMeanPromptChars(records.decisions);
  const tokens = mean / config.decision.charsPerToken;
  return `Mean decision prompt: ${formatNumber(mean)} characters, about ${formatNumber(tokens)} tokens.\n\n${formatTable(["Section", "Mean characters", "Share"], rows)}`;
}

function describeTalk(records: SaveRecords): string {
  const repeats = measureNearRepeats(records.speech);
  const conversations = measureConversations(records.speech);
  const passed = measurePassedOn(records.streamLines, records.speech);
  return [
    `- Near-repeat speech: ${repeats.nearRepeats} of ${repeats.lines} lines (${formatShare(repeats.rate)}).`,
    `- Conversations: ${conversations.count}; lines per conversation: mean ${formatNumber(conversations.meanLines)}, median ${conversations.medianLines}, longest ${conversations.longestLines}.`,
    `- Overheard lines the hearer later passed on: ${passed.passedOn} of ${passed.overheard}.`,
  ].join("\n");
}

function describeFailures(records: SaveRecords): string {
  const rows = summarizeFailures(records).map((row) => [row.reason, row.count]);
  return `${records.failures.length} failed acts.\n\n${formatTable(["Reason", "Count"], rows)}`;
}

function describeMergedRepeats(records: SaveRecords): string {
  const summary = summarizeMergedRepeats(records);
  if (summary.merged === 0) return "None.";
  const names = records.agentNames;
  const rows = summary.largest.map((line) => [
    names[line.agentId] ?? line.agentId,
    line.count,
    line.text,
  ]);
  return `${summary.merged} merged entries; the largest counts ${summary.largestCount}.\n\n${formatTable(["Agent", "Times", "Entry"], rows)}`;
}

function describeDelay(fromTick: number | null, toTick: number | null): string {
  if (fromTick === null || toTick === null) return "never";
  return formatDuration((toTick - fromTick) * config.clock.minutesPerTick);
}

function describeDeathRow(notice: DeathNotice): Cell[] {
  return [
    notice.name,
    formatSimTime(notice.diedAtTick, config.clock),
    notice.finderName ?? "nobody",
    describeDelay(notice.diedAtTick, notice.firstSeenTick),
    describeDelay(notice.firstSeenTick, notice.firstMentionByOthersTick),
    describeDelay(notice.firstSeenTick, notice.firstMentionByFinderTick),
  ];
}

function describeDeaths(records: SaveRecords): string {
  const notices = measureDeathNotice(records);
  if (notices.length === 0) return "None.";
  return formatTable(
    [
      "Who",
      "Died",
      "First seen by",
      "Seen after",
      "Named by others after",
      "Named by the finder after",
    ],
    notices.map(describeDeathRow),
  );
}

/** The whole measurement of a saved run, as Markdown. */
export function buildReport(records: SaveRecords, savePath: string): string {
  const calls = summarizeCostsByKind(records.calls);
  const spend = calls.reduce((sum, row) => sum + row.dollars, 0);
  const span = `${formatSimTime(0, config.clock)} to ${formatSimTime(records.lastTick, config.clock)}`;
  const overview = [
    `- Save: ${savePath}`,
    `- Sim time: ${span}, ${Object.keys(records.agentNames).length} agents.`,
    `- ${records.decisions.length} decisions answered, ${records.calls.length} call attempts in all, about ${formatDollars(spend)} at list price.`,
  ].join("\n");
  return (
    [
      "# Run measurement",
      overview,
      formatSection("Per sim-day", describeDays(records)),
      formatSection("Per agent", describeAgents(records)),
      formatSection("Why decisions were asked", describeReasons(records)),
      formatSection("Cost by call kind", describeCosts(records)),
      formatSection("Decision prompt by section", describeSections(records)),
      formatSection("Talk", describeTalk(records)),
      formatSection("Failed acts", describeFailures(records)),
      formatSection("Merged repeats", describeMergedRepeats(records)),
      formatSection("Deaths", describeDeaths(records)),
    ].join("\n\n") + "\n"
  );
}
