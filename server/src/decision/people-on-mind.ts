import type { Dossier } from "@village/shared";
import { config } from "../config";
import type { PersonOnMind } from "./context";

export interface NamedPerson {
  id: string;
  name: string;
}

export interface PeopleOnMindInput {
  /** Every agent except the one deciding. */
  others: readonly NamedPerson[];
  dossiers: Readonly<Record<string, Dossier>>;
  /** Ids of the agents in sight now, in the order to list them. */
  inSightIds: readonly string[];
  /** The agent's intention and goals, searched for names. */
  mentioningTexts: readonly string[];
}

function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNamedIn(name: string, text: string): boolean {
  return new RegExp(`\\b${escapePattern(name)}\\b`, "i").test(text);
}

/**
 * The people whose dossiers the decision shows: agents in sight, then people named in the agent's
 * own intention and goals. A person in sight with no dossier gets a placeholder; one only named
 * is left out. Capped.
 */
export function listPeopleOnMind(input: PeopleOnMindInput): PersonOnMind[] {
  const { others, dossiers } = input;
  const mentioningText = input.mentioningTexts.join("\n");
  const namedIds = others
    .filter((person) => isNamedIn(person.name, mentioningText))
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
  for (const personId of input.inSightIds) consider(personId, true);
  for (const personId of namedIds) consider(personId, false);
  return chosen.slice(0, config.dossier.shownInDecision);
}
