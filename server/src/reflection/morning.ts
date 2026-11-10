import type { Agent, Memory } from "@village/shared";
import { describeGoals } from "../decision/sections";
import { describeNeeds, describeTraits } from "../decision/words";
import type { StructuredCaller } from "../llm/call-structured";
import { renderTemplate } from "../llm/templates";
import { describeReflections } from "./prompt-sections";
import { buildMorningReplySchema } from "./reply-schemas";

const MORNING_TEMPLATE = "morning";

export interface MorningPassInput {
  agent: Agent;
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
    needs: describeNeeds(agent.needs),
    goals: describeGoals(agent.goals),
    reflections: describeReflections(input.recentReflections, "Nothing in particular."),
    simTime: input.timeText,
  });
}

/** Writes the agent's `dailyPlan` (and mood, if given). Returns the agent unchanged if the call fails. */
export async function runMorningPass(input: MorningPassInput): Promise<Agent> {
  const { agent } = input;
  const result = await input.callStructured({
    kind: "morning",
    agentId: agent.id,
    tick: input.tick,
    prompt: buildMorningPrompt(input),
    ...buildMorningReplySchema(),
  });
  if (!result.ok) return agent;
  const { dailyPlan, mood } = result.value;
  return { ...agent, dailyPlan, mood: mood ?? agent.mood };
}
