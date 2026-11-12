import type { Agent, Memory } from "@village/shared";
import { describeGoals } from "../decision/sections";
import { describeStats, describeStatus, describeTraits } from "../decision/words";
import type { StructuredCaller, StructuredCallResult } from "../llm/call-structured";
import { renderTemplate } from "../llm/templates";
import { describeReflections } from "./prompt-sections";
import { buildMorningReplySchema, type MorningReply } from "./reply-schemas";

const MORNING_TEMPLATE = "morning";

export interface MorningPassInput {
  agent: Agent;
  /** Words for the agent's conditions, shown with its status. */
  /** The agent's health, which the status line puts in words. */
  health: number;
  conditionWords?: readonly string[];
  /** Last night's summary, mood entry and insights; see `selectLatestNightReflections`. */
  recentReflections: readonly Memory[];
  callStructured: StructuredCaller;
  tick: number;
  /** The sim time as shown to the agent, e.g. from `formatSimTime`. */
  timeText: string;
}

export function buildMorningPrompt(input: MorningPassInput): string {
  const { agent } = input;
  return renderTemplate(MORNING_TEMPLATE, {
    name: agent.name,
    profession: agent.profession,
    traits: describeTraits(agent.personality.traits),
    core: agent.personality.core,
    selfImage: agent.personality.selfImage,
    mood: agent.mood,
    body: describeStats(agent.body),
    status: describeStatus({ health: input.health, needs: agent.needs }, input.conditionWords),
    goals: describeGoals(agent.goals),
    reflections: describeReflections(input.recentReflections, "Nothing in particular."),
    simTime: input.timeText,
  });
}

export function requestMorningReply(
  input: MorningPassInput,
): Promise<StructuredCallResult<MorningReply>> {
  return input.callStructured({
    kind: "morning",
    agentId: input.agent.id,
    tick: input.tick,
    prompt: buildMorningPrompt(input),
    ...buildMorningReplySchema(),
  });
}

/** Writes the agent's `dailyPlan` (and mood, if given). Returns the agent unchanged if the call failed. */
export function applyMorningReply(agent: Agent, result: StructuredCallResult<MorningReply>): Agent {
  if (!result.ok) return agent;
  const { dailyPlan, mood } = result.value;
  return { ...agent, dailyPlan, mood: mood ?? agent.mood };
}

export async function runMorningPass(input: MorningPassInput): Promise<Agent> {
  return applyMorningReply(input.agent, await requestMorningReply(input));
}
