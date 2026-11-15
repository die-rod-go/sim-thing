import type { LlmCallKind, Summary, SummaryLevel } from "@village/shared";
import { z } from "zod";
import { config } from "../config";
import type { ReplySchemas } from "../decision/reply-schema";
import { strictJsonObject, writtenText } from "../decision/schema-fields";
import { renderTemplate } from "../llm/templates";
import { describeStreamEntry, describeSummary } from "./stream";
import type { SummaryJob } from "./summaries";

export interface SummaryReply {
  summary: string;
}

interface LevelSettings {
  callKind: LlmCallKind;
  templateName: string;
  maxChars: number;
}

const LEVEL_SETTINGS: Record<SummaryLevel, LevelSettings> = {
  episode: {
    callKind: "episode",
    templateName: "episode",
    maxChars: config.memory.episodeMaxChars,
  },
  chronicle: {
    callKind: "chronicle",
    templateName: "chronicle",
    maxChars: config.memory.chronicleMaxChars,
  },
  daySummary: {
    callKind: "day_summary",
    templateName: "day-summary",
    maxChars: config.memory.daySummaryMaxChars,
  },
  history: {
    callKind: "history",
    templateName: "history",
    maxChars: config.memory.historyMaxChars,
  },
};

/** The schema names of the four summary replies, for telling them from other calls. */
export const SUMMARY_SCHEMA_NAMES: readonly string[] = Object.values(LEVEL_SETTINGS).map(
  (settings) => `${settings.callKind}_reply`,
);

export function findSummaryCallKind(level: SummaryLevel): LlmCallKind {
  return LEVEL_SETTINGS[level].callKind;
}

function bulletList(lines: readonly string[]): string {
  return lines.map((line) => `- ${line}`).join("\n");
}

function describeSummaries(summaries: readonly Summary[]): string {
  return summaries.length > 0
    ? bulletList(summaries.map(describeSummary))
    : config.memory.noEarlierText;
}

interface PromptParts {
  material: string;
  /** Absent for a level whose template shows nothing from before. */
  earlier?: string;
}

function describeJob(job: SummaryJob): PromptParts {
  switch (job.level) {
    case "episode":
      return {
        material: bulletList(job.entries.map(describeStreamEntry)),
        earlier: describeSummaries(job.earlier),
      };
    case "chronicle":
      return {
        material: describeSummaries(job.episodes),
        earlier: describeSummaries(job.earlier),
      };
    case "daySummary":
      return { material: describeSummaries(job.chronicles) };
    case "history":
      return {
        material: describeSummary(job.daySummary),
        earlier: describeSummaries(job.history === null ? [] : [job.history]),
      };
  }
}

export function buildSummaryPrompt(
  agentName: string,
  job: SummaryJob,
  promptsDirectory?: string,
): string {
  const settings = LEVEL_SETTINGS[job.level];
  return renderTemplate(
    settings.templateName,
    { name: agentName, ...describeJob(job), maxChars: String(settings.maxChars) },
    promptsDirectory,
  );
}

/** One `summary` field, held to the level's length limit with the usual slack. */
export function buildSummaryReplySchema(level: SummaryLevel): ReplySchemas<SummaryReply> {
  const settings = LEVEL_SETTINGS[level];
  return {
    schema: z.object({ summary: writtenText(settings.maxChars).min(1) }),
    jsonSchema: strictJsonObject({ summary: { type: "string" } }),
    schemaName: `${settings.callKind}_reply`,
  };
}
