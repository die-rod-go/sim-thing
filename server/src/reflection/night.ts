import { formatSimTime } from "@village/shared";
import type { Agent, Memory } from "@village/shared";
import { config } from "../config";
import { resolveName } from "../decision/resolve-name";
import { describeGoals } from "../decision/sections";
import { describeNeeds, describeTraits } from "../decision/words";
import type { StructuredCaller } from "../llm/call-structured";
import { renderTemplate } from "../llm/templates";
import { filePersonNote } from "../memory/filing";
import { forgetMemories } from "../memory/forgetting";
import type { MemoryIdGenerator, MemoryStore } from "../memory/memory-store";
import { describePeopleNotes, describeTimedMemories } from "./prompt-sections";
import {
  createReflectionMemory,
  DAY_SUMMARY_TAG,
  findPeopleInteractedWith,
  INSIGHT_TAG,
  MOOD_ENTRY_TAG,
  selectDayMemories,
  selectPeopleNotes,
} from "./reflection-memories";
import { buildNightReplySchema } from "./reply-schemas";
import type { NightReply } from "./reply-schemas";

const NIGHT_TEMPLATE = "night";

export interface NightPassInput {
  agent: Agent;
  store: MemoryStore;
  idGenerator: MemoryIdGenerator;
  callStructured: StructuredCaller;
  tick: number;
  /** Agent, object and place names, used to tag the new memories. */
  knownNames: readonly string[];
  /** Display names of every agent except this one; people notes about anyone else are ignored. */
  otherAgentNames: readonly string[];
}

export interface NightPassResult {
  agent: Agent;
  /** Already added to the store. */
  addedMemories: Memory[];
  /** Already removed from the store: faded memories, plus people notes replaced by a rewrite. */
  deletedMemoryIds: string[];
  /** False when the LLM call failed; faded memories are still deleted. */
  succeeded: boolean;
}

function collectPeopleNotes(input: NightPassInput, dayMemories: readonly Memory[]) {
  const people = findPeopleInteractedWith(dayMemories, input.otherAgentNames);
  return new Map(
    people.map((person) => [person, selectPeopleNotes(input.store, input.agent.id, person)]),
  );
}

export function buildNightPrompt(input: NightPassInput, dayMemories: readonly Memory[]): string {
  const { agent } = input;
  return renderTemplate(NIGHT_TEMPLATE, {
    name: agent.name,
    profession: agent.profession,
    traits: describeTraits(agent.personality.traits),
    core: agent.personality.core,
    selfImage: agent.personality.selfImage,
    mood: agent.mood,
    needs: describeNeeds(agent.needs),
    goals: describeGoals(agent.goals),
    dailyPlan: agent.dailyPlan || "none",
    dayMemories: describeTimedMemories(dayMemories, "Nothing stands out."),
    peopleNotes: describePeopleNotes(collectPeopleNotes(input, dayMemories)),
    simTime: formatSimTime(input.tick, config.clock),
    maxChars: String(config.memory.maxMemoryChars),
    maxInsights: String(config.reflection.maxInsights),
  });
}

/** Removes this agent's memories already below the strength threshold or over a bucket cap. */
function deleteFadedMemories(store: MemoryStore, agentId: string): string[] {
  // Zero elapsed hours: fading itself happens elsewhere; this only sweeps what has already faded.
  const { deletedIds } = forgetMemories(store.listByAgent(agentId), 0);
  for (const memoryId of deletedIds) store.remove(memoryId);
  return deletedIds;
}

function createReflections(input: NightPassInput, reply: NightReply): Memory[] {
  const agentId = input.agent.id;
  const { newMemoryStrength, reflectionInsightStrength } = config.memory;
  const drafts = [
    { agentId, text: reply.summary, kindTag: DAY_SUMMARY_TAG, strength: newMemoryStrength },
    { agentId, text: reply.moodEntry, kindTag: MOOD_ENTRY_TAG, strength: newMemoryStrength },
    ...reply.insights.map((insight) => ({
      agentId,
      text: insight.text,
      kindTag: INSIGHT_TAG,
      strength: reflectionInsightStrength,
    })),
  ];
  return drafts.map((draft) =>
    createReflectionMemory(draft, input.tick, input.idGenerator, input.knownNames),
  );
}

/** Rewritten notes keyed by canonical person name; unknown names are dropped, the last rewrite wins. */
function resolvePeopleNotes(input: NightPassInput, reply: NightReply): Map<string, string> {
  const candidates = input.otherAgentNames.map((name) => ({ id: name, name }));
  const textByPerson = new Map<string, string>();
  for (const note of reply.peopleNotes) {
    const person = resolveName(note.person, candidates);
    if (person !== null) textByPerson.set(person, note.text);
  }
  return textByPerson;
}

/** Each rewrite replaces the notes the agent was shown about that person. */
function rewritePeopleNotes(
  input: NightPassInput,
  reply: NightReply,
): { added: Memory[]; replacedIds: string[] } {
  const added: Memory[] = [];
  const replacedIds: string[] = [];
  for (const [person, text] of resolvePeopleNotes(input, reply)) {
    for (const oldNote of selectPeopleNotes(input.store, input.agent.id, person)) {
      input.store.remove(oldNote.id);
      replacedIds.push(oldNote.id);
    }
    added.push(
      filePersonNote(input.agent.id, person, text, input.tick, input.idGenerator, input.knownNames),
    );
  }
  return { added, replacedIds };
}

/**
 * The night pass: summary, mood entry and insights into `reflections`, rewritten people notes into
 * `people`, and faded memories swept. Mutates `store` to match the returned lists.
 */
export async function runNightPass(input: NightPassInput): Promise<NightPassResult> {
  const { agent, store } = input;
  const dayMemories = selectDayMemories(store, agent.id, input.tick);
  const result = await input.callStructured({
    kind: "night",
    agentId: agent.id,
    tick: input.tick,
    prompt: buildNightPrompt(input, dayMemories),
    ...buildNightReplySchema(),
  });
  const fadedIds = deleteFadedMemories(store, agent.id);
  if (!result.ok) {
    return { agent, addedMemories: [], deletedMemoryIds: fadedIds, succeeded: false };
  }
  const reflections = createReflections(input, result.value);
  const { added: notes, replacedIds } = rewritePeopleNotes(input, result.value);
  const addedMemories = [...reflections, ...notes];
  store.addAll(addedMemories);
  return {
    agent: { ...agent, mood: result.value.moodEntry },
    addedMemories,
    deletedMemoryIds: [...fadedIds, ...replacedIds],
    succeeded: true,
  };
}
