import type { Agent, AgentMemory, KeyMemory } from "@village/shared";
import { replaceAgenda } from "../agenda/agenda";
import type { NamedCandidate } from "../decision/resolve-name";
import { markReflected } from "../memory/reflection-progress";
import {
  applyIdentityChanges,
  applyPeopleChanges,
  type PersonalityChangeDraft,
} from "./apply-pass";
import type { ReflectionReply } from "./reflection";

/** What the agent was when its reflection was asked for, which the reply was written against. */
export interface ReflectionAsked {
  agendaRevision: number;
  candidates: readonly KeyMemory[];
}

export interface ReflectionResult {
  agent: Agent;
  memory: AgentMemory;
  /** One per changed trait, profession, core or self-image, for `personality_history`. */
  personalityChanges: PersonalityChangeDraft[];
}

function isSameKeyMemory(first: KeyMemory, second: KeyMemory): boolean {
  return first.day === second.day && first.text === second.text;
}

/**
 * A reflection applied to the agent and its memory as they are now: only what it rewrote changes.
 * The candidates it was shown are decided (kept as key memories or let go); ones marked since
 * wait for the next. Its agenda is used only if nothing changed the agenda while it ran, since it
 * was written against the old one.
 */
export function applyReflection(
  agent: Agent,
  memory: AgentMemory,
  reply: ReflectionReply,
  asked: ReflectionAsked,
  others: readonly NamedCandidate[],
  tick: number,
): ReflectionResult {
  const withPeople = applyPeopleChanges(agent, reply.people, others);
  const withGoals =
    reply.longTermGoals === null
      ? withPeople
      : { ...withPeople, longTermGoals: reply.longTermGoals.map((goal) => ({ ...goal })) };
  const identity = applyIdentityChanges(withGoals, reply, tick);
  const isAgendaCurrent = agent.agendaRevision === asked.agendaRevision;
  const updated =
    reply.agenda !== null && isAgendaCurrent
      ? replaceAgenda(identity.agent, reply.agenda)
      : identity.agent;
  const keyMemoryCandidates = memory.keyMemoryCandidates.filter(
    (candidate) => !asked.candidates.some((shown) => isSameKeyMemory(shown, candidate)),
  );
  const keyMemories = reply.keyMemories ?? memory.keyMemories;
  return {
    agent: updated,
    memory: markReflected({ ...memory, keyMemories, keyMemoryCandidates }, tick),
    personalityChanges: identity.changes,
  };
}
