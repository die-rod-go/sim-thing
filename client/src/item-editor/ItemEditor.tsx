import { useMemo } from "react";
import { hasItemErrors, type ItemFile, type ItemProblem } from "@village/shared";
import type { ConnectionStatus } from "../net/sim-connection";
import { ComponentPanel } from "./DeclarationPanels";
import { duplicateDefinition } from "./definition-edits";
import { countTabEntries, EDITOR_TABS, type EditorState, type EditorTab } from "./editor-state";
import { ItemPage } from "./ItemPage";
import { RulesPanel } from "./RulesPanel";
import { findDraftProblems, selectEntryProblems } from "./problems";
import { addTabEntry, listTabEntries, removeTabEntry, TAB_LABELS } from "./tab-entries";
import { useItemEditor } from "./use-item-editor";
import { listStimuli, updateVerb } from "./verb-edits";
import { VerbEditor } from "./VerbEditor";
import { ItemProblemList, SideList } from "./widgets";

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  open: "Connected",
  closed: "Disconnected, retrying…",
};

function describeSaveStatus(state: EditorState, isDirty: boolean, problems: ItemProblem[]): string {
  if (state.saveStatus === "saving") return "Saving…";
  if (hasItemErrors(problems)) return "Fix the errors to save";
  if (isDirty) return "Unsaved changes";
  if (state.saveStatus === "saved") return "Saved to seeds/items.json";
  return "No changes";
}

function TabPanel({
  tab,
  file,
  index,
  problems,
  stimuli,
  onEdit,
}: {
  tab: EditorTab;
  file: ItemFile;
  index: number;
  problems: readonly ItemProblem[];
  stimuli: readonly string[];
  onEdit: (file: ItemFile) => void;
}) {
  const panelProps = { file, index, problems, stimuli, onEdit };
  switch (tab) {
    case "items":
      return <ItemPage {...panelProps} definitionIndex={index} />;
    case "verbs": {
      const verb = file.verbs[index];
      if (!verb) return null;
      return (
        <VerbEditor
          key={index}
          verb={verb}
          file={file}
          stimuli={stimuli}
          problems={selectEntryProblems(problems, file, "verbs", index)}
          onChange={(changed) => onEdit(updateVerb(file, index, changed))}
        />
      );
    }
    case "rules":
      return <RulesPanel {...panelProps} />;
    case "components": {
      const name = Object.keys(file.components)[index];
      return name === undefined ? null : (
        <ComponentPanel file={file} name={name} problems={problems} onEdit={onEdit} />
      );
    }
  }
}

export function ItemEditor() {
  const editor = useItemEditor();
  const { state, isDirty } = editor;
  const { draft, tab } = state;
  const selectedIndex = state.selectedIndexes[tab];
  const problems = useMemo(
    () => (draft ? findDraftProblems(draft, { references: state.references }) : []),
    [draft, state.references],
  );
  const stimuli = useMemo(() => (draft ? listStimuli(draft) : []), [draft]);
  const isLive = editor.connectionStatus === "open";
  const canSave =
    isLive &&
    draft !== null &&
    isDirty &&
    !hasItemErrors(problems) &&
    state.saveStatus !== "saving";

  const confirmReload = () => {
    if (!isDirty || window.confirm("Throw away your unsaved changes?")) editor.reload();
  };
  const confirmRemove = () => {
    if (!draft) return;
    const label = listTabEntries(draft, tab, problems)[selectedIndex]?.label ?? "this";
    if (window.confirm(`Remove ${label}?`)) {
      editor.edit(removeTabEntry(draft, tab, selectedIndex), { tab, index: selectedIndex - 1 });
    }
  };
  const addEntry = () => {
    if (!draft) return;
    const changed = addTabEntry(draft, tab, stimuli);
    editor.edit(changed, { tab, index: countTabEntries(changed, tab) - 1 });
  };

  return (
    <div className="editor-app">
      <header className="top-bar">
        <span className={`connection connection-${editor.connectionStatus}`}>
          {CONNECTION_LABELS[editor.connectionStatus]}
        </span>
        <h1 className="editor-title">Items</h1>
        <span className={`save-status save-${state.saveStatus}`}>
          {describeSaveStatus(state, isDirty, problems)}
        </span>
        <div className="button-group editor-actions">
          <button disabled={!isLive || !isDirty} onClick={confirmReload}>
            Discard changes
          </button>
          <button className="primary" disabled={!canSave} onClick={editor.save}>
            Save
          </button>
          <a className="link-button" href="/characters.html">
            Characters
          </a>
          <a className="link-button" href="/">
            Back to the village
          </a>
        </div>
      </header>
      {state.loadError && (
        <div className="banner banner-error">Could not read items.json: {state.loadError}</div>
      )}
      {state.serverProblems.length > 0 && (
        <div className="banner banner-error">
          The server refused to save:
          <ItemProblemList problems={state.serverProblems} showsPath />
        </div>
      )}
      {editor.protocolError && <div className="banner banner-error">{editor.protocolError}</div>}
      {!draft ? (
        <p className="editor-empty muted">
          {state.isLoaded ? "Nothing to edit." : "Loading items from the sim server…"}
        </p>
      ) : (
        <main className="editor-body">
          <aside className="editor-sidebar">
            <nav className="item-tabs">
              {EDITOR_TABS.map((editorTab) => (
                <button
                  key={editorTab}
                  className={editorTab === tab ? "item-tab is-active" : "item-tab"}
                  onClick={() => editor.changeTab(editorTab)}
                >
                  {TAB_LABELS[editorTab]}
                </button>
              ))}
            </nav>
            <SideList
              entries={listTabEntries(draft, tab, problems)}
              selectedIndex={selectedIndex}
              onSelect={(index) => editor.select({ tab, index })}
            />
            <button className="add-button" onClick={addEntry}>
              + new
            </button>
            <p className="field-hint">
              Changes apply on the next server start or `make reset`. This editor only defines
              items: the map places objects and the character editor sets inventories.
            </p>
          </aside>
          <section className="editor-main">
            {countTabEntries(draft, tab) > 0 && (
              <div className="editor-main-heading">
                <h2>{listTabEntries(draft, tab, problems)[selectedIndex]?.label || "Unnamed"}</h2>
                <div className="button-group">
                  {tab === "items" && (
                    <button
                      onClick={() =>
                        editor.edit(duplicateDefinition(draft, selectedIndex), {
                          tab,
                          index: selectedIndex + 1,
                        })
                      }
                    >
                      Duplicate
                    </button>
                  )}
                  <button className="danger" onClick={confirmRemove}>
                    Remove
                  </button>
                </div>
              </div>
            )}
            <TabPanel
              tab={tab}
              file={draft}
              index={selectedIndex}
              problems={problems}
              stimuli={stimuli}
              onEdit={(changed) => editor.edit(changed)}
            />
            <section className="form-section item-problems">
              <h3>Problems</h3>
              {problems.length === 0 ? (
                <p className="muted">none</p>
              ) : (
                <ItemProblemList problems={problems} showsPath />
              )}
            </section>
          </section>
        </main>
      )}
    </div>
  );
}
