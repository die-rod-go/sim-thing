import type { Dossier } from "@village/shared";
import { config } from "../config";
import { extractTags, normalizeTag } from "../memory/tags";
import type { NamedPerson } from "../memory/dossiers";
import type { PersonOnMind } from "./context";
import { resolveName } from "./resolve-name";

export interface PeopleOnMindInput {
  /** Every agent except the one deciding. */
  others: readonly NamedPerson[];
  dossiers: Readonly<Record<string, Dossier>>;
  /** Ids of the agents in sight now, in the order to list them. */
  inSightIds: readonly string[];
  /** Speaker names of the current conversation, oldest first; the agent's own lines are left out. */
  speakerNames: readonly string[];
  /** Intention, daily plan, goals and the conversation's words, searched for names. */
  mentioningTexts: readonly string[];
}

/**
 * The people whose dossiers the decision shows: agents in sight, then speakers in the current
 * conversation, then people named in the agent's own plans or the conversation. A person in the
 * first two groups with no dossier gets a placeholder; one only named is left out. Capped.
 */
export function listPeopleOnMind(input: PeopleOnMindInput): PersonOnMind[] {
  const { others, dossiers } = input;
  const presentIds = [
    ...input.inSightIds,
    ...input.speakerNames.flatMap((name) => resolveName(name, others) ?? []),
  ];
  const namedTags = new Set(
    extractTags(
      input.mentioningTexts.join("\n"),
      others.map((person) => person.name),
    ),
  );
  const namedIds = others
    .filter((person) => namedTags.has(normalizeTag(person.name)))
    .map((person) => person.id);
  const chosen: PersonOnMind[] = [];
  const seen = new Set<string>();
  const consider = (personId: string, isPresent: boolean) => {
    const person = others.find((candidate) => candidate.id === personId);
    if (person === undefined || seen.has(personId)) return;
    const dossier = dossiers[personId];
    if (dossier === undefined && !isPresent) return;
    seen.add(personId);
    chosen.push({ name: person.name, text: dossier?.text ?? config.dossier.unknownPersonText });
  };
  for (const personId of presentIds) consider(personId, true);
  for (const personId of namedIds) consider(personId, false);
  return chosen.slice(0, config.dossier.shownInDecision);
}
