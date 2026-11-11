import { slugifyAgentName, type SeedAgent, type SeedFile, type SeedProblem } from "@village/shared";

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

/** The first spawn place no character starts at yet, so new characters don't share a home. */
function pickFreeSpawnPlace(
  seedFile: SeedFile,
  spawnPlaces: readonly string[],
): string | undefined {
  const takenPlaces = new Set(seedFile.agents.map((agent) => agent.spawnPlace));
  return spawnPlaces.find((place) => !takenPlaces.has(place));
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

export function addAgent(
  seedFile: SeedFile,
  template: SeedAgent,
  spawnPlaces: readonly string[],
): SeedFile {
  const agent: SeedAgent = {
    ...structuredClone(template),
    spawnPlace: pickFreeSpawnPlace(seedFile, spawnPlaces) ?? template.spawnPlace,
  };
  return { ...seedFile, agents: [...seedFile.agents, agent] };
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

/** Removes a character and every other character's note about them. */
export function removeAgent(seedFile: SeedFile, agentIndex: number): SeedFile {
  const removed = seedFile.agents[agentIndex];
  if (!removed) return seedFile;
  const agents = seedFile.agents
    .filter((_agent, index) => index !== agentIndex)
    .map((agent) => ({
      ...agent,
      peopleNotes: Object.fromEntries(
        Object.entries(agent.peopleNotes).filter(
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
 * and other characters' notes about the old name move to the new one.
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
      peopleNotes: Object.fromEntries(
        Object.entries(existing.peopleNotes).map(([personName, note]) => [
          isSameName(personName, oldName) ? newName.trim() : personName,
          note,
        ]),
      ),
    };
  });
  return { ...seedFile, agents };
}

export function setPersonNote(
  agent: SeedAgent,
  personName: string,
  note: string | null,
): SeedAgent {
  const peopleNotes = { ...agent.peopleNotes };
  if (note === null) delete peopleNotes[personName];
  else peopleNotes[personName] = note;
  return { ...agent, peopleNotes };
}

/** Blank notes are only editor placeholders; they are not written to the seed file. */
export function withoutBlankNotes(seedFile: SeedFile): SeedFile {
  return {
    ...seedFile,
    agents: seedFile.agents.map((agent) => ({
      ...agent,
      peopleNotes: Object.fromEntries(
        Object.entries(agent.peopleNotes).filter(([, note]) => note.trim() !== ""),
      ),
    })),
  };
}

/** The other characters' names, and any names this character has notes about who aren't in the village. */
export function listNoteSubjects(
  seedFile: SeedFile,
  agentIndex: number,
): { villagers: string[]; strangers: string[] } {
  const villagers = seedFile.agents
    .filter((agent, index) => index !== agentIndex && agent.name.trim() !== "")
    .map((agent) => agent.name.trim());
  const agent = seedFile.agents[agentIndex];
  const strangers = Object.keys(agent?.peopleNotes ?? {}).filter(
    (personName) => !villagers.some((villager) => isSameName(villager, personName)),
  );
  return { villagers, strangers };
}

/** Finds the note key matching a name regardless of case, so "edwin" and "Edwin" are one note. */
export function findNoteKey(agent: SeedAgent, personName: string): string {
  return (
    Object.keys(agent.peopleNotes).find((noteName) => isSameName(noteName, personName)) ??
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
