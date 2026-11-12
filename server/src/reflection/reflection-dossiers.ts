import type { Agent, Memory } from "@village/shared";
import { config } from "../config";
import type { DossierEntry, NamedPerson } from "../memory/dossiers";
import { describePlanText } from "../memory/plans";
import { extractTags, normalizeTag } from "../memory/tags";
import { findPeopleInteractedWith } from "./reflection-memories";

/** Goals, plans and the intention: where the agent's own aims name people. */
export function listAimTexts(agent: Agent): string[] {
  return [
    agent.intention,
    agent.dailyPlan,
    ...agent.goals.map((goal) => goal.text),
    ...describePlanText(agent.plans),
  ];
}

export interface ReflectionDossierSources {
  agent: Agent;
  /** Every agent except this one. */
  others: readonly NamedPerson[];
  /** People met in these memories come first; a person with no entry gets the reflection placeholder. */
  memories: readonly Memory[];
  /** Searched for names; a person only named is shown when the agent has an entry for them. */
  mentioningTexts: readonly string[];
  limit: number;
}

/** The dossiers a reflection prompt shows: people in the memories, then people named in the aims. */
export function listReflectionDossiers(sources: ReflectionDossierSources): DossierEntry[] {
  const { agent, others } = sources;
  const metNames = new Set(
    findPeopleInteractedWith(
      sources.memories,
      others.map((person) => person.name),
    ),
  );
  const namedTags = new Set(
    extractTags(
      sources.mentioningTexts.join("\n"),
      others.map((person) => person.name),
    ),
  );
  const met = others.filter((person) => metNames.has(person.name));
  const named = others.filter(
    (person) =>
      !metNames.has(person.name) &&
      namedTags.has(normalizeTag(person.name)) &&
      agent.dossiers[person.id] !== undefined,
  );
  return [...met, ...named].slice(0, sources.limit).map((person) => ({
    person: person.name,
    text: agent.dossiers[person.id]?.text ?? config.dossier.reflectionUnknownPersonText,
  }));
}
