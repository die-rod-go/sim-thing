import { readComponentField, type Entity, type Memory, type Note } from "@village/shared";
import { config } from "../../config";
import { findPostBlocker, postNote, readNoticeBoard } from "../../economy/notice-board";
import { findSleepBlocker, startSleep } from "../../economy/sleep";
import { getDefinition, replaceEntity, resolveEntityPosition } from "../../items/entity-store";
import { truncateMemoryText } from "../../memory/filing";
import { extractTags, uniqueTags } from "../../memory/tags";
import { broadcastEvent } from "../event-broadcast";
import { createEvent } from "../event-factory";
import type { WorldState } from "../world-state";
import {
  findAgent,
  listKnownNames,
  markAgentChanged,
  markEntityChanged,
  rememberBriefly,
  replaceAgent,
} from "../world-access";
import {
  describeEffectEntity,
  findEffectEntity,
  type EffectHandler,
  type EffectRun,
} from "./effect-run";

function requireEntity(effectRun: EffectRun, entity: Entity | undefined): Entity {
  if (!entity) throw new Error(`"${effectRun.verb.name}" lost the thing it was used on`);
  return entity;
}

/** Falls asleep in the bed; the sleep ends by its own rules (rested, hungry, nap over, woken). */
export const sleepEffect: EffectHandler<"sleep"> = {
  findBlocker(effectRun) {
    return findSleepBlocker(
      findAgent(effectRun.context.state, effectRun.run.agentId),
      effectRun.minutes,
    );
  },
  apply(effectRun, effect) {
    const { context, run } = effectRun;
    const { state, result } = context;
    const bed = requireEntity(effectRun, findEffectEntity(effectRun, effect));
    const bedName = describeEffectEntity(effectRun, bed);
    const slept = startSleep(findAgent(state, run.agentId), bedName, state.tick, effectRun.minutes);
    if (!slept.isSuccess) throw new Error(`sleep started despite its check: ${slept.reason}`);
    replaceAgent(state, slept.agent);
    markAgentChanged(result, run.agentId);
    const event = createEvent(state, slept.agent, {
      kind: "fell_asleep",
      description: `fell asleep in the ${bedName}`,
      targetId: bed.id,
      targetName: bedName,
    });
    broadcastEvent(state, event, result);
    context.dependencies.reflectionHook.onSleepStarted(state, run.agentId, state.tick);
    return { isStartAnnounced: true };
  },
};

function buildNoteMemory(state: WorldState, readerId: string, board: Entity, note: Note): Memory {
  const boardName = board.label ?? getDefinition(state, board).name;
  const place = resolveEntityPosition(state, board)?.place ?? "";
  return {
    id: state.memoryIds.nextId(readerId, state.tick),
    agentId: readerId,
    bucket: "seen",
    tick: state.tick,
    text: truncateMemoryText(
      `I read a note from ${note.authorName} on the ${boardName}: "${note.text}"`,
    ),
    tags: uniqueTags([
      note.authorName,
      boardName,
      place,
      ...extractTags(note.text, listKnownNames(state)),
    ]),
    strength: config.memory.newMemoryStrength,
    lastRecalledTick: null,
  };
}

/** Reads the newest notes on the board into `seen` memories, skipping ones already remembered. */
export const readNotesEffect: EffectHandler<"read_notes"> = {
  apply(effectRun, effect) {
    const { state } = effectRun.context;
    const readerId = effectRun.run.agentId;
    const board = requireEntity(effectRun, findEffectEntity(effectRun, effect));
    const notes = readNoticeBoard(board);
    if (notes.length === 0) {
      rememberBriefly(
        state,
        readerId,
        `The ${describeEffectEntity(effectRun, board)} had no notes on it`,
      );
      return {};
    }
    const existingTexts = new Set(
      state.memoryStore.listByAgent(readerId).map((memory) => memory.text),
    );
    for (const note of notes) {
      const memory = buildNoteMemory(state, readerId, board, note);
      if (existingTexts.has(memory.text)) continue;
      state.memoryStore.add(memory);
      rememberBriefly(state, readerId, memory.text);
    }
    return {};
  },
};

function readMaxNotes(state: WorldState, board: Entity): number {
  const maxNotes = readComponentField(getDefinition(state, board), "notes", "maxNotes");
  if (typeof maxNotes !== "number") throw new Error(`${board.definitionId} has no notes.maxNotes`);
  return maxNotes;
}

/** Pins the decision's text to the board as a note. */
export const postNoteEffect: EffectHandler<"post_note"> = {
  findBlocker(effectRun, effect) {
    const board = findEffectEntity(effectRun, effect);
    return board ? findPostBlocker(describeEffectEntity(effectRun, board), effectRun.text) : null;
  },
  apply(effectRun, effect) {
    const { state, result } = effectRun.context;
    const board = requireEntity(effectRun, findEffectEntity(effectRun, effect));
    const boardName = describeEffectEntity(effectRun, board);
    const author = findAgent(state, effectRun.run.agentId);
    const posted = postNote(
      board,
      boardName,
      author,
      effectRun.text,
      state.tick,
      readMaxNotes(state, board),
    );
    if (!posted.isSuccess) throw new Error(`note posted despite its check: ${posted.reason}`);
    replaceEntity(state, posted.board);
    markEntityChanged(result, board.id);
    const event = createEvent(state, author, {
      kind: "posted_note",
      description: `posted a note on the ${boardName}: "${posted.note.text}"`,
      targetId: board.id,
      targetName: boardName,
    });
    broadcastEvent(state, event, result);
    return { isStartAnnounced: true };
  },
};
