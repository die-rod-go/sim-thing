import { useCallback } from "react";
import type { Position } from "@village/shared";
import { ItemDataDisclosure } from "../ui/ItemData";
import type { InspectedNote, InspectedThing, TileInspection } from "./tile-inspection";

interface TileCardProps {
  inspection: TileInspection | null;
  isPinned: boolean;
  onClose: () => void;
  cardRef: (element: HTMLElement | null) => void;
}

/** An outline around the inspected tile, drawn in map pixels inside the camera-scaled layer. */
export function TileHighlight({
  tile,
  isPinned,
  tileSize,
}: {
  tile: Position | null;
  isPinned: boolean;
  tileSize: number;
}) {
  if (!tile) return null;
  return (
    <span
      className={isPinned ? "tile-highlight is-pinned" : "tile-highlight"}
      style={{ left: tile.x * tileSize, top: tile.y * tileSize, width: tileSize, height: tileSize }}
    />
  );
}

function stopPropagation(event: Event): void {
  event.stopPropagation();
}

function NoteEntry({ note }: { note: InspectedNote }) {
  return (
    <li className="tile-card-note">
      <span className="tile-card-note-byline">{note.author}</span>
      <span className="tile-card-note-text">{note.text}</span>
    </li>
  );
}

function NotesSection({ notes, isPinned }: { notes: readonly InspectedNote[]; isPinned: boolean }) {
  const [latestNote] = notes;
  if (!latestNote) return null;
  const noteCount = `${notes.length} ${notes.length === 1 ? "note" : "notes"}`;
  if (!isPinned) {
    return (
      <div className="tile-card-notes is-preview">
        <span className="tile-card-muted">{noteCount}, latest:</span>
        <ul>
          <NoteEntry note={latestNote} />
        </ul>
      </div>
    );
  }
  return (
    <div className="tile-card-notes">
      <span className="tile-card-muted">{noteCount}, newest first</span>
      <ul>
        {notes.map((note, noteIndex) => (
          <NoteEntry key={`${note.author}:${noteIndex}`} note={note} />
        ))}
      </ul>
    </div>
  );
}

function ThingEntry({ thing, isPinned }: { thing: InspectedThing; isPinned: boolean }) {
  return (
    <li className="tile-card-thing">
      <strong>{thing.name}</strong>
      {thing.details.length > 0 && (
        <span className="tile-card-muted"> · {thing.details.join(" · ")}</span>
      )}
      {thing.contents.length > 0 && (
        <div className="tile-card-muted">holds {thing.contents.join(", ")}</div>
      )}
      <NotesSection notes={thing.notes} isPinned={isPinned} />
      {isPinned && thing.data.length > 0 && <ItemDataDisclosure label="data" data={thing.data} />}
    </li>
  );
}

/**
 * What is on the map tile under the pointer, or the pinned one. The frame loop places it beside
 * the tile. A pinned card takes the pointer, so its notes scroll without zooming or panning.
 */
export function TileCard({ inspection, isPinned, onClose, cardRef }: TileCardProps) {
  const attachCard = useCallback(
    (element: HTMLElement | null) => {
      cardRef(element);
      if (!element) return;
      element.addEventListener("wheel", stopPropagation);
      element.addEventListener("pointerdown", stopPropagation);
      return () => {
        cardRef(null);
        element.removeEventListener("wheel", stopPropagation);
        element.removeEventListener("pointerdown", stopPropagation);
      };
    },
    [cardRef],
  );
  if (!inspection) return null;
  const hasNotes = inspection.things.some((thing) => thing.notes.length > 0);
  const ground = inspection.terrains.join(" on ");
  return (
    <div className={isPinned ? "tile-card is-pinned" : "tile-card"} ref={attachCard}>
      <div className="tile-card-title">
        <strong>{inspection.placeName ?? "outdoors"}</strong>
        {ground && <span className="tile-card-muted">{ground}</span>}
        {isPinned && (
          <button className="tile-card-close" onClick={onClose} aria-label="Close" type="button">
            ×
          </button>
        )}
      </div>
      {inspection.agentNames.length > 0 && (
        <div>
          <span className="tile-card-muted">here: </span>
          {inspection.agentNames.join(", ")}
        </div>
      )}
      {inspection.things.length > 0 && (
        <ul className="tile-card-things">
          {inspection.things.map((thing) => (
            <ThingEntry key={thing.key} thing={thing} isPinned={isPinned} />
          ))}
        </ul>
      )}
      {!isPinned && (
        <div className="tile-card-hint">
          {hasNotes ? "click to pin and read every note" : "click to pin and see item data"}
        </div>
      )}
    </div>
  );
}
