import { useEffect, useMemo, useState } from "react";
import type { ItemDefinition } from "@village/shared";
import { describeGodTool, type GodTool } from "./god-mode";
import type { GodMode } from "./use-god-mode";

interface GodPanelProps {
  godMode: GodMode;
  itemDefinitions: readonly ItemDefinition[];
  /** The agents' body definition, which can't be placed as an item. */
  agentBodyId: string;
  refusal: string | null;
  /** Whether a god action was sent and the server has not answered yet. */
  isActionPending: boolean;
  onPause: () => void;
  /** Says the words to every living agent, as a voice from the sky; false if nothing was sent. */
  onSpeak: (words: string) => boolean;
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

interface SpeakDraft {
  words: string;
  setWords: (words: string) => void;
  isAwaitingAnswer: boolean;
  isDisconnected: boolean;
  speak: () => void;
}

/**
 * The words stay in the box until the server says they were spoken, so nothing typed is lost to a
 * dropped connection or to the sim resuming while the words waited for the minute in progress.
 */
function useSpeakDraft(
  isActionPending: boolean,
  refusal: string | null,
  onSpeak: (words: string) => boolean,
): SpeakDraft {
  const [words, setWords] = useState("");
  const [isAwaitingAnswer, setIsAwaitingAnswer] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  useEffect(() => {
    if (!isAwaitingAnswer || isActionPending) return;
    setIsAwaitingAnswer(false);
    if (refusal === null) setWords("");
  }, [isAwaitingAnswer, isActionPending, refusal]);
  const speak = () => {
    if (words.trim() === "" || isActionPending) return;
    const isSent = onSpeak(words.trim());
    setIsDisconnected(!isSent);
    setIsAwaitingAnswer(isSent);
  };
  return { words, setWords, isAwaitingAnswer, isDisconnected, speak };
}

function SpeakForm({ draft }: { draft: SpeakDraft }) {
  const { words, setWords, isAwaitingAnswer, isDisconnected, speak } = draft;
  const canSpeak = words.trim() !== "" && !isAwaitingAnswer;
  return (
    <form
      className="god-speak"
      onSubmit={(event) => {
        event.preventDefault();
        speak();
      }}
    >
      <label htmlFor="god-speak-words">Speak to everyone from the sky</label>
      <textarea
        id="god-speak-words"
        placeholder="Words every villager will hear…"
        value={words}
        onChange={(event) => setWords(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            speak();
          }
        }}
      />
      <button type="submit" disabled={!canSpeak}>
        Speak
      </button>
      {isAwaitingAnswer && (
        <p className="god-hint">Waiting for the minute in progress to finish before speaking…</p>
      )}
      {isDisconnected && (
        <p className="god-refusal">Not connected to the sim, so nothing was said.</p>
      )}
    </form>
  );
}

/** God mode's tools: pick up and move people and things, place and delete things, speak to all. */
export function GodPanel({
  godMode,
  itemDefinitions,
  agentBodyId,
  refusal,
  isActionPending,
  onPause,
  onSpeak,
}: GodPanelProps) {
  const { tool, setTool } = godMode;
  const speakDraft = useSpeakDraft(isActionPending, refusal, onSpeak);
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
          <SpeakForm draft={speakDraft} />
        </>
      )}
      {refusal !== null && <p className="god-refusal">{refusal}</p>}
    </div>
  );
}
