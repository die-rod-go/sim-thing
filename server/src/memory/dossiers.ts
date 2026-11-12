import type { Dossier } from "@village/shared";
import { z } from "zod";
import { config } from "../config";
import { resolveName } from "../decision/resolve-name";
import { strictJsonObject, writtenText } from "../decision/schema-fields";
import type { JsonSchema } from "../llm/types";

export interface DossierEntry {
  person: string;
  text: string;
}

export interface NamedPerson {
  id: string;
  name: string;
}

/** A rewritten entry well over `maxChars` is rejected and retried, never cut. */
export function dossierEntriesSchema() {
  return z
    .array(
      z.object({
        person: z.string().trim().min(1),
        text: writtenText(config.dossier.maxChars).min(1),
      }),
    )
    .optional()
    .transform((entries): DossierEntry[] => entries ?? []);
}

export function dossierEntriesJsonSchema(): JsonSchema {
  return {
    type: "array",
    items: strictJsonObject({ person: { type: "string" }, text: { type: "string" } }),
  };
}

/** The agent's dossiers with each entry that names a known person rewritten; unknown names are dropped. */
export function rewriteDossiers(
  dossiers: Readonly<Record<string, Dossier>>,
  entries: readonly DossierEntry[],
  people: readonly NamedPerson[],
  tick: number,
): Record<string, Dossier> {
  const rewritten = { ...dossiers };
  for (const entry of entries) {
    const personId = resolveName(entry.person, people);
    if (personId !== null) rewritten[personId] = { text: entry.text, updatedTick: tick };
  }
  return rewritten;
}
