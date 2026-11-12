import { formatSimTime } from "@village/shared";
import type { Agent, Memory } from "@village/shared";
import { config } from "../config";
import { describeGoals } from "../decision/sections";
import { describeStats, describeStatus, describeTraits } from "../decision/words";
import type { StructuredCaller, StructuredCallResult } from "../llm/call-structured";
import { renderTemplate } from "../llm/templates";
import { rewriteDossiers } from "../memory/dossiers";
import type { NamedPerson } from "../memory/dossiers";
import { forgetMemories } from "../memory/forgetting";
import type { MemoryIdGenerator, MemoryStore } from "../memory/memory-store";
import { describeDossiers, describeTimedMemories } from "./prompt-sections";
import {
  createReflectionMemory,
  DAY_SUMMARY_TAG,
  findPeopleInteractedWith,
  INSIGHT_TAG,
  MOOD_ENTRY_TAG,
  selectDayMemories,
} from "./reflection-memories";
import { buildNightReplySchema } from "./reply-schemas";
import type { NightReply } from "./reply-schemas";

export interface NightReflection {
  summary: string;
  moodEntry: string;
  insights: string[];
}

const NIGHT_TEMPLATE = "night";

export interface NightPassInput {
  agent: Agent;
  /** Words for the agent's conditions, shown with its status. */
  /** The agent's health, which the status line puts in words. */
  health: number;
  conditionWords?: readonly string[];
  store: MemoryStore;
  idGenerator: MemoryIdGenerator;
  callStructured: StructuredCaller;
  tick: number;
  /** Agent, object and place names, used to tag the new memories. */
  knownNames: readonly string[];
  /** Every agent except this one; dossier entries about anyone else are ignored. */
  otherAgents: readonly NamedPerson[];
}

export interface NightPassResult {
  agent: Agent;
  /** Already added to the store. */
  addedMemories: Memory[];
  /** Already removed from the store: the faded memories. */
  deletedMemoryIds: string[];
  /** False when the LLM call failed; faded memories are still deleted. */
  succeeded: boolean;
  /** What the agent wrote about the day; null when the call failed. */
  reflection: NightReflection | null;
}

function listDossiersOfPeopleMetToday(input: NightPassInput, dayMemories: readonly Memory[]) {
  const names = input.otherAgents.map((person) => person.name);
  const metNames = new Set(findPeopleInteractedWith(dayMemories, names));
  return input.otherAgents
    .filter((person) => metNames.has(person.name))
    .map((person) => ({
      person: person.name,
      text: input.agent.dossiers[person.id]?.text ?? config.dossier.unknownPersonText,
    }));
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
    body: describeStats(agent.body),
    status: describeStatus({ health: input.health, needs: agent.needs }, input.conditionWords),
    goals: describeGoals(agent.goals),
    dailyPlan: agent.dailyPlan || "none",
    dayMemories: describeTimedMemories(dayMemories, "Nothing stands out."),
    dossiers: describeDossiers(
      listDossiersOfPeopleMetToday(input, dayMemories),
      "You did not deal with anyone in particular today.",
    ),
    simTime: formatSimTime(input.tick, config.clock),
    maxChars: String(config.memory.maxMemoryChars),
    maxInsights: String(config.reflection.maxInsights),
    maxDossierChars: String(config.dossier.maxChars),
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

export function requestNightReply(
  input: NightPassInput,
): Promise<StructuredCallResult<NightReply>> {
  const dayMemories = selectDayMemories(input.store, input.agent.id, input.tick);
  return input.callStructured({
    kind: "night",
    agentId: input.agent.id,
    tick: input.tick,
    prompt: buildNightPrompt(input, dayMemories),
    ...buildNightReplySchema(),
  });
}

/**
 * Files what the night reply says: summary, mood entry and insights into `reflections`, rewritten
 * dossiers onto the returned agent, and faded memories swept. Mutates `store` to match the returned lists.
 */
export function applyNightReply(
  input: NightPassInput,
  result: StructuredCallResult<NightReply>,
): NightPassResult {
  const { agent, store } = input;
  const fadedIds = deleteFadedMemories(store, agent.id);
  if (!result.ok) {
    return {
      agent,
      addedMemories: [],
      deletedMemoryIds: fadedIds,
      succeeded: false,
      reflection: null,
    };
  }
  const reflections = createReflections(input, result.value);
  store.addAll(reflections);
  return {
    agent: {
      ...agent,
      mood: result.value.moodEntry,
      dossiers: rewriteDossiers(
        agent.dossiers,
        result.value.dossiers,
        input.otherAgents,
        input.tick,
      ),
    },
    addedMemories: reflections,
    deletedMemoryIds: fadedIds,
    succeeded: true,
    reflection: {
      summary: result.value.summary,
      moodEntry: result.value.moodEntry,
      insights: result.value.insights.map((insight) => insight.text),
    },
  };
}

/** The night pass: one call, then `applyNightReply`. */
export async function runNightPass(input: NightPassInput): Promise<NightPassResult> {
  return applyNightReply(input, await requestNightReply(input));
}
