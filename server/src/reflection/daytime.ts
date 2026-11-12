import { formatSimTime } from "@village/shared";
import type { Agent, Memory } from "@village/shared";
import { config } from "../config";
import { describeGoals } from "../decision/sections";
import { describeStats, describeStatus, describeTraits } from "../decision/words";
import type { StructuredCaller, StructuredCallResult } from "../llm/call-structured";
import { renderTemplate } from "../llm/templates";
import type { MemoryIdGenerator, MemoryStore } from "../memory/memory-store";
import { describeReflections, describeTimedMemories } from "./prompt-sections";
import {
  createReflectionMemory,
  INSIGHT_TAG,
  selectMemoriesSince,
  selectTaggedReflections,
} from "./reflection-memories";
import { buildDaytimeReplySchema, type DaytimeReply } from "./reply-schemas";

const DAYTIME_TEMPLATE = "daytime";

export interface DaytimePassInput {
  agent: Agent;
  /** Words for the agent's conditions, shown with its status. */
  /** The agent's health, which the status line puts in words. */
  health: number;
  conditionWords?: readonly string[];
  store: MemoryStore;
  idGenerator: MemoryIdGenerator;
  callStructured: StructuredCaller;
  tick: number;
  /** Memories filed after this tick are what the agent thinks over. */
  sinceTick: number;
  /** Agent, object and place names, used to tag the new memories. */
  knownNames: readonly string[];
}

export interface DaytimePassResult {
  agent: Agent;
  /** Already added to the store. */
  addedMemories: Memory[];
  /** The insights in the agent's words, for its working memory. */
  insights: string[];
}

export function buildDaytimePrompt(
  input: DaytimePassInput,
  recentMemories: readonly Memory[],
): string {
  const { agent } = input;
  const earlierThoughts = selectTaggedReflections(
    input.store,
    agent.id,
    INSIGHT_TAG,
    config.reflection.daytimeEarlierInsightsShown,
  );
  return renderTemplate(DAYTIME_TEMPLATE, {
    name: agent.name,
    profession: agent.profession,
    traits: describeTraits(agent.personality.traits),
    core: agent.personality.core,
    selfImage: agent.personality.selfImage,
    mood: agent.mood,
    body: describeStats(agent.body),
    status: describeStatus({ health: input.health, needs: agent.needs }, input.conditionWords),
    goals: describeGoals(agent.goals),
    dailyPlan: agent.dailyPlan || "none",
    intention: agent.intention || "nothing in particular",
    earlierThoughts: describeReflections(earlierThoughts, "Nothing in particular."),
    recentMemories: describeTimedMemories(recentMemories, "Nothing stands out."),
    simTime: formatSimTime(input.tick, config.clock),
    maxInsights: String(config.reflection.maxInsights),
    maxChars: String(config.memory.maxMemoryChars),
  });
}

/** Resolves to null without calling the LLM when nothing new was filed since `sinceTick`. */
export async function requestDaytimeReply(
  input: DaytimePassInput,
): Promise<StructuredCallResult<DaytimeReply> | null> {
  const recentMemories = selectMemoriesSince(input.store, input.agent.id, input.sinceTick);
  if (recentMemories.length === 0) return null;
  return input.callStructured({
    kind: "daytime",
    agentId: input.agent.id,
    tick: input.tick,
    prompt: buildDaytimePrompt(input, recentMemories),
    ...buildDaytimeReplySchema(),
  });
}

/** Files the reply's insights into `reflections` (and maybe a new mood); unchanged when there is none. */
export function applyDaytimeReply(
  input: DaytimePassInput,
  result: StructuredCallResult<DaytimeReply> | null,
): DaytimePassResult {
  const { agent } = input;
  const unchanged: DaytimePassResult = { agent, addedMemories: [], insights: [] };
  if (result === null || !result.ok) return unchanged;
  const insights = result.value.insights.map((insight) => insight.text);
  const addedMemories = insights.map((text) =>
    createReflectionMemory(
      {
        agentId: agent.id,
        text,
        kindTag: INSIGHT_TAG,
        strength: config.memory.reflectionInsightStrength,
      },
      input.tick,
      input.idGenerator,
      input.knownNames,
    ),
  );
  input.store.addAll(addedMemories);
  return { agent: { ...agent, mood: result.value.mood ?? agent.mood }, addedMemories, insights };
}

/** The daytime pass: the agent thinks over what happened since its last reflection. */
export async function runDaytimePass(input: DaytimePassInput): Promise<DaytimePassResult> {
  return applyDaytimeReply(input, await requestDaytimeReply(input));
}
