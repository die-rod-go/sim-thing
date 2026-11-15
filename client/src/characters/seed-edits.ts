import {
  slugifyAgentName,
  type SeedAgent,
  type SeedFile,
  type SeedPersonEntry,
  type SeedProblem,
} from "@village/shared";

function replaceAgentAt(seedFile: SeedFile, agentIndex: number, agent: SeedAgent): SeedFile {
  return {
    ...seedFile,
    agents: seedFile.agents.map((existing, index) => (index === agentIndex ? agent : existing)),
  };
}

function isSameName(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

function findUnusedId(seedFile: SeedFile, baseId: string): string {
  const usedIds = new Set(seedFile.agents.map((agent) => agent.id));
  if (!usedIds.has(baseId)) return baseId;
  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}

export function updateAgent(
  seedFile: SeedFile,
  agentIndex: number,
  changes: Partial<SeedAgent>,
): SeedFile {
  const agent = seedFile.agents[agentIndex];
  if (!agent) return seedFile;
  return replaceAgentAt(seedFile, agentIndex, { ...agent, ...changes });
}

export function addAgent(seedFile: SeedFile, template: SeedAgent): SeedFile {
  return { ...seedFile, agents: [...seedFile.agents, structuredClone(template)] };
}

export function duplicateAgent(seedFile: SeedFile, agentIndex: number): SeedFile {
  const original = seedFile.agents[agentIndex];
  if (!original) return seedFile;
  const name = `${original.name} Copy`;
  const copy: SeedAgent = {
    ...structuredClone(original),
    name,
    id: findUnusedId(seedFile, slugifyAgentName(name)),
  };
  const agents = [...seedFile.agents];
  agents.splice(agentIndex + 1, 0, copy);
  return { ...seedFile, agents };
}

/** Removes a character and what every other character holds about them. */
export function removeAgent(seedFile: SeedFile, agentIndex: number): SeedFile {
  const removed = seedFile.agents[agentIndex];
  if (!removed) return seedFile;
  const agents = seedFile.agents
    .filter((_agent, index) => index !== agentIndex)
    .map((agent) => ({
      ...agent,
      people: Object.fromEntries(
        Object.entries(agent.people).filter(
          ([personName]) => removed.name.trim() === "" || !isSameName(personName, removed.name),
        ),
      ),
    }));
  return { ...seedFile, agents };
}

export function moveAgent(seedFile: SeedFile, agentIndex: number, offset: number): SeedFile {
  const targetIndex = agentIndex + offset;
  const agent = seedFile.agents[agentIndex];
  if (!agent || targetIndex < 0 || targetIndex >= seedFile.agents.length) return seedFile;
  const agents = [...seedFile.agents];
  agents.splice(agentIndex, 1);
  agents.splice(targetIndex, 0, agent);
  return { ...seedFile, agents };
}

/**
 * Renames a character. The id follows the name while it still matches the old name (or is empty),
 * and what other characters hold about the old name moves to the new one.
 */
export function renameAgent(seedFile: SeedFile, agentIndex: number, newName: string): SeedFile {
  const agent = seedFile.agents[agentIndex];
  if (!agent) return seedFile;
  const oldName = agent.name;
  const isIdDerived = agent.id === "" || agent.id === slugifyAgentName(oldName);
  const renamed: SeedAgent = {
    ...agent,
    name: newName,
    id: isIdDerived ? slugifyAgentName(newName) : agent.id,
  };
  const canMoveNotes = oldName.trim() !== "" && newName.trim() !== "";
  const agents = seedFile.agents.map((existing, index) => {
    if (index === agentIndex) return renamed;
    if (!canMoveNotes) return existing;
    return {
      ...existing,
      people: Object.fromEntries(
        Object.entries(existing.people).map(([personName, entry]) => [
          isSameName(personName, oldName) ? newName.trim() : personName,
          entry,
        ]),
      ),
    };
  });
  return { ...seedFile, agents };
}

/** Sets what the character holds about a person; null removes the person. */
export function setPersonEntry(
  agent: SeedAgent,
  personName: string,
  entry: SeedPersonEntry | null,
): SeedAgent {
  const people = { ...agent.people };
  if (entry === null) delete people[personName];
  else people[personName] = entry;
  return { ...agent, people };
}

function withoutBlankFields(entry: SeedPersonEntry): SeedPersonEntry {
  return Object.fromEntries(Object.entries(entry).filter(([, text]) => text.trim() !== ""));
}

/** Blank fields and people with nothing filled in are only editor placeholders; they are not saved. */
export function withoutBlankPeople(seedFile: SeedFile): SeedFile {
  return {
    ...seedFile,
    agents: seedFile.agents.map((agent) => ({
      ...agent,
      people: Object.fromEntries(
        Object.entries(agent.people)
          .map(([personName, entry]) => [personName, withoutBlankFields(entry)] as const)
          .filter(([, entry]) => Object.keys(entry).length > 0),
      ),
    })),
  };
}

/** The other characters' names, and any people this character holds something about who aren't in the village. */
export function listPersonSubjects(
  seedFile: SeedFile,
  agentIndex: number,
): { villagers: string[]; strangers: string[] } {
  const villagers = seedFile.agents
    .filter((agent, index) => index !== agentIndex && agent.name.trim() !== "")
    .map((agent) => agent.name.trim());
  const agent = seedFile.agents[agentIndex];
  const strangers = Object.keys(agent?.people ?? {}).filter(
    (personName) => !villagers.some((villager) => isSameName(villager, personName)),
  );
  return { villagers, strangers };
}

/** Finds the key matching a name regardless of case, so "edwin" and "Edwin" are one person. */
export function findPersonKey(agent: SeedAgent, personName: string): string {
  return (
    Object.keys(agent.people).find((existingName) => isSameName(existingName, personName)) ??
    personName
  );
}

export function selectAgentProblems(
  problems: readonly SeedProblem[],
  agentIndex: number,
): SeedProblem[] {
  return problems.filter((problem) => problem.agentIndex === agentIndex);
}

export function selectFieldProblems(
  problems: readonly SeedProblem[],
  fieldPrefix: string,
): SeedProblem[] {
  return problems.filter(
    (problem) => problem.field === fieldPrefix || problem.field.startsWith(`${fieldPrefix}.`),
  );
}
