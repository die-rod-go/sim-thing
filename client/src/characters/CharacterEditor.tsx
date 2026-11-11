import { useMemo } from "react";
import {
  findSeedFileProblems,
  hasSeedErrors,
  type SeedFile,
  type SeedProblem,
} from "@village/shared";
import { toCssColor } from "../format/agent-colors";
import type { ConnectionStatus } from "../net/sim-connection";
import { pickAgentColor } from "../village/village-geometry";
import { CharacterForm } from "./CharacterForm";
import type { EditorState } from "./editor-state";
import { ProblemList } from "./fields";
import {
  addAgent,
  duplicateAgent,
  moveAgent,
  removeAgent,
  renameAgent,
  selectAgentProblems,
  updateAgent,
  withoutBlankNotes,
} from "./seed-edits";
import { useSeedEditor } from "./use-seed-editor";

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  open: "Connected",
  closed: "Disconnected, retrying…",
};

function describeSaveStatus(state: EditorState, isDirty: boolean, problems: SeedProblem[]): string {
  if (state.saveStatus === "saving") return "Saving…";
  if (hasSeedErrors(problems)) return "Fix the errors to save";
  if (isDirty) return "Unsaved changes";
  if (state.saveStatus === "saved") {
    return state.wasWorldReset ? "Saved, and the village restarted" : "Saved to seeds/agents.json";
  }
  return "No changes";
}

function CharacterList({
  seedFile,
  selectedIndex,
  problems,
  onSelect,
}: {
  seedFile: SeedFile;
  selectedIndex: number;
  problems: readonly SeedProblem[];
  onSelect: (agentIndex: number) => void;
}) {
  return (
    <ol className="character-list">
      {seedFile.agents.map((agent, agentIndex) => {
        const agentProblems = selectAgentProblems(problems, agentIndex);
        const marker = hasSeedErrors(agentProblems)
          ? "has-errors"
          : agentProblems.length > 0
            ? "has-warnings"
            : "";
        return (
          <li key={agentIndex}>
            <button
              className={
                agentIndex === selectedIndex ? "character-item is-active" : "character-item"
              }
              onClick={() => onSelect(agentIndex)}
            >
              <span
                className="color-dot"
                style={{ background: toCssColor(pickAgentColor(agentIndex)) }}
              />
              <span className="character-item-text">
                <span className="character-item-name">{agent.name.trim() || "Unnamed"}</span>
                <span className="character-item-work">{agent.profession || "no work yet"}</span>
              </span>
              {marker !== "" && <span className={`problem-marker ${marker}`} />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function CharacterEditor() {
  const editor = useSeedEditor();
  const { state, isDirty } = editor;
  const { draft, rules, newAgentTemplate, selectedIndex } = state;
  const problems = useMemo(
    () => (draft && rules ? findSeedFileProblems(withoutBlankNotes(draft), rules) : []),
    [draft, rules],
  );
  const isLive = editor.connectionStatus === "open";
  const canSave =
    isLive && draft !== null && !hasSeedErrors(problems) && state.saveStatus !== "saving";
  const selectedAgent = draft?.agents[selectedIndex];

  const confirmSaveAndRestart = () => {
    const isConfirmed = window.confirm(
      "Save the characters and restart the village? This wipes the running sim and reseeds every agent from the file.",
    );
    if (isConfirmed) editor.save(true);
  };
  const confirmReload = () => {
    if (!isDirty || window.confirm("Throw away your unsaved changes?")) editor.reload();
  };
  const confirmRemove = () => {
    if (!draft || !selectedAgent) return;
    const name = selectedAgent.name.trim() || "this character";
    const isConfirmed = window.confirm(
      `Remove ${name}? Other characters' notes about them are removed too.`,
    );
    if (isConfirmed) editor.edit(removeAgent(draft, selectedIndex), selectedIndex - 1);
  };

  return (
    <div className="editor-app">
      <header className="top-bar">
        <span className={`connection connection-${editor.connectionStatus}`}>
          {CONNECTION_LABELS[editor.connectionStatus]}
        </span>
        <h1 className="editor-title">Characters</h1>
        <span className={`save-status save-${state.saveStatus}`}>
          {describeSaveStatus(state, isDirty, problems)}
        </span>
        <div className="button-group editor-actions">
          <button disabled={!isLive || !isDirty} onClick={confirmReload}>
            Discard changes
          </button>
          <button disabled={!canSave || !isDirty} onClick={() => editor.save(false)}>
            Save
          </button>
          <button className="primary" disabled={!canSave} onClick={confirmSaveAndRestart}>
            Save and restart village
          </button>
          <a className="link-button" href="/">
            Back to the village
          </a>
        </div>
      </header>
      {state.loadError && (
        <div className="banner banner-error">Could not read the seed file: {state.loadError}</div>
      )}
      {state.serverProblems.length > 0 && (
        <div className="banner banner-error">
          The server refused to save:
          <ProblemList problems={state.serverProblems} />
        </div>
      )}
      {editor.protocolError && <div className="banner banner-error">{editor.protocolError}</div>}
      {!draft || !rules || !newAgentTemplate ? (
        <p className="editor-empty muted">
          {state.isLoaded ? "Nothing to edit." : "Loading characters from the sim server…"}
        </p>
      ) : (
        <main className="editor-body">
          <aside className="editor-sidebar">
            <CharacterList
              seedFile={draft}
              selectedIndex={selectedIndex}
              problems={problems}
              onSelect={editor.select}
            />
            <button
              className="add-button"
              onClick={() =>
                editor.edit(
                  addAgent(draft, newAgentTemplate, rules.spawnPlaces),
                  draft.agents.length,
                )
              }
            >
              + New character
            </button>
            <ProblemList problems={problems.filter((problem) => problem.agentIndex === null)} />
            <p className="field-hint">
              Changes apply when the village restarts from the seed file. Saving alone keeps the
              running sim as it is.
            </p>
          </aside>
          {selectedAgent && (
            <section className="editor-main">
              <div className="editor-main-heading">
                <h2>{selectedAgent.name.trim() || "Unnamed character"}</h2>
                <div className="button-group">
                  <button
                    disabled={selectedIndex === 0}
                    onClick={() =>
                      editor.edit(moveAgent(draft, selectedIndex, -1), selectedIndex - 1)
                    }
                    title="Move up the list"
                  >
                    ↑
                  </button>
                  <button
                    disabled={selectedIndex === draft.agents.length - 1}
                    onClick={() =>
                      editor.edit(moveAgent(draft, selectedIndex, 1), selectedIndex + 1)
                    }
                    title="Move down the list"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() =>
                      editor.edit(duplicateAgent(draft, selectedIndex), selectedIndex + 1)
                    }
                  >
                    Duplicate
                  </button>
                  <button className="danger" onClick={confirmRemove}>
                    Remove
                  </button>
                </div>
              </div>
              <CharacterForm
                key={selectedIndex}
                seedFile={draft}
                agentIndex={selectedIndex}
                rules={rules}
                problems={selectAgentProblems(problems, selectedIndex)}
                onChange={(agent) => editor.edit(updateAgent(draft, selectedIndex, agent))}
                onRename={(name) => editor.edit(renameAgent(draft, selectedIndex, name))}
              />
            </section>
          )}
        </main>
      )}
    </div>
  );
}
