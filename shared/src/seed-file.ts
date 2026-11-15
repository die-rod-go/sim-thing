import { z } from "zod";
import { ENTITY_ID_PREFIX } from "./items/entity";
import { STAT_NAMES, TRAIT_NAMES, type TraitName } from "./types";

const traitValueSchema = z.number();

export const seedAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  profession: z.string(),
  traits: z.object({
    extraversion: traitValueSchema,
    agreeableness: traitValueSchema,
    conscientiousness: traitValueSchema,
    neuroticism: traitValueSchema,
    openness: traitValueSchema,
  }),
  core: z.string(),
  selfImage: z.string(),
  sleepRecoveryPerHour: z.number(),
  strength: z.number(),
  agility: z.number(),
  /** Starting items by definition id, coins included ("coin": 30). */
  inventory: z.record(z.string(), z.number()),
  mood: z.string(),
  /** The long-term goals the character starts with. */
  goals: z.array(z.object({ goal: z.string(), reason: z.string(), progress: z.string() })),
  /** What the character starts out holding about people, by their name; every field is optional. */
  people: z.record(
    z.string(),
    z.object({
      whatIThinkOfThem: z.string().optional(),
      whatTheyThinkOfMe: z.string().optional(),
      whatIWantFromThem: z.string().optional(),
      whatTheyWantFromMe: z.string().optional(),
    }),
  ),
  /** Names of the map's places the character has already seen when the sim starts. */
  seenPlaces: z.array(z.string()),
});

/** The shape of `seeds/agents.json`. Value rules that need the map or config are in `findSeedFileProblems`. */
export const seedFileSchema = z.object({ agents: z.array(seedAgentSchema) });

export type SeedAgent = z.infer<typeof seedAgentSchema>;
export type SeedPersonEntry = SeedAgent["people"][string];
export type SeedFile = z.infer<typeof seedFileSchema>;

/** What a seed file is checked against; the server builds this from its map and config. */
export interface SeedRules {
  traitRange: { min: number; max: number };
  statRange: { min: number; max: number };
  sleepRecoveryRange: { min: number; max: number };
  /** Seed agent ids that have a start tile on the map. */
  agentsWithStartTiles: string[];
  /** What an inventory may hold: every definition in `items.json` but the agents' body. */
  inventoryItems: { id: string; name: string }[];
  /** The map's place names: what a character's seen places may name. */
  placeNames: string[];
}

export type SeedProblemSeverity = "error" | "warning";

export interface SeedProblem {
  severity: SeedProblemSeverity;
  /** Index into `agents`, or null for a problem with the file as a whole. */
  agentIndex: number | null;
  field: string;
  message: string;
}

const SEED_AGENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Turns a display name into a seed id: "Old Tom" → "old-tom". */
export function slugifyAgentName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isWithin(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max;
}

function findIdentityProblems(agent: SeedAgent, agentIndex: number): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const addError = (field: string, message: string) =>
    problems.push({ severity: "error", agentIndex, field, message });
  if (agent.name.trim() === "") addError("name", "Needs a name.");
  if (!SEED_AGENT_ID_PATTERN.test(agent.id)) {
    addError("id", 'Id must be lowercase letters, digits and single dashes, like "old-tom".');
  }
  if (agent.id.startsWith(ENTITY_ID_PREFIX)) {
    addError("id", `Id can't start with "${ENTITY_ID_PREFIX}": those ids are for items.`);
  }
  return problems;
}

function findTraitProblems(
  traits: Record<TraitName, number>,
  agentIndex: number,
  rules: SeedRules,
): SeedProblem[] {
  return TRAIT_NAMES.filter((traitName) => !isWithin(traits[traitName], rules.traitRange)).map(
    (traitName) => ({
      severity: "error",
      agentIndex,
      field: `traits.${traitName}`,
      message: `${traitName} must be between ${rules.traitRange.min} and ${rules.traitRange.max}.`,
    }),
  );
}

function findStatProblems(agent: SeedAgent, agentIndex: number, rules: SeedRules): SeedProblem[] {
  return STAT_NAMES.filter((statName) => !isWithin(agent[statName], rules.statRange)).map(
    (statName) => ({
      severity: "error",
      agentIndex,
      field: statName,
      message: `${statName} must be between ${rules.statRange.min} and ${rules.statRange.max}.`,
    }),
  );
}

function findStartingStateProblems(
  agent: SeedAgent,
  agentIndex: number,
  rules: SeedRules,
): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const add = (severity: SeedProblemSeverity, field: string, message: string) =>
    problems.push({ severity, agentIndex, field, message });
  if (!rules.agentsWithStartTiles.includes(agent.id)) {
    add("warning", "start", "No start tile on the map yet. Place them in the map editor.");
  }
  if (agent.sleepRecoveryPerHour <= 0) {
    add("error", "sleepRecoveryPerHour", "Sleep recovery must be above 0.");
  } else if (!isWithin(agent.sleepRecoveryPerHour, rules.sleepRecoveryRange)) {
    const { min, max } = rules.sleepRecoveryRange;
    add("warning", "sleepRecoveryPerHour", `Sleep recovery is usually between ${min} and ${max}.`);
  }
  const inventoryItemIds = new Set(rules.inventoryItems.map((item) => item.id));
  for (const [itemId, amount] of Object.entries(agent.inventory)) {
    if (!Number.isInteger(amount) || amount < 0) {
      add("error", `inventory.${itemId}`, `${itemId} amount must be a whole number, 0 or more.`);
    }
    if (!inventoryItemIds.has(itemId)) {
      add("error", `inventory.${itemId}`, `"${itemId}" is not an item an inventory can hold.`);
    }
  }
  agent.goals.forEach((goal, goalIndex) => {
    if (goal.goal.trim() === "") add("error", `goals.${goalIndex}`, "A goal needs its text.");
  });
  return problems;
}

function findPeopleNoteProblems(
  agent: SeedAgent,
  agentIndex: number,
  knownNames: ReadonlySet<string>,
): SeedProblem[] {
  return Object.entries(agent.people).flatMap(([personName, entry]): SeedProblem[] => {
    const field = `people.${personName}`;
    const isBlank = Object.values(entry).every((text) => text.trim() === "");
    if (personName.toLowerCase() === agent.name.toLowerCase()) {
      return [{ severity: "warning", agentIndex, field, message: "A note about themself." }];
    }
    if (knownNames.has(personName.toLowerCase()) || isBlank) return [];
    return [
      {
        severity: "error",
        agentIndex,
        field,
        message: `Note about "${personName}", who is not in the village.`,
      },
    ];
  });
}

function findSeenPlaceProblems(
  agent: SeedAgent,
  agentIndex: number,
  rules: SeedRules,
): SeedProblem[] {
  const placeNames = new Set(rules.placeNames);
  return agent.seenPlaces
    .filter((placeName) => !placeNames.has(placeName))
    .map((placeName) => ({
      severity: "error",
      agentIndex,
      field: "seenPlaces",
      message: `"${placeName}" is not a place on the map.`,
    }));
}

function findDuplicateProblems(agents: readonly SeedAgent[]): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const firstIndexById = new Map<string, number>();
  const firstIndexByName = new Map<string, number>();
  agents.forEach((agent, agentIndex) => {
    if (firstIndexById.has(agent.id)) {
      problems.push({
        severity: "error",
        agentIndex,
        field: "id",
        message: `Id "${agent.id}" is already used.`,
      });
    } else firstIndexById.set(agent.id, agentIndex);
    const nameKey = agent.name.trim().toLowerCase();
    if (nameKey === "") return;
    if (firstIndexByName.has(nameKey)) {
      problems.push({
        severity: "error",
        agentIndex,
        field: "name",
        message: `Another character is already called ${agent.name}.`,
      });
    } else firstIndexByName.set(nameKey, agentIndex);
  });
  return problems;
}

/**
 * Everything wrong with a seed file. Errors stop it from being saved or seeded; warnings are
 * shown in the editor but allowed.
 */
export function findSeedFileProblems(seedFile: SeedFile, rules: SeedRules): SeedProblem[] {
  const { agents } = seedFile;
  if (agents.length === 0) {
    return [
      {
        severity: "error",
        agentIndex: null,
        field: "agents",
        message: "Needs at least one character.",
      },
    ];
  }
  const knownNames = new Set(agents.map((agent) => agent.name.trim().toLowerCase()));
  return [
    ...findDuplicateProblems(agents),
    ...agents.flatMap((agent, agentIndex) => [
      ...findIdentityProblems(agent, agentIndex),
      ...findTraitProblems(agent.traits, agentIndex, rules),
      ...findStatProblems(agent, agentIndex, rules),
      ...findStartingStateProblems(agent, agentIndex, rules),
      ...findPeopleNoteProblems(agent, agentIndex, knownNames),
      ...findSeenPlaceProblems(agent, agentIndex, rules),
    ]),
  ];
}

export function hasSeedErrors(problems: readonly SeedProblem[]): boolean {
  return problems.some((problem) => problem.severity === "error");
}
