import type { Agent, Entity } from "@village/shared";
import { config } from "../config";
import { readContainerCapacity } from "../items/capacity";
import { createEntity, listContents, type EntityWorld } from "../items/entity-store";
import { writeField } from "../items/thing-writes";
import { readField, type ThingRef } from "../items/things";
import type { TickContext } from "../sim/tick-context";
import { markEntityChanged } from "../sim/world-access";
import { failWith, type MechanicResult } from "./types";

/*
 * Transitional: a notice board holds `note` entities; later phases make these names data.
 */
const NOTE_DEFINITION = "note";
const NOTE_TEXT_FIELD = "writing.text";
const NOTE_AUTHOR_FIELD = "writing.author";

export interface NoteView {
  authorName: string;
  text: string;
}

function readNoteText(world: EntityWorld, note: Entity, field: string): string {
  const value = readField(world, { kind: "entity", entityId: note.id }, field);
  return typeof value === "string" ? value : "";
}

function listNotes(world: EntityWorld, board: Entity): Entity[] {
  return listContents(world, board.id).filter((entity) => entity.definitionId === NOTE_DEFINITION);
}

/** The newest notes on the board, newest first. */
export function readNoticeBoard(world: EntityWorld, board: Entity): NoteView[] {
  return listNotes(world, board)
    .reverse()
    .slice(0, config.noticeBoard.notesShownOnRead)
    .map((note) => ({
      authorName: readNoteText(world, note, NOTE_AUTHOR_FIELD),
      text: readNoteText(world, note, NOTE_TEXT_FIELD),
    }));
}

/** Why a note can't be posted, or null. */
export function findPostBlocker(
  world: EntityWorld,
  board: Entity,
  boardName: string,
  text: string,
): string | null {
  if (text.trim().length === 0) {
    return `I need to write something to post a note on the ${boardName}`;
  }
  const capacity = readContainerCapacity(world, board);
  if (capacity === null) return `the ${boardName} can't hold notes`;
  return listContents(world, board.id).length >= capacity ? `the ${boardName} is full` : null;
}

/** Pins a note (truncated to the length cap) inside the board, signed with the author's name. */
export function postNote(
  context: TickContext,
  board: Entity,
  boardName: string,
  author: Agent,
  text: string,
): MechanicResult<{ note: NoteView }> {
  const blocker = findPostBlocker(context.state, board, boardName, text);
  if (blocker !== null) return failWith(blocker);
  const note = createEntity(context.state, NOTE_DEFINITION, { kind: "inside", holderId: board.id });
  const thing: ThingRef = { kind: "entity", entityId: note.id };
  const trimmed = text.trim().slice(0, config.noticeBoard.maxNoteChars);
  markEntityChanged(context.result, note.id);
  writeField(context, thing, NOTE_TEXT_FIELD, trimmed);
  writeField(context, thing, NOTE_AUTHOR_FIELD, author.name);
  return { isSuccess: true, note: { authorName: author.name, text: trimmed } };
}
