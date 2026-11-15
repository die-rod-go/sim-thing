import { useMemo, useState } from "react";
import type { ItemDefinition } from "@village/shared";
import { describeGodTool, type GodTool } from "./god-mode";
import type { GodMode } from "./use-god-mode";

interface GodPanelProps {
  godMode: GodMode;
  itemDefinitions: readonly ItemDefinition[];
  /** The agents' body definition, which can't be placed as an item. */
  agentBodyId: string;
  refusal: string | null;
  onPause: () => void;
}

const TOOL_BUTTONS: { label: string; tool: GodTool }[] = [
  { label: "Move", tool: { kind: "grab" } },
  { label: "Place", tool: { kind: "place", definitionId: null } },
  { label: "Delete", tool: { kind: "delete" } },
];

function isSameToolKind(current: GodTool, button: GodTool): boolean {
  if (button.kind === "grab") return current.kind === "grab" || current.kind === "holding";
  return current.kind === button.kind;
}

function stopPropagation(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

function DefinitionPicker({
  definitions,
  chosenId,
  onChoose,
}: {
  definitions: readonly ItemDefinition[];
  chosenId: string | null;
  onChoose: (definitionId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    return definitions.filter(
      (definition) =>
        definition.name.toLowerCase().includes(words) || definition.id.includes(words),
    );
  }, [definitions, search]);
  return (
    <div className="god-picker">
      <input
        type="search"
        placeholder="Search items…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <ul className="god-picker-list">
        {shown.map((definition) => (
          <li key={definition.id}>
            <button
              type="button"
              className={definition.id === chosenId ? "is-active" : undefined}
              onClick={() => onChoose(definition.id)}
            >
              {definition.name}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="god-muted">Nothing matches.</li>}
      </ul>
    </div>
  );
}

/** God mode's tools: pick up and move people and things, place new things, delete them. */
export function GodPanel({
  godMode,
  itemDefinitions,
  agentBodyId,
  refusal,
  onPause,
}: GodPanelProps) {
  const { tool, setTool } = godMode;
  const placeable = useMemo(
    () => itemDefinitions.filter((definition) => definition.id !== agentBodyId),
    [itemDefinitions, agentBodyId],
  );
  return (
    <div
      className="god-panel"
      role="dialog"
      aria-label="God mode"
      onPointerDown={stopPropagation}
      onWheel={stopPropagation}
    >
      <div className="god-panel-title">
        <strong>God mode</strong>
        <button
          type="button"
          className="god-panel-close"
          aria-label="Close god mode"
          onClick={() => godMode.setOn(false)}
        >
          ×
        </button>
      </div>
      {!godMode.canEdit ? (
        <div className="god-paused-notice">
          <span>Pause the sim to change the world.</span>
          <button type="button" onClick={onPause}>
            Pause
          </button>
        </div>
      ) : (
        <>
          <div className="god-tools" role="toolbar" aria-label="God tools">
            {TOOL_BUTTONS.map((button) => (
              <button
                key={button.label}
                type="button"
                className={isSameToolKind(tool, button.tool) ? "is-active" : undefined}
                onClick={() => setTool(button.tool)}
              >
                {button.label}
              </button>
            ))}
          </div>
          <p className="god-hint">{describeGodTool(tool)}</p>
          {tool.kind === "place" && (
            <DefinitionPicker
              definitions={placeable}
              chosenId={tool.definitionId}
              onChoose={(definitionId) => setTool({ kind: "place", definitionId })}
            />
          )}
          {refusal !== null && <p className="god-refusal">{refusal}</p>}
        </>
      )}
    </div>
  );
}
