import { useState } from "react";
import {
  hasItemErrors,
  type ItemDefinition,
  type ItemFile,
  type ItemProblem,
} from "@village/shared";
import { selectEntryProblems } from "./problems";
import { VerbEditor } from "./VerbEditor";
import {
  addVerb,
  buildVerbForDefinition,
  countOtherDefinitionsMatched,
  listVerbIndexesForDefinition,
  updateVerb,
} from "./verb-edits";

/**
 * The verbs whose rule matches this item, worked out live. Editing one edits the verb itself, so
 * each warns how many other items it also applies to.
 */
export function ItemVerbs({
  definition,
  file,
  problems,
  onEdit,
}: {
  definition: ItemDefinition;
  file: ItemFile;
  problems: readonly ItemProblem[];
  onEdit: (file: ItemFile) => void;
}) {
  const [openVerbIndexes, setOpenVerbIndexes] = useState<ReadonlySet<number>>(new Set());
  const verbIndexes = listVerbIndexesForDefinition(file, definition);
  const toggle = (index: number) => {
    const next = new Set(openVerbIndexes);
    if (!next.delete(index)) next.add(index);
    setOpenVerbIndexes(next);
  };
  const addVerbForItem = () => {
    const withVerb = addVerb(file, buildVerbForDefinition(file, definition));
    setOpenVerbIndexes(new Set([...openVerbIndexes, withVerb.verbs.length - 1]));
    onEdit(withVerb);
  };

  return (
    <div className="row-list">
      {verbIndexes.length === 0 && <p className="muted">No verb applies to it yet.</p>}
      {verbIndexes.map((verbIndex) => {
        const verb = file.verbs[verbIndex];
        if (!verb) return null;
        const otherCount = countOtherDefinitionsMatched(file, verb, definition.id);
        const verbProblems = selectEntryProblems(problems, file, "verbs", verbIndex);
        const isOpen = openVerbIndexes.has(verbIndex);
        return (
          <div key={verbIndex} className="row-item">
            <button className="icon-button verb-toggle" onClick={() => toggle(verbIndex)}>
              {isOpen ? "▾" : "▸"} {verb.name || "unnamed verb"}
              {hasItemErrors(verbProblems) && <span className="problem-marker has-errors" />}
            </button>
            {otherCount > 0 && (
              <span className="field-hint">
                {" "}
                Also applies to {otherCount} other item{otherCount === 1 ? "" : "s"}.
              </span>
            )}
            {isOpen && (
              <VerbEditor
                verb={verb}
                file={file}
                problems={verbProblems}
                onChange={(changed) => onEdit(updateVerb(file, verbIndex, changed))}
              />
            )}
          </div>
        );
      })}
      <button className="add-button" onClick={addVerbForItem}>
        + verb
      </button>
    </div>
  );
}
