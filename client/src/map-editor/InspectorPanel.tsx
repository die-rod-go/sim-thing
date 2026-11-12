import { useEffect, useState } from "react";
import type { MapProblem, MapReferences } from "@village/shared";
import { CommittedTextInput, Field, NumberInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import type { MapDocument, TileType } from "./map-document";
import { listLostByResize, resizeMap, updateItem, updatePlace } from "./map-edits";
import {
  findSelectedItem,
  findSelectedPlace,
  findSelectedStart,
  moveSelection,
  removeSelection,
  type MapSelection,
} from "./map-selection";

type EditMap = (document: MapDocument, selection?: MapSelection | null) => void;

export function MapProblemList({ problems }: { problems: readonly MapProblem[] }) {
  if (problems.length === 0) return null;
  return (
    <ul className="problem-list">
      {problems.map((problem, problemIndex) => (
        <li key={`${problemIndex}-${problem.message}`} className={`problem-${problem.severity}`}>
          {problem.message}
        </li>
      ))}
    </ul>
  );
}

function clampMapSide(value: number): number {
  return Math.min(clientConfig.mapEditor.maxMapSide, Math.max(1, Math.round(value)));
}

function MapSizeSection({
  document,
  groundFill,
  onEdit,
}: {
  document: MapDocument;
  groundFill: TileType | undefined;
  onEdit: EditMap;
}) {
  const [width, setWidth] = useState(document.width);
  const [height, setHeight] = useState(document.height);
  useEffect(() => {
    setWidth(document.width);
    setHeight(document.height);
  }, [document.width, document.height]);
  const isChanged = width !== document.width || height !== document.height;

  const applySize = () => {
    const lost = listLostByResize(document, width, height);
    const warning = `Shrinking the map removes ${lost.join(", ")}. Resize anyway?`;
    if (lost.length > 0 && !window.confirm(warning)) return;
    onEdit(resizeMap(document, width, height, groundFill?.gid ?? 0));
  };

  return (
    <section className="form-section">
      <h2>Map size</h2>
      <div className="field-grid">
        <Field label="Width">
          {(inputId) => (
            <NumberInput
              id={inputId}
              value={width}
              min={1}
              step={1}
              onChange={(value) => setWidth(clampMapSide(value))}
            />
          )}
        </Field>
        <Field label="Height">
          {(inputId) => (
            <NumberInput
              id={inputId}
              value={height}
              min={1}
              step={1}
              onChange={(value) => setHeight(clampMapSide(value))}
            />
          )}
        </Field>
      </div>
      <p className="field-hint">
        In tiles. Grows and shrinks from the bottom-right corner; new ground is{" "}
        {groundFill?.name ?? "empty"} (the tile chosen in the palette).
      </p>
      <div className="button-group">
        <button disabled={!isChanged} onClick={applySize}>
          Resize
        </button>
        <button
          disabled={!isChanged}
          onClick={() => {
            setWidth(document.width);
            setHeight(document.height);
          }}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

function PositionFields({
  document,
  selection,
  position,
  onEdit,
}: {
  document: MapDocument;
  selection: MapSelection;
  position: { x: number; y: number };
  onEdit: EditMap;
}) {
  return (
    <div className="field-grid">
      <Field label="X">
        {(inputId) => (
          <NumberInput
            id={inputId}
            value={position.x}
            step={1}
            onChange={(x) =>
              onEdit(moveSelection(document, selection, { x: Math.round(x) - position.x, y: 0 }))
            }
          />
        )}
      </Field>
      <Field label="Y">
        {(inputId) => (
          <NumberInput
            id={inputId}
            value={position.y}
            step={1}
            onChange={(y) =>
              onEdit(moveSelection(document, selection, { x: 0, y: Math.round(y) - position.y }))
            }
          />
        )}
      </Field>
    </div>
  );
}

function SelectionSection({
  document,
  selection,
  references,
  onEdit,
}: {
  document: MapDocument;
  selection: MapSelection;
  references: MapReferences;
  onEdit: EditMap;
}) {
  const place = findSelectedPlace(document, selection);
  const item = findSelectedItem(document, selection);
  const start = findSelectedStart(document, selection);
  const removeButton = (
    <button className="danger" onClick={() => onEdit(removeSelection(document, selection), null)}>
      Remove
    </button>
  );

  if (place) {
    return (
      <section className="form-section">
        <h2>Place</h2>
        <Field label="Name" hint="Agents see this name, so write it as they'd say it.">
          {(inputId) => (
            <CommittedTextInput
              id={inputId}
              value={place.name}
              onCommit={(name) => onEdit(updatePlace(document, place.id, { name }))}
            />
          )}
        </Field>
        <label className="map-checkbox">
          <input
            type="checkbox"
            checked={place.isIndoor}
            onChange={(event) =>
              onEdit(updatePlace(document, place.id, { isIndoor: event.target.checked }))
            }
          />
          Indoor
        </label>
        <PositionFields
          document={document}
          selection={selection}
          position={place}
          onEdit={onEdit}
        />
        <div className="field-grid">
          <Field label="Width">
            {(inputId) => (
              <NumberInput
                id={inputId}
                value={place.width}
                min={1}
                step={1}
                onChange={(width) =>
                  onEdit(updatePlace(document, place.id, { width: Math.max(1, Math.round(width)) }))
                }
              />
            )}
          </Field>
          <Field label="Height">
            {(inputId) => (
              <NumberInput
                id={inputId}
                value={place.height}
                min={1}
                step={1}
                onChange={(height) =>
                  onEdit(
                    updatePlace(document, place.id, { height: Math.max(1, Math.round(height)) }),
                  )
                }
              />
            )}
          </Field>
        </div>
        {removeButton}
      </section>
    );
  }

  if (item) {
    return (
      <section className="form-section">
        <h2>Item</h2>
        <Field label="Name" hint='What agents call this one ("rose cottage bed"). Must be unique.'>
          {(inputId) => (
            <CommittedTextInput
              id={inputId}
              value={item.label}
              onCommit={(label) => onEdit(updateItem(document, item.id, { label }))}
            />
          )}
        </Field>
        <Field label="Kind">
          {(inputId) => (
            <select
              id={inputId}
              value={item.definitionId}
              onChange={(event) =>
                onEdit(updateItem(document, item.id, { definitionId: event.target.value }))
              }
            >
              {!references.placeableItems.some(
                (definition) => definition.id === item.definitionId,
              ) && <option value={item.definitionId}>{item.definitionId} (unknown)</option>}
              {references.placeableItems.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <PositionFields document={document} selection={selection} position={item} onEdit={onEdit} />
        {removeButton}
      </section>
    );
  }

  if (start) {
    const character = references.characters.find((candidate) => candidate.id === start.agentId);
    return (
      <section className="form-section">
        <h2>Start tile: {character?.name ?? start.agentId}</h2>
        <p className="field-hint">Where they wake on day 1.</p>
        <PositionFields
          document={document}
          selection={selection}
          position={start}
          onEdit={onEdit}
        />
        {removeButton}
      </section>
    );
  }
  return null;
}

export interface InspectorPanelProps {
  document: MapDocument;
  selection: MapSelection | null;
  references: MapReferences;
  groundFill: TileType | undefined;
  problems: readonly MapProblem[];
  onEdit: EditMap;
}

/** The right sidebar: map size, the selected thing's fields, and what's wrong with the map. */
export function InspectorPanel(props: InspectorPanelProps) {
  const { document, selection } = props;
  return (
    <aside className="editor-sidebar map-inspector">
      {selection && (
        <SelectionSection
          document={document}
          selection={selection}
          references={props.references}
          onEdit={props.onEdit}
        />
      )}
      <MapSizeSection document={document} groundFill={props.groundFill} onEdit={props.onEdit} />
      <section className="form-section">
        <h2>Problems</h2>
        {props.problems.length === 0 ? (
          <p className="field-hint">None.</p>
        ) : (
          <MapProblemList problems={props.problems} />
        )}
      </section>
    </aside>
  );
}
