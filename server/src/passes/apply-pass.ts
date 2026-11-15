import {
  PERSON_ENTRY_FIELDS,
  type Agent,
  type Personality,
  type PersonalityChange,
  type PersonEntry,
  type TraitName,
} from "@village/shared";
import { config } from "../config";
import { resolveName, type NamedCandidate } from "../decision/resolve-name";
import type {
  IdentityReply,
  LongTermGoalsReply,
  PeopleReply,
  ShortTermGoalsReply,
} from "./pass-prompts";

export type PersonalityChangeDraft = Omit<PersonalityChange, "id">;

/** The reply gives no reason for prose changes; the history shows where they came from. */
const PROSE_CHANGE_REASON = "identity pass";

export const EMPTY_PERSON_ENTRY: PersonEntry = {
  whatIThinkOfThem: "",
  whatTheyThinkOfMe: "",
  whatIWantFromThem: "",
  whatTheyWantFromMe: "",
};

/**
 * Rewrites the entries of the people the reply names; everyone else is untouched. A name that is
 * no one the agent has an entry for is ignored: only seeing someone makes an entry.
 */
export function applyPeopleReply(
  agent: Agent,
  reply: PeopleReply,
  others: readonly NamedCandidate[],
): Agent {
  const people = { ...agent.people };
  for (const rewritten of reply.people) {
    const personId = resolveName(rewritten.person, others);
    const existing = personId === null ? undefined : people[personId];
    if (personId === null || existing === undefined) continue;
    const entry = { ...existing };
    for (const field of PERSON_ENTRY_FIELDS) entry[field] = rewritten[field] ?? existing[field];
    people[personId] = entry;
  }
  return { ...agent, people };
}

export function applyShortTermGoalsReply(agent: Agent, reply: ShortTermGoalsReply): Agent {
  return { ...agent, shortTermGoals: reply.goals.map((goal) => ({ ...goal })) };
}

export function applyLongTermGoalsReply(agent: Agent, reply: LongTermGoalsReply): Agent {
  return { ...agent, longTermGoals: reply.goals.map((goal) => ({ ...goal })) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTraitValue(value: number): number {
  const scale = 10 ** config.traits.traitValueDecimals;
  return Math.round(value * scale) / scale;
}

interface TraitChange {
  trait: TraitName;
  oldValue: number;
  reason: string;
}

/** Clamps each delta and the resulting value; only the first change per trait counts. */
function applyTraitChanges(
  traits: Personality["traits"],
  traitChanges: IdentityReply["traitChanges"],
): { traits: Personality["traits"]; changes: TraitChange[] } {
  const { passDeltaClamp, min, max } = config.traits;
  const newTraits = { ...traits };
  const changes: TraitChange[] = [];
  const seenTraits = new Set<TraitName>();
  for (const change of traitChanges) {
    if (seenTraits.has(change.trait)) continue;
    seenTraits.add(change.trait);
    const delta = clamp(change.delta, -passDeltaClamp, passDeltaClamp);
    const oldValue = traits[change.trait];
    const newValue = roundTraitValue(clamp(oldValue + delta, min, max));
    if (newValue === oldValue) continue;
    newTraits[change.trait] = newValue;
    changes.push({ trait: change.trait, oldValue, reason: change.reason });
  }
  return { traits: newTraits, changes };
}

function proseChange(
  field: "profession" | "core" | "selfImage",
  oldValue: string,
  newValue: string | undefined,
): Omit<PersonalityChangeDraft, "agentId" | "tick"> | null {
  if (newValue === undefined || newValue === oldValue) return null;
  return { field, oldValue, newValue, reason: PROSE_CHANGE_REASON };
}

export interface IdentityResult {
  agent: Agent;
  /** One per changed trait, profession, core or self-image, for `personality_history`. */
  changes: PersonalityChangeDraft[];
}

/** Applies the reply to `agent` as it is now; `tick` stamps the personality changes. */
export function applyIdentityReply(
  agent: Agent,
  reply: IdentityReply,
  tick: number,
): IdentityResult {
  const { personality } = agent;
  const traitResult = applyTraitChanges(personality.traits, reply.traitChanges);
  const traitChanges = traitResult.changes.map((change) => ({
    field: change.trait,
    oldValue: String(change.oldValue),
    newValue: String(traitResult.traits[change.trait]),
    reason: change.reason,
  }));
  const proseChanges = [
    proseChange("profession", agent.profession, reply.profession),
    proseChange("core", personality.core, reply.core),
    proseChange("selfImage", personality.selfImage, reply.selfImage),
  ].filter((change) => change !== null);
  const changes = [...traitChanges, ...proseChanges].map((change) => ({
    ...change,
    agentId: agent.id,
    tick,
  }));
  const updatedAgent: Agent = {
    ...agent,
    profession: reply.profession ?? agent.profession,
    personality: {
      traits: traitResult.traits,
      core: reply.core ?? personality.core,
      selfImage: reply.selfImage ?? personality.selfImage,
    },
  };
  return { agent: updatedAgent, changes };
}
