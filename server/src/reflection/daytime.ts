import { formatSimTime } from "@village/shared";
import type { Agent, Memory } from "@village/shared";
import { config } from "../config";
import { describeGoals } from "../decision/sections";
import { describeStats, describeStatus, describeTraits } from "../decision/words";
import type { StructuredCaller } from "../llm/call-structured";
import { renderTemplate } from "../llm/templates";
import type { MemoryIdGenerator, MemoryStore } from "../memory/memory-store";
import { describeReflections, describeTimedMemories } from "./prompt-sections";
import {
  createReflectionMemory,
  INSIGHT_TAG,
  selectMemoriesSince,
  selectTaggedReflections,
} from "./reflection-memories";
import { buildDaytimeReplySchema } from "./reply-schemas";

const DAYTIME_TEMPLATE = "daytime";

export interface DaytimePassInput {
  agent: Agent;
  /** Words for the agent's conditions ("bleeding"), shown with its status. */
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
    status: describeStatus(agent, input.conditionWords),
    goals: describeGoals(agent.goals),
    dailyPlan: agent.dailyPlan || "none",
    intention: agent.intention || "nothing in particular",
    earlierThoughts: describeReflections(earlierThoughts, "Nothing in particular."),
    recentMemories: describeTimedMemories(recentMemories, "Nothing stands out."),
    simTime: formatSimTime(input.tick, config.clock),
    maxInsights: String(config.reflection.maxInsights),
  });
}

/**
 * The daytime pass: the agent thinks over what happened since its last reflection, writing insights
 * into `reflections` (and maybe a new mood). Skips the LLM call when nothing new was filed.
 */
export async function runDaytimePass(input: DaytimePassInput): Promise<DaytimePassResult> {
  const { agent } = input;
  const unchanged: DaytimePassResult = { agent, addedMemories: [], insights: [] };
  const recentMemories = selectMemoriesSince(input.store, agent.id, input.sinceTick);
  if (recentMemories.length === 0) return unchanged;
  const result = await input.callStructured({
    kind: "daytime",
    agentId: agent.id,
    tick: input.tick,
    prompt: buildDaytimePrompt(input, recentMemories),
    ...buildDaytimeReplySchema(),
  });
  if (!result.ok) return unchanged;
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
