import {
  hasItemErrors,
  listDefinitionViews,
  matchesThing,
  type ItemDefinition,
  type ItemFile,
  type ItemProblem,
} from "@village/shared";
import type { TabSelection } from "./editor-state";
import { selectEntryProblems } from "./problems";
import {
  addVerb,
  buildVerbForDefinition,
  countOtherDefinitionsMatched,
  listVerbIndexesForDefinition,
} from "./verb-edits";

function listAimedVerbIndexes(file: ItemFile, definition: ItemDefinition): number[] {
  const views = listDefinitionViews(file, definition);
  return file.verbs.flatMap((verb, index) => {
    const { target } = verb;
    return target !== undefined && views.some((view) => matchesThing(target, view)) ? [index] : [];
  });
}

function VerbLink({
  file,
  verbIndex,
  problems,
  note,
  onOpen,
}: {
  file: ItemFile;
  verbIndex: number;
  problems: readonly ItemProblem[];
  note?: string;
  onOpen: (selection: TabSelection) => void;
}) {
  const verb = file.verbs[verbIndex];
  if (!verb) return null;
  const verbProblems = selectEntryProblems(problems, file, "verbs", verbIndex);
  return (
    <div className="row-item">
      <button className="add-button" onClick={() => onOpen({ tab: "verbs", index: verbIndex })}>
        {verb.name || "unnamed verb"}
        {hasItemErrors(verbProblems) && <span className="problem-marker has-errors" />}
      </button>
      {note !== undefined && <span className="field-hint"> {note}</span>}
    </div>
  );
}

/** The verbs whose matchers meet this item, each opening in the Verbs tab. */
export function ItemVerbs({
  definition,
  file,
  problems,
  onEdit,
  onOpen,
}: {
  definition: ItemDefinition;
  file: ItemFile;
  problems: readonly ItemProblem[];
  onEdit: (file: ItemFile, selection?: TabSelection) => void;
  onOpen: (selection: TabSelection) => void;
}) {
  const verbIndexes = listVerbIndexesForDefinition(file, definition);
  const aimedIndexes = listAimedVerbIndexes(file, definition);
  const addVerbForItem = () =>
    onEdit(addVerb(file, buildVerbForDefinition(file, definition)), {
      tab: "verbs",
      index: file.verbs.length,
    });

  return (
    <div className="row-list">
      {verbIndexes.length === 0 && <p className="muted">No verb applies to it yet.</p>}
      {verbIndexes.map((verbIndex) => {
        const verb = file.verbs[verbIndex];
        const otherCount = verb ? countOtherDefinitionsMatched(file, verb, definition.id) : 0;
        const note =
          otherCount > 0
            ? `also applies to ${otherCount} other item${otherCount === 1 ? "" : "s"}`
            : undefined;
        return (
          <VerbLink
            key={verbIndex}
            file={file}
            verbIndex={verbIndex}
            problems={problems}
            note={note}
            onOpen={onOpen}
          />
        );
      })}
      <button className="add-button" onClick={addVerbForItem}>
        + verb
      </button>
      {aimedIndexes.length > 0 && (
        <div className="aimed-verbs">
          <h4>Verbs that can be aimed at it</h4>
          {aimedIndexes.map((verbIndex) => (
            <VerbLink
              key={verbIndex}
              file={file}
              verbIndex={verbIndex}
              problems={problems}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
