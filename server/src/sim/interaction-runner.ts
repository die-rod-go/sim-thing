import type { Agent, Memory, Note, WorldObject } from "@village/shared";
import { config } from "../config";
import {
  cancelInteraction,
  finishInteraction,
  startInteraction,
  type InteractionTarget,
} from "../economy/interactions";
import { SLEEP_INTERACTION, endSleep, isAsleep } from "../economy/sleep";
import type { InteractionRecord } from "../economy/types";
import { truncateMemoryText } from "../memory/filing";
import { extractTags, uniqueTags } from "../memory/tags";
import {
  describeDoneInteraction,
  describeItemCounts,
  describeOngoingInteraction,
} from "./action-phrases";
import { getAgentRuntime, type PendingInteract } from "./agent-runtime";
import { broadcastEvent } from "./event-broadcast";
import { createEvent } from "./event-factory";
import { failAction } from "./failure";
import type { TickContext } from "./tick-context";
import {
  findAgent,
  findObjectById,
  listKnownNames,
  markAgentChanged,
  markObjectChanged,
  rememberBriefly,
  replaceAgent,
  replaceObject,
} from "./world-access";

function targetName(target: InteractionTarget): string {
  return typeof target === "string" ? target.trim().toLowerCase() : target.name;
}

/** "bake bread at the oven", for "I tried to ..." */
export function describeAttempt(interaction: string, name: string): string {
  const phrase = config.interactionPhrases[interaction]?.attempt ?? `use the {target}`;
  return phrase.split("{target}").join(name);
}

function fileNotesRead(context: TickContext, reader: Agent, board: WorldObject, notes: Note[]) {
  const { state } = context;
  if (notes.length === 0) {
    rememberBriefly(state, reader.id, `The ${board.name} had no notes on it`);
    return;
  }
  const existingTexts = new Set(
    state.memoryStore.listByAgent(reader.id).map((memory) => memory.text),
  );
  for (const note of notes) {
    const text = truncateMemoryText(
      `I read a note from ${note.authorName} on the ${board.name}: "${note.text}"`,
    );
    if (existingTexts.has(text)) continue;
    const memory: Memory = {
      id: state.memoryIds.nextId(reader.id, state.tick),
      agentId: reader.id,
      bucket: "seen",
      tick: state.tick,
      text,
      tags: uniqueTags([
        note.authorName,
        board.name,
        board.place,
        ...extractTags(note.text, listKnownNames(state)),
      ]),
      strength: config.memory.newMemoryStrength,
      lastRecalledTick: null,
    };
    state.memoryStore.add(memory);
    rememberBriefly(state, reader.id, text);
  }
}

function broadcastStart(
  context: TickContext,
  agent: Agent,
  record: InteractionRecord,
  text?: string,
) {
  const { state, result } = context;
  const name = record.targetName;
  if (record.interaction === SLEEP_INTERACTION) {
    const description = `fell asleep in the ${name}`;
    broadcastEvent(
      state,
      createEvent(state, agent, {
        kind: "fell_asleep",
        description,
        targetId: record.objectId,
        targetName: name,
      }),
      result,
    );
    context.dependencies.reflectionHook.onSleepStarted(state, agent.id, state.tick);
    return;
  }
  if (record.interaction === "post a note") {
    const description = `posted a note on the ${name}: "${text ?? ""}"`;
    broadcastEvent(
      state,
      createEvent(state, agent, {
        kind: "posted_note",
        description,
        targetId: record.objectId,
        targetName: name,
      }),
      result,
    );
    return;
  }
  broadcastEvent(
    state,
    createEvent(state, agent, {
      kind: "action_started",
      description: `started ${describeOngoingInteraction(record.interaction, name)}`,
      targetId: record.objectId,
      targetName: name,
      loudness: config.interactions[record.interaction]?.loudness ?? null,
    }),
    result,
  );
}

/** Starts an interaction where the agent stands; a failure is filed in the world. */
export function startInteractionNow(
  context: TickContext,
  agentId: string,
  target: InteractionTarget,
  request: PendingInteract,
): void {
  const { state, result } = context;
  const agent = findAgent(state, agentId);
  const started = startInteraction({
    agent,
    target,
    interaction: request.interaction,
    tick: state.tick,
    text: request.text,
    minutesChosen: request.interaction === SLEEP_INTERACTION ? request.minutes : undefined,
  });
  if (!started.isSuccess) {
    failAction(
      state,
      result,
      agentId,
      describeAttempt(request.interaction, targetName(target)),
      started.reason,
    );
    return;
  }
  const { record } = started;
  const currentAction = started.agent.currentAction;
  const busyAgent: Agent = {
    ...started.agent,
    currentAction: currentAction ? { ...currentAction, interaction: record.interaction } : null,
  };
  replaceAgent(state, busyAgent);
  const runtime = getAgentRuntime(state, agentId);
  runtime.walk = null;
  runtime.interaction = record;
  markAgentChanged(result, agentId);
  if (started.object !== null) {
    replaceObject(state, started.object);
    markObjectChanged(result, started.object.id);
    result.interactionStarts.push({
      agentId,
      objectId: started.object.id,
      interaction: record.interaction,
    });
  }
  broadcastStart(context, busyAgent, record, request.text);
  if (record.interaction === "read" && started.object !== null) {
    fileNotesRead(context, findAgent(state, agentId), started.object, started.notesRead);
  }
}

/** The running interaction's record; rebuilt from the agent's action if it was lost. */
function findRecord(context: TickContext, agent: Agent): InteractionRecord | null {
  const runtime = getAgentRuntime(context.state, agent.id);
  if (runtime.interaction) return runtime.interaction;
  const action = agent.currentAction;
  if (!action?.interaction || !action.target) return null;
  const object = context.state.objects.find((candidate) => candidate.name === action.target);
  return {
    agentId: agent.id,
    interaction: action.interaction,
    targetName: action.target,
    objectId: object?.id ?? null,
    startedAtTick: context.state.tick,
  };
}

function applyStopped(context: TickContext, stopped: { agent: Agent; object: WorldObject | null }) {
  const { state, result } = context;
  replaceAgent(state, stopped.agent);
  getAgentRuntime(state, stopped.agent.id).interaction = null;
  markAgentChanged(result, stopped.agent.id);
  if (stopped.object) {
    replaceObject(state, stopped.object);
    markObjectChanged(result, stopped.object.id);
  }
}

/** Finishes the agent's interaction: outputs and need effects, and an `action_finished` event. */
export function finishRunningInteraction(context: TickContext, agentId: string): void {
  const agent = findAgent(context.state, agentId);
  const record = findRecord(context, agent);
  if (record === null) {
    applyStopped(context, { agent: { ...agent, currentAction: null }, object: null });
    return;
  }
  const object = record.objectId ? (findObjectById(context.state, record.objectId) ?? null) : null;
  const finished = finishInteraction({ agent, object, record });
  applyStopped(context, finished);
  const outputs = config.interactions[record.interaction]?.outputs ?? {};
  const made = Object.keys(outputs).length > 0 ? `, making ${describeItemCounts(outputs)}` : "";
  const description = `finished ${describeOngoingInteraction(record.interaction, record.targetName)}${made}`;
  broadcastEvent(
    context.state,
    createEvent(context.state, finished.agent, {
      kind: "action_finished",
      description,
      targetId: record.objectId,
      targetName: record.targetName,
    }),
    context.result,
  );
}

/** Wakes a sleeping agent, frees the bed, broadcasts `woke` and tells the reflection hook. */
export function wakeAgent(context: TickContext, agentId: string): void {
  const { state } = context;
  const agent = findAgent(state, agentId);
  const record = findRecord(context, agent);
  const bed = record?.objectId ? findObjectById(state, record.objectId) : undefined;
  if (bed) {
    const ended = endSleep(agent, bed);
    applyStopped(context, { agent: ended.agent, object: ended.bed });
  } else {
    applyStopped(context, { agent: { ...agent, currentAction: null }, object: null });
  }
  const description = bed ? `woke up in the ${bed.name}` : "woke up";
  const awake = findAgent(state, agentId);
  broadcastEvent(state, createEvent(state, awake, { kind: "woke", description }), context.result);
  const sleptTicks = state.tick - (record?.startedAtTick ?? state.tick);
  context.dependencies.reflectionHook.onWoke(state, agentId, state.tick, sleptTicks);
}

/**
 * Stops whatever the agent is doing because it chose something else: an interaction is cancelled
 * with no refund, a sleeper wakes, a walk or wait simply ends.
 */
export function stopCurrentAction(context: TickContext, agentId: string): void {
  const agent = findAgent(context.state, agentId);
  const runtime = getAgentRuntime(context.state, agentId);
  if (isAsleep(agent)) {
    wakeAgent(context, agentId);
  } else if (agent.currentAction?.interaction !== undefined) {
    const record = findRecord(context, agent);
    const object = record?.objectId
      ? (findObjectById(context.state, record.objectId) ?? null)
      : null;
    if (record) applyStopped(context, cancelInteraction({ agent, object, record }));
  }
  runtime.walk = null;
  const current = findAgent(context.state, agentId);
  if (current.currentAction !== null) {
    replaceAgent(context.state, { ...current, currentAction: null });
    markAgentChanged(context.result, agentId);
  }
}

/** "opened the bakery door", for doors opened by walking through them. */
export function describeDoorOpened(door: WorldObject): string {
  return describeDoneInteraction("open", door.name);
}
