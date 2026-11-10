import { TRAIT_NAMES } from "@village/shared";
import type { Agent, Personality, PersonalityChange, TraitName } from "@village/shared";
import { config } from "../config";
import type { StructuredCaller } from "../llm/call-structured";
import { renderTemplate } from "../llm/templates";
import type { MemoryReader } from "../memory/memory-store";
import { describeGoalsWithKind, describeReflections, describeTraitValues } from "./prompt-sections";
import { DAY_SUMMARY_TAG, MOOD_ENTRY_TAG, selectTaggedReflections } from "./reflection-memories";
import { buildWeeklyReplySchema } from "./reply-schemas";
import type { WeeklyReply } from "./reply-schemas";

const WEEKLY_TEMPLATE = "weekly";
/** The reply gives no reason for prose changes; the history shows where they came from. */
const PROSE_CHANGE_REASON = "weekly reflection";

export type PersonalityChangeDraft = Omit<PersonalityChange, "id">;

export interface WeeklyPassInput {
  agent: Agent;
  store: MemoryReader;
  callStructured: StructuredCaller;
  tick: number;
}

export interface WeeklyPassResult {
  agent: Agent;
  /** One per changed trait, core or self-image; integration writes them to `personality_history`. */
  changes: PersonalityChangeDraft[];
}

export function buildWeeklyPrompt(input: WeeklyPassInput): string {
  const { agent, store } = input;
  const shownCount = config.reflection.daySummariesShownWeekly;
  const summaries = selectTaggedReflections(store, agent.id, DAY_SUMMARY_TAG, shownCount);
  const moods = selectTaggedReflections(store, agent.id, MOOD_ENTRY_TAG, shownCount);
  return renderTemplate(WEEKLY_TEMPLATE, {
    name: agent.name,
    profession: agent.profession,
    core: agent.personality.core,
    selfImage: agent.personality.selfImage,
    traits: describeTraitValues(agent.personality.traits),
    goals: describeGoalsWithKind(agent.goals),
    daySummaries: describeReflections(summaries, "No days recorded."),
    moodEntries: describeReflections(moods, "No moods recorded."),
    maxDelta: String(config.traits.weeklyDeltaClamp),
    traitNames: TRAIT_NAMES.join(", "),
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTraitValue(value: number): number {
  const scale = 10 ** config.reflection.traitValueDecimals;
  return Math.round(value * scale) / scale;
}

/** Clamps each delta and the resulting value; only the first change per trait counts. */
function applyTraitChanges(
  traits: Personality["traits"],
  traitChanges: WeeklyReply["traitChanges"],
): { traits: Personality["traits"]; changes: { trait: TraitName; old: number; reason: string }[] } {
  const { weeklyDeltaClamp, min, max } = config.traits;
  const newTraits = { ...traits };
  const changes: { trait: TraitName; old: number; reason: string }[] = [];
  const seenTraits = new Set<TraitName>();
  for (const change of traitChanges) {
    if (seenTraits.has(change.trait)) continue;
    seenTraits.add(change.trait);
    const delta = clamp(change.delta, -weeklyDeltaClamp, weeklyDeltaClamp);
    const oldValue = traits[change.trait];
    const newValue = roundTraitValue(clamp(oldValue + delta, min, max));
    if (newValue === oldValue) continue;
    newTraits[change.trait] = newValue;
    changes.push({ trait: change.trait, old: oldValue, reason: change.reason });
  }
  return { traits: newTraits, changes };
}

function proseChange(
  field: "core" | "selfImage",
  oldValue: string,
  newValue: string | undefined,
): Omit<PersonalityChangeDraft, "agentId" | "tick"> | null {
  if (newValue === undefined || newValue === oldValue) return null;
  return { field, oldValue, newValue, reason: PROSE_CHANGE_REASON };
}

/**
 * The weekly pass: small, clamped trait changes, an optional new core and self-image, and the
 * revised goal list (old goals kept if the reply has none). The agent is unchanged on failure.
 */
export async function runWeeklyPass(input: WeeklyPassInput): Promise<WeeklyPassResult> {
  const { agent } = input;
  const result = await input.callStructured({
    kind: "weekly",
    agentId: agent.id,
    tick: input.tick,
    prompt: buildWeeklyPrompt(input),
    ...buildWeeklyReplySchema(),
  });
  if (!result.ok) return { agent, changes: [] };
  const reply = result.value;
  const { personality } = agent;
  const traitResult = applyTraitChanges(personality.traits, reply.traitChanges);
  const traitChanges = traitResult.changes.map((change) => ({
    field: change.trait,
    oldValue: String(change.old),
    newValue: String(traitResult.traits[change.trait]),
    reason: change.reason,
  }));
  const proseChanges = [
    proseChange("core", personality.core, reply.core),
    proseChange("selfImage", personality.selfImage, reply.selfImage),
  ].filter((change) => change !== null);
  const changes = [...traitChanges, ...proseChanges].map((change) => ({
    ...change,
    agentId: agent.id,
    tick: input.tick,
  }));
  const updatedAgent: Agent = {
    ...agent,
    personality: {
      traits: traitResult.traits,
      core: reply.core ?? personality.core,
      selfImage: reply.selfImage ?? personality.selfImage,
    },
    goals: reply.goals.length > 0 ? reply.goals : agent.goals,
  };
  return { agent: updatedAgent, changes };
}
