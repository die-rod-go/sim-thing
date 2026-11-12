import type { Agent, Memory } from "@village/shared";
import { config } from "../config";
import { describeGoals, describePlans } from "../decision/sections";
import { describeStats, describeStatus, describeTraits } from "../decision/words";
import type { StructuredCaller, StructuredCallResult } from "../llm/call-structured";
import { renderTemplate } from "../llm/templates";
import type { NamedPerson } from "../memory/dossiers";
import { describeDossiers, describeReflections } from "./prompt-sections";
import { listAimTexts, listReflectionDossiers } from "./reflection-dossiers";
import { buildMorningReplySchema, type MorningReply } from "./reply-schemas";

const MORNING_TEMPLATE = "morning";

export interface MorningPassInput {
  agent: Agent;
  /** The agent's health, which the status line puts in words. */
  health: number;
  conditionWords?: readonly string[];
  /** Last night's summary, mood entry and insights; see `selectLatestNightReflections`. */
  recentReflections: readonly Memory[];
  /** Every agent except this one; the dossiers of those named in goals or plans are shown. */
  otherAgents: readonly NamedPerson[];
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
    plans: describePlans(agent.plans),
    dossiers: describeDossiers(
      listReflectionDossiers({
        agent,
        others: input.otherAgents,
        memories: [],
        mentioningTexts: listAimTexts(agent),
        limit: config.reflection.dossiersShown,
      }),
      "No one in particular.",
    ),
    maxPlans: String(config.plans.maxPlans),
    maxSteps: String(config.plans.maxSteps),
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

/** Writes the agent's `dailyPlan`, plans (if given) and mood (if given). Returns the agent unchanged if the call failed. */
export function applyMorningReply(agent: Agent, result: StructuredCallResult<MorningReply>): Agent {
  if (!result.ok) return agent;
  const { dailyPlan, plans, mood } = result.value;
  return { ...agent, dailyPlan, plans: plans ?? agent.plans, mood: mood ?? agent.mood };
}

export async function runMorningPass(input: MorningPassInput): Promise<Agent> {
  return applyMorningReply(input.agent, await requestMorningReply(input));
}
