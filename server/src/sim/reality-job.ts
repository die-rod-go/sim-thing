import { markRealityPassDone } from "../memory/reflection-progress";
import { describeRealityThought } from "../passes/apply-pass";
import { buildRealityPrompt, buildRealityReplySchema } from "../passes/pass-prompts";
import { buildHeldKnowledge } from "./held-knowledge";
import type { JobOutcome } from "./memory-job";
import type { SimDependencies } from "./tick-context";
import { appendToStream, findAgent, getAgentMemory } from "./world-access";
import type { WorldState } from "./world-state";

/**
 * The reality pass, owed every few episodes or when the agent seems stuck (a merged repeat grown
 * large, acts failing in a row): it checks the agent against how the world works and may give it
 * one thought.
 */
export async function checkReality(
  dependencies: SimDependencies,
  state: WorldState,
  agentId: string,
): Promise<JobOutcome> {
  const agent = findAgent(state, agentId);
  const prompt = buildRealityPrompt(
    agent,
    buildHeldKnowledge(state, agent),
    { items: state.items, placeNames: state.map.places.map((place) => place.name) },
    dependencies.promptsDirectory,
  );
  const reply = await dependencies.callStructured({
    kind: "reality",
    agentId,
    tick: state.tick,
    prompt,
    ...buildRealityReplySchema(),
  });
  return {
    agentId,
    jobName: "reality pass",
    apply: (current) => {
      if (!reply.ok) return false;
      const thought = describeRealityThought(reply.value);
      if (thought !== null) appendToStream(current, agentId, thought);
      current.agentMemories[agentId] = markRealityPassDone(getAgentMemory(current, agentId));
      return true;
    },
  };
}
