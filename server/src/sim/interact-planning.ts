import type { Agent, DecisionReply } from "@village/shared";
import { config } from "../config";
import { buildInteractPrompt, buildInteractReplySchema } from "../decision/interact-prompt";
import { describeEntityName } from "../items/entity-store";
import type { PlannedAction } from "./decision-runner";
import type { InteractRequest } from "./agent-runtime";
import type { SimDependencies } from "./tick-context";
import { resolveInteract, type VerbChoice, type VerbFollowUp } from "./verb-resolve";
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

/** The request with the chosen verb; a tool use moves the item to the thing it is done on. */
function applyVerbChoice(request: InteractRequest, choice: VerbChoice): InteractRequest {
  if (choice.itemName === undefined) return { ...request, verb: choice.verbName };
  const moved: InteractRequest = { ...request, verb: choice.verbName, itemName: choice.itemName };
  delete moved.targetName;
  delete moved.fromName;
  return moved;
}

async function askWhichVerb(
  state: WorldState,
  dependencies: SimDependencies,
  agent: Agent,
  reply: DecisionReply,
  request: InteractRequest,
  followUp: VerbFollowUp,
): Promise<PlannedAction> {
  const labels = followUp.choices.map((choice) => choice.label);
  const prompt = buildInteractPrompt(
    {
      agentName: agent.name,
      objectName: describeEntityName(state, followUp.item),
      ...(followUp.targetName === undefined ? {} : { targetName: followUp.targetName }),
      intention: reply.intention,
      options: labels.map((name) => ({ name, description: "" })),
    },
    dependencies.promptsDirectory,
  );
  const answer = await dependencies.callStructured({
    kind: "interact",
    agentId: agent.id,
    tick: state.tick,
    prompt,
    ...buildInteractReplySchema(labels),
  });
  if (!answer.ok) return { kind: "wait", minutes: config.decision.defaultWaitMinutes };
  const choice = followUp.choices.find((candidate) => candidate.label === answer.value.verb);
  // Declining keeps the original request so it fails at the start and the agent learns why.
  if (choice === undefined) return { kind: "interact", request };
  const text = answer.value.text ?? reply.text;
  const minutes = answer.value.minutes ?? reply.minutes;
  const chosen: InteractRequest = {
    ...applyVerbChoice(request, choice),
    ...(text ? { text } : {}),
    ...(minutes ? { minutes } : {}),
  };
  return { kind: "interact", request: chosen };
}

/**
 * Plans an interact from the reply's words. When the item offers some verbs but not the one asked
 * for, or the target refuses it but other verbs of the item could aim at it, a second call lists
 * them, with what the item is the tool for; anything else is resolved, or failed, when it starts.
 */
export async function planInteract(
  state: WorldState,
  dependencies: SimDependencies,
  agent: Agent,
  reply: DecisionReply,
): Promise<PlannedAction> {
  const request = buildInteractRequest(reply);
  const resolution = resolveInteract(state, agent.id, request);
  if (resolution.kind === "failed" && resolution.followUp !== undefined) {
    return askWhichVerb(state, dependencies, agent, reply, request, resolution.followUp);
  }
  return { kind: "interact", request };
}
