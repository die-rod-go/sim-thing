import type { Agent, DecisionAct } from "@village/shared";
import { config } from "../config";
import { buildInteractPrompt, buildInteractReplySchema } from "../decision/interact-prompt";
import { describeEntityName } from "../items/entity-store";
import type { InteractRequest, PlannedAct } from "./agent-runtime";
import type { SimDependencies } from "./tick-context";
import { resolveInteract, type VerbChoice, type VerbFollowUp } from "./verb-resolve";
import type { WorldState } from "./world-state";

/** An act's words for an interact, which are resolved to things when the verb starts. */
export function buildInteractRequest(act: DecisionAct): InteractRequest {
  return {
    verb: act.verb ?? "",
    ...(act.item ? { itemName: act.item } : {}),
    ...(act.from ? { fromName: act.from } : {}),
    ...(act.target ? { targetName: act.target } : {}),
    ...(act.amount === undefined || act.amount === null ? {} : { amount: act.amount }),
    ...(act.text ? { text: act.text } : {}),
    ...(act.minutes === undefined || act.minutes === null ? {} : { minutes: act.minutes }),
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
  intention: string,
  act: DecisionAct,
  followUp: VerbFollowUp,
): Promise<PlannedAct> {
  const request = buildInteractRequest(act);
  const labels = followUp.choices.map((choice) => choice.label);
  const prompt = buildInteractPrompt(
    {
      agentName: agent.name,
      objectName: describeEntityName(state, followUp.item),
      ...(followUp.targetName === undefined ? {} : { targetName: followUp.targetName }),
      intention,
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
  const text = answer.value.text ?? act.text;
  const minutes = answer.value.minutes ?? act.minutes;
  const chosen: InteractRequest = {
    ...applyVerbChoice(request, choice),
    ...(text ? { text } : {}),
    ...(minutes ? { minutes } : {}),
  };
  return { kind: "interact", request: chosen };
}

/**
 * Plans a decision's first act, an interact, from its words. When the item offers some verbs but
 * not the one asked for, or the target refuses it but other verbs of the item could aim at it, a
 * second call lists them, with what the item is the tool for; anything else is resolved, or
 * failed, when it starts.
 */
export async function planInteract(
  state: WorldState,
  dependencies: SimDependencies,
  agent: Agent,
  intention: string,
  act: DecisionAct,
): Promise<PlannedAct> {
  const request = buildInteractRequest(act);
  const resolution = resolveInteract(state, agent.id, request);
  if (resolution.kind === "failed" && resolution.followUp !== undefined) {
    return askWhichVerb(state, dependencies, agent, intention, act, resolution.followUp);
  }
  return { kind: "interact", request };
}
