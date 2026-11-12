import { useEffect, useMemo, useRef, useState } from "react";
import type { Glyph, MapProblem } from "@village/shared";
import { clientConfig } from "../client-config";
import { toCssColor } from "../format/agent-colors";
import type { GlyphPainter } from "../village/glyph-painter";
import { pickAgentColor } from "../village/village-geometry";
import { InspectorPanel } from "./InspectorPanel";
import { MapCanvas } from "./MapCanvas";
import type { MapDocument } from "./map-document";
import type { MapView } from "./map-painting";
import { removeSelection, type MapSelection } from "./map-selection";
import { ToolPanel, TOOL_SHORTCUTS } from "./ToolPanel";
import type { MapEditorClient } from "./use-map-editor";
import { useMapTools, type MapTool } from "./use-map-tools";

const TOOL_CURSORS: Record<MapTool, string> = {
  select: "default",
  paint: "crosshair",
  rectangle: "crosshair",
  fill: "cell",
  erase: "crosshair",
  place: "crosshair",
  item: "copy",
  start: "copy",
};

function isTypingInField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function stepZoom(zoom: number, direction: 1 | -1): number {
  const levels = clientConfig.mapEditor.zoomLevels;
  const currentIndex = levels.findIndex((level) => level >= zoom);
  const nextIndex = Math.min(levels.length - 1, Math.max(0, currentIndex + direction));
  return levels[nextIndex] ?? zoom;
}

/** Undo, redo, delete and tool keys, ignored while typing in a field. */
function useEditorShortcuts(input: {
  editor: MapEditorClient;
  onPickTool: (tool: MapTool) => void;
}) {
  const { editor, onPickTool } = input;
  const { draft, selection } = editor.state;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingInField(event.target)) return;
      const key = event.key.toLowerCase();
      const isCommand = event.ctrlKey || event.metaKey;
      if (isCommand && key === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (isCommand && key === "y") {
        event.preventDefault();
        editor.redo();
        return;
      }
      if (isCommand || event.altKey) return;
      if ((key === "delete" || key === "backspace") && draft && selection) {
        event.preventDefault();
        editor.edit(removeSelection(draft, selection), { selection: null });
        return;
      }
      if (key === "escape") {
        editor.select(null);
        return;
      }
      const tool = (Object.keys(TOOL_SHORTCUTS) as MapTool[]).find(
        (candidate) => TOOL_SHORTCUTS[candidate] === key,
      );
      if (tool) onPickTool(tool);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, draft, selection, onPickTool]);
}

function useGlyphLookups(editor: MapEditorClient) {
  const { tileTypes, references } = editor.state;
  return useMemo(() => {
    const glyphsByGid = new Map<number, Glyph>();
    for (const tileType of tileTypes) {
      if (tileType.glyph) glyphsByGid.set(tileType.gid, tileType.glyph);
    }
    const itemGlyphsByDefinition = new Map(
      references.placeableItems.map((item) => [item.id, item.glyph]),
    );
    const startGlyphsByAgent = new Map<string, Glyph>(
      references.characters.map((character, characterIndex) => [
        character.id,
        {
          index: clientConfig.village.agentGlyphIndex,
          color: toCssColor(pickAgentColor(characterIndex)),
        },
      ]),
    );
    return { glyphsByGid, itemGlyphsByDefinition, startGlyphsByAgent };
  }, [tileTypes, references]);
}

export interface MapWorkspaceProps {
  editor: MapEditorClient;
  document: MapDocument;
  glyphPainter: GlyphPainter;
  problems: readonly MapProblem[];
}

/** The loaded map: tools on the left, the map in the middle, the inspector on the right. */
export function MapWorkspace({ editor, document, glyphPainter, problems }: MapWorkspaceProps) {
  const { references, tileTypes, selection } = editor.state;
  const tools = useMapTools({ editor, references });
  const { changeSettings } = tools;
  const [zoom, setZoom] = useState<number>(clientConfig.mapEditor.defaultZoom);
  const [hiddenViews, setHiddenViews] = useState<ReadonlySet<MapView>>(new Set());
  const lookups = useGlyphLookups(editor);
  const pickTool = useMemo(() => (tool: MapTool) => changeSettings({ tool }), [changeSettings]);
  useEditorShortcuts({ editor, onPickTool: pickTool });

  const toggleView = (view: MapView) => {
    setHiddenViews((current) => {
      const next = new Set(current);
      if (next.has(view)) next.delete(view);
      else next.add(view);
      return next;
    });
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scrollArea = scrollRef.current;
    if (!scrollArea) return;
    // A native listener, because React's wheel listener is passive and can't stop the page zoom.
    const zoomWithWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((current) => stepZoom(current, event.deltaY < 0 ? 1 : -1));
    };
    scrollArea.addEventListener("wheel", zoomWithWheel, { passive: false });
    return () => scrollArea.removeEventListener("wheel", zoomWithWheel);
  }, []);

  const hoveredTile = tools.hoveredTile;
  const groundFill = tileTypes.find((tileType) => tileType.gid === tools.settings.tileGid);
  const settings = clientConfig.mapEditor;

  return (
    <main className="editor-body">
      <ToolPanel
        settings={tools.settings}
        onChange={changeSettings}
        onSelect={editor.select}
        document={document}
        selection={selection}
        references={references}
        tileTypes={tileTypes}
        startGlyphsByAgent={lookups.startGlyphsByAgent}
        glyphPainter={glyphPainter}
        hiddenViews={hiddenViews}
        onToggleView={toggleView}
      />
      <section className="map-stage">
        <div className="map-stage-bar">
          <div className="button-group">
            <button onClick={() => setZoom((current) => stepZoom(current, -1))}>−</button>
            <span className="map-zoom">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((current) => stepZoom(current, 1))}>+</button>
          </div>
          <span className="muted">
            {document.width} × {document.height} tiles
            {hoveredTile && ` · tile ${hoveredTile.x}, ${hoveredTile.y}`}
          </span>
          <span className="muted map-stage-tip">Ctrl+wheel zooms. Ctrl+Z undoes.</span>
        </div>
        <div className="map-scroll" ref={scrollRef}>
          <MapCanvas
            document={document}
            glyphPainter={glyphPainter}
            glyphsByGid={lookups.glyphsByGid}
            itemGlyphsByDefinition={lookups.itemGlyphsByDefinition}
            startGlyphsByAgent={lookups.startGlyphsByAgent}
            fallbackItemGlyph={settings.unknownItemGlyph}
            fallbackStartGlyph={{
              index: clientConfig.village.agentGlyphIndex,
              color: settings.unknownCharacterColor,
            }}
            hiddenViews={hiddenViews}
            zoom={zoom}
            selection={selection}
            hoveredTile={hoveredTile}
            preview={tools.preview}
            cursor={TOOL_CURSORS[tools.settings.tool]}
            onPressTile={tools.pressTile}
            onDragTo={tools.dragTo}
            onRelease={tools.release}
          />
        </div>
      </section>
      <InspectorPanel
        document={document}
        selection={selection}
        references={references}
        groundFill={groundFill}
        problems={problems}
        onEdit={(edited, nextSelection?: MapSelection | null) =>
          editor.edit(edited, { selection: nextSelection })
        }
      />
    </main>
  );
}
