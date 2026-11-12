import { useEffect, useRef, useState } from "react";
import { MAP_TILE_LAYER_NAMES, type Glyph, type MapReferences } from "@village/shared";
import type { GlyphPainter } from "../village/glyph-painter";
import type { MapDocument, TileType } from "./map-document";
import { MAP_VIEWS, type MapView } from "./map-painting";
import type { MapSelection } from "./map-selection";
import { TILE_TOOLS, type MapTool, type ToolSettings } from "./use-map-tools";

const SWATCH_PIXELS = 20;

export const TOOL_SHORTCUTS: Record<MapTool, string> = {
  select: "v",
  paint: "b",
  rectangle: "r",
  fill: "g",
  erase: "e",
  place: "p",
  item: "i",
  start: "s",
};

const TOOL_LABELS: Record<MapTool, string> = {
  select: "Select / move",
  paint: "Paint",
  rectangle: "Rectangle",
  fill: "Fill",
  erase: "Erase",
  place: "Place",
  item: "Item",
  start: "Start tile",
};

const TOOL_HINTS: Record<MapTool, string> = {
  select:
    "Click a start tile, item or place to edit it; drag to move it. Drag a place's corner square to resize it. Delete removes it.",
  paint: "Click or drag to paint tiles on the chosen layer. Right-click paints empty.",
  rectangle: "Drag to fill a rectangle on the chosen layer. Right-drag clears one.",
  fill: "Click to fill the connected area of the same tile on the chosen layer.",
  erase: "Click or drag to clear tiles from the chosen layer.",
  place:
    "Drag a rectangle to make a named place. Indoor places should include their walls. Tiles outside every place are the village road.",
  item: "Click a tile to place the chosen item there.",
  start: "Click a tile to set where the chosen character wakes on day 1.",
};

const LAYER_HINTS: Record<(typeof MAP_TILE_LAYER_NAMES)[number], string> = {
  ground: "Floor art under everything.",
  walls: "Anything here blocks movement and sight.",
  decor: "Art only (trees, furniture); never blocks.",
};

const VIEW_LABELS: Record<MapView, string> = {
  ground: "Ground",
  walls: "Walls",
  decor: "Decor",
  places: "Places",
  items: "Items",
  starts: "Start tiles",
  grid: "Grid",
};

export function GlyphSwatch({
  glyph,
  glyphPainter,
}: {
  glyph: Glyph | null;
  glyphPainter: GlyphPainter;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, SWATCH_PIXELS, SWATCH_PIXELS);
    if (!glyph) return;
    const cell = { x: 0, y: 0, width: SWATCH_PIXELS, height: SWATCH_PIXELS };
    glyphPainter.drawGlyph(context, glyph, cell);
  }, [glyph, glyphPainter]);
  return (
    <canvas className="glyph-swatch" ref={canvasRef} width={SWATCH_PIXELS} height={SWATCH_PIXELS} />
  );
}

function TilePalette({
  settings,
  tileTypes,
  glyphPainter,
  onChange,
}: {
  settings: ToolSettings;
  tileTypes: readonly TileType[];
  glyphPainter: GlyphPainter;
  onChange: (changes: Partial<ToolSettings>) => void;
}) {
  return (
    <>
      <div className="map-layer-choice" role="radiogroup" aria-label="Layer">
        {MAP_TILE_LAYER_NAMES.map((layerName) => (
          <button
            key={layerName}
            className={settings.tileLayer === layerName ? "is-active" : ""}
            onClick={() => onChange({ tileLayer: layerName })}
          >
            {VIEW_LABELS[layerName]}
          </button>
        ))}
      </div>
      <p className="field-hint">{LAYER_HINTS[settings.tileLayer]}</p>
      {settings.tool !== "erase" && (
        <ul className="map-palette">
          {tileTypes.map((tileType) => (
            <li key={tileType.gid}>
              <button
                className={settings.tileGid === tileType.gid ? "is-active" : ""}
                onClick={() => onChange({ tileGid: tileType.gid })}
              >
                <GlyphSwatch glyph={tileType.glyph} glyphPainter={glyphPainter} />
                {tileType.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ItemPalette({
  settings,
  references,
  glyphPainter,
  onChange,
}: {
  settings: ToolSettings;
  references: MapReferences;
  glyphPainter: GlyphPainter;
  onChange: (changes: Partial<ToolSettings>) => void;
}) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const items = references.placeableItems.filter(
    (item) => item.name.toLowerCase().includes(query) || item.id.includes(query),
  );
  return (
    <>
      <input
        type="search"
        placeholder="Filter items"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <ul className="map-palette">
        {items.map((item) => (
          <li key={item.id}>
            <button
              className={settings.definitionId === item.id ? "is-active" : ""}
              onClick={() => onChange({ definitionId: item.id })}
            >
              <GlyphSwatch glyph={item.glyph} glyphPainter={glyphPainter} />
              {item.name}
            </button>
          </li>
        ))}
      </ul>
      <p className="field-hint">
        Items come from{" "}
        <a href="/items.html" target="_blank" rel="noreferrer">
          the item editor
        </a>
        .
      </p>
    </>
  );
}

function CharacterPalette({
  settings,
  references,
  document,
  startGlyphsByAgent,
  glyphPainter,
  onChange,
  onSelect,
}: {
  settings: ToolSettings;
  references: MapReferences;
  document: MapDocument;
  startGlyphsByAgent: ReadonlyMap<string, Glyph>;
  glyphPainter: GlyphPainter;
  onChange: (changes: Partial<ToolSettings>) => void;
  onSelect: (selection: MapSelection) => void;
}) {
  const placedIds = new Set(document.starts.map((start) => start.agentId));
  return (
    <>
      <ul className="map-palette">
        {references.characters.map((character) => (
          <li key={character.id}>
            <button
              className={settings.agentId === character.id ? "is-active" : ""}
              onClick={() => {
                onChange({ agentId: character.id });
                if (placedIds.has(character.id)) {
                  onSelect({ kind: "start", agentId: character.id });
                }
              }}
            >
              <GlyphSwatch
                glyph={startGlyphsByAgent.get(character.id) ?? null}
                glyphPainter={glyphPainter}
              />
              {character.name || character.id}
              {!placedIds.has(character.id) && <span className="map-unplaced">not placed</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="field-hint">
        Characters come from{" "}
        <a href="/characters.html" target="_blank" rel="noreferrer">
          the character editor
        </a>
        .
      </p>
    </>
  );
}

function PlaceList({
  document,
  selection,
  onSelect,
}: {
  document: MapDocument;
  selection: MapSelection | null;
  onSelect: (selection: MapSelection) => void;
}) {
  return (
    <ul className="map-palette">
      {document.places.map((place) => (
        <li key={place.id}>
          <button
            className={selection?.kind === "place" && selection.id === place.id ? "is-active" : ""}
            onClick={() => onSelect({ kind: "place", id: place.id })}
          >
            {place.name.trim() || "unnamed"}
            {place.isIndoor && <span className="map-unplaced">indoor</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface ToolPanelProps {
  settings: ToolSettings;
  onChange: (changes: Partial<ToolSettings>) => void;
  onSelect: (selection: MapSelection) => void;
  document: MapDocument;
  selection: MapSelection | null;
  references: MapReferences;
  tileTypes: readonly TileType[];
  startGlyphsByAgent: ReadonlyMap<string, Glyph>;
  glyphPainter: GlyphPainter;
  hiddenViews: ReadonlySet<MapView>;
  onToggleView: (view: MapView) => void;
}

/** The left sidebar: tools, what the active tool puts down, and which layers are shown. */
export function ToolPanel(props: ToolPanelProps) {
  const { settings, onChange } = props;
  const isTileTool = TILE_TOOLS.includes(settings.tool);
  return (
    <aside className="editor-sidebar map-tool-panel">
      <div className="map-tools" role="toolbar" aria-label="Tools">
        {(Object.keys(TOOL_LABELS) as MapTool[]).map((tool) => (
          <button
            key={tool}
            className={settings.tool === tool ? "is-active" : ""}
            title={`${TOOL_LABELS[tool]} (${TOOL_SHORTCUTS[tool].toUpperCase()})`}
            onClick={() => onChange({ tool })}
          >
            {TOOL_LABELS[tool]}
          </button>
        ))}
      </div>
      <p className="field-hint">{TOOL_HINTS[settings.tool]}</p>
      {isTileTool && (
        <TilePalette
          settings={settings}
          tileTypes={props.tileTypes}
          glyphPainter={props.glyphPainter}
          onChange={onChange}
        />
      )}
      {settings.tool === "item" && (
        <ItemPalette
          settings={settings}
          references={props.references}
          glyphPainter={props.glyphPainter}
          onChange={onChange}
        />
      )}
      {settings.tool === "start" && (
        <CharacterPalette
          settings={settings}
          references={props.references}
          document={props.document}
          startGlyphsByAgent={props.startGlyphsByAgent}
          glyphPainter={props.glyphPainter}
          onChange={onChange}
          onSelect={props.onSelect}
        />
      )}
      {(settings.tool === "place" || settings.tool === "select") && (
        <PlaceList
          document={props.document}
          selection={props.selection}
          onSelect={props.onSelect}
        />
      )}
      <fieldset className="map-views">
        <legend>Show</legend>
        {MAP_VIEWS.map((view) => (
          <label key={view}>
            <input
              type="checkbox"
              checked={!props.hiddenViews.has(view)}
              onChange={() => props.onToggleView(view)}
            />
            {VIEW_LABELS[view]}
          </label>
        ))}
      </fieldset>
    </aside>
  );
}
