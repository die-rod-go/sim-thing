import type { Agent, DecisionReply, Entity } from "@village/shared";
import { config } from "../config";
import { buildInteractPrompt, buildInteractReplySchema } from "../decision/interact-prompt";
import { describeEntityName } from "../items/entity-store";
import { listVerbsForEntity } from "../items/verb-offers";
import type { PlannedAction } from "./decision-runner";
import type { InteractRequest } from "./agent-runtime";
import type { SimDependencies } from "./tick-context";
import { resolveInteract } from "./verb-resolve";
import type { WorldState } from "./world-state";

/** The reply's words for an interact, which are resolved to things when the verb starts. */
function buildInteractRequest(reply: DecisionReply): InteractRequest {
  return {
    verb: reply.verb ?? "",
    ...(reply.item ? { itemName: reply.item } : {}),
    ...(reply.from ? { fromName: reply.from } : {}),
    ...(reply.target ? { targetName: reply.target } : {}),
    ...(reply.amount === undefined || reply.amount === null ? {} : { amount: reply.amount }),
    ...(reply.text ? { text: reply.text } : {}),
    ...(reply.minutes === undefined || reply.minutes === null ? {} : { minutes: reply.minutes }),
  };
}

async function askWhichVerb(
  state: WorldState,
  dependencies: SimDependencies,
  agent: Agent,
  reply: DecisionReply,
  request: InteractRequest,
  thing: Entity,
): Promise<PlannedAction> {
  const verbNames = [
    ...new Set(listVerbsForEntity(state, agent.id, thing).map((verb) => verb.name)),
  ];
  const prompt = buildInteractPrompt(
    {
      agentName: agent.name,
      objectName: describeEntityName(state, thing),
      intention: reply.intention,
      options: verbNames.map((name) => ({ name, description: "" })),
    },
    dependencies.promptsDirectory,
  );
  const answer = await dependencies.callStructured({
    kind: "interact",
    agentId: agent.id,
    tick: state.tick,
    prompt,
    ...buildInteractReplySchema(verbNames),
  });
  if (!answer.ok) return { kind: "wait", minutes: config.decision.defaultWaitMinutes };
  const text = answer.value.text ?? reply.text;
  const minutes = answer.value.minutes ?? reply.minutes;
  const chosen: InteractRequest = {
    ...request,
    verb: answer.value.verb,
    ...(text ? { text } : {}),
    ...(minutes ? { minutes } : {}),
  };
  return { kind: "interact", request: chosen };
}

/**
 * Plans an interact from the reply's words. When what it names offers some verbs but not the one
 * asked for, a second call lists them; anything else is resolved, or failed, when the verb starts.
 */
export async function planInteract(
  state: WorldState,
  dependencies: SimDependencies,
  agent: Agent,
  reply: DecisionReply,
): Promise<PlannedAction> {
  const request = buildInteractRequest(reply);
  const resolution = resolveInteract(state, agent.id, request);
  if (resolution.kind === "failed" && resolution.unofferedBy !== undefined) {
    return askWhichVerb(state, dependencies, agent, reply, request, resolution.unofferedBy);
  }
  return { kind: "interact", request };
}
