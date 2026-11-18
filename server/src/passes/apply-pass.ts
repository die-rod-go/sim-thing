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
import type { RealityReply } from "./pass-prompts";
import type { PersonChange, TraitChange as ReflectedTraitChange } from "./reflection";

/** What a reflection may change of who the agent is; null leaves a text as it is. */
export interface IdentityChanges {
  traitChanges: readonly ReflectedTraitChange[];
  profession: string | null;
  core: string | null;
  selfImage: string | null;
  voice: string | null;
}

export type PersonalityChangeDraft = Omit<PersonalityChange, "id">;

/** The reply gives no reason for prose changes; the history shows where they came from. */
const PROSE_CHANGE_REASON = "reflection";

export const EMPTY_PERSON_ENTRY: PersonEntry = {
  whatIThinkOfThem: "",
  whatTheyThinkOfMe: "",
  whatIWantFromThem: "",
  whatTheyWantFromMe: "",
  misc: "",
};

/**
 * Rewrites the entries of the people the reply names; everyone else is untouched. A name that is
 * no one the agent has an entry for is ignored: only seeing or hearing someone makes an entry.
 */
export function applyPeopleChanges(
  agent: Agent,
  changes: readonly PersonChange[],
  others: readonly NamedCandidate[],
): Agent {
  const people = { ...agent.people };
  for (const rewritten of changes) {
    const personId = resolveName(rewritten.person, others);
    const existing = personId === null ? undefined : people[personId];
    if (personId === null || existing === undefined) continue;
    const entry = { ...existing };
    for (const field of PERSON_ENTRY_FIELDS) entry[field] = rewritten[field] ?? existing[field];
    people[personId] = entry;
  }
  return { ...agent, people };
}

/** The stream entry the reality pass's thought becomes; null when it chose to say nothing. */
export function describeRealityThought(reply: RealityReply): string | null {
  const thought = reply.thought?.trim() ?? "";
  if (thought.length === 0) return null;
  return config.realityPass.thoughtStreamText.split("{thought}").join(thought);
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
  traitChanges: readonly ReflectedTraitChange[],
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
  field: "profession" | "core" | "selfImage" | "voice",
  oldValue: string,
  newValue: string | null,
): Omit<PersonalityChangeDraft, "agentId" | "tick"> | null {
  if (newValue === null || newValue === oldValue) return null;
  return { field, oldValue, newValue, reason: PROSE_CHANGE_REASON };
}

export interface IdentityResult {
  agent: Agent;
  /** One per changed trait, profession, core or self-image, for `personality_history`. */
  changes: PersonalityChangeDraft[];
}

/** Applies the changes to `agent` as it is now; `tick` stamps the personality changes. */
export function applyIdentityChanges(
  agent: Agent,
  reply: IdentityChanges,
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
    proseChange("voice", personality.voice, reply.voice),
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
      ...personality,
      traits: traitResult.traits,
      core: reply.core ?? personality.core,
      selfImage: reply.selfImage ?? personality.selfImage,
      voice: reply.voice ?? personality.voice,
    },
  };
  return { agent: updatedAgent, changes };
}
