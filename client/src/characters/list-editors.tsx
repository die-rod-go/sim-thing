import { useState } from "react";
import {
  PERSON_ENTRY_FIELDS,
  type LongTermGoal,
  type PersonEntry,
  type SeedAgent,
  type SeedFile,
  type SeedProblem,
} from "@village/shared";
import { Field, NumberInput, ProblemList, TextArea, TextInput } from "./fields";
import {
  findPersonKey,
  listPersonSubjects,
  selectFieldProblems,
  setPersonEntry,
} from "./seed-edits";

const PERSON_FIELD_LABELS: Record<keyof PersonEntry, string> = {
  whatIThinkOfThem: "What they think of them",
  whatTheyThinkOfMe: "What they believe this person thinks of them",
  whatIWantFromThem: "What they want from them",
  whatTheyWantFromMe: "What they believe this person wants from them",
};

interface AgentEditorProps {
  agent: SeedAgent;
  problems: readonly SeedProblem[];
  onChange: (agent: SeedAgent) => void;
}

/** Starting items by definition id, coins included; the picker lists carriable definitions. */
export function InventoryEditor({
  agent,
  problems,
  onChange,
  inventoryItems,
}: AgentEditorProps & { inventoryItems: readonly { id: string; name: string }[] }) {
  const namesById = new Map(inventoryItems.map((item) => [item.id, item.name]));
  const heldItems = Object.entries(agent.inventory);
  const addableItems = inventoryItems.filter((item) => !(item.id in agent.inventory));
  const setAmount = (itemId: string, amount: number | null) => {
    const inventory = { ...agent.inventory };
    if (amount === null) delete inventory[itemId];
    else inventory[itemId] = amount;
    onChange({ ...agent, inventory });
  };
  return (
    <div className="row-list">
      {heldItems.length === 0 && <p className="muted">Carries nothing.</p>}
      {heldItems.map(([itemId, amount]) => (
        <div className="row-item inventory-row" key={itemId}>
          <span className="inventory-name">{namesById.get(itemId) ?? itemId}</span>
          <NumberInput
            value={amount}
            min={0}
            step={1}
            onChange={(next) => setAmount(itemId, next)}
          />
          <button className="icon-button" onClick={() => setAmount(itemId, null)} title="Remove">
            ×
          </button>
          <ProblemList problems={selectFieldProblems(problems, `inventory.${itemId}`)} />
        </div>
      ))}
      {addableItems.length > 0 && (
        <select
          className="add-select"
          value=""
          aria-label="Add an item"
          onChange={(event) => setAmount(event.target.value, 1)}
        >
          <option value="">+ Add an item…</option>
          {addableItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function GoalRow({
  goal,
  goalIndex,
  problems,
  onChange,
  onRemove,
}: {
  goal: LongTermGoal;
  goalIndex: number;
  problems: readonly SeedProblem[];
  onChange: (goal: LongTermGoal) => void;
  onRemove: () => void;
}) {
  return (
    <div className="row-item goal-row">
      <div className="goal-row-heading">
        <span className="muted">Goal {goalIndex + 1}</span>
        <button className="icon-button" onClick={onRemove} title="Remove goal">
          ×
        </button>
      </div>
      <Field label="What" problems={selectFieldProblems(problems, `goals.${goalIndex}`)}>
        {(inputId) => (
          <TextInput
            id={inputId}
            value={goal.goal}
            placeholder="Win Mara's business away from Edwin"
            onChange={(text) => onChange({ ...goal, goal: text })}
          />
        )}
      </Field>
      <Field label="Why">
        {(inputId) => (
          <TextInput
            id={inputId}
            value={goal.reason}
            onChange={(reason) => onChange({ ...goal, reason })}
          />
        )}
      </Field>
      <Field label="Progress so far">
        {(inputId) => (
          <TextInput
            id={inputId}
            value={goal.progress}
            placeholder="Not started"
            onChange={(progress) => onChange({ ...goal, progress })}
          />
        )}
      </Field>
    </div>
  );
}

export function GoalsEditor({ agent, problems, onChange }: AgentEditorProps) {
  const setGoals = (goals: LongTermGoal[]) => onChange({ ...agent, goals });
  return (
    <div className="row-list">
      {agent.goals.length === 0 && <p className="muted">No goals yet.</p>}
      {agent.goals.map((goal, goalIndex) => (
        <GoalRow
          key={goalIndex}
          goal={goal}
          goalIndex={goalIndex}
          problems={problems}
          onChange={(updated) =>
            setGoals(
              agent.goals.map((existing, index) => (index === goalIndex ? updated : existing)),
            )
          }
          onRemove={() => setGoals(agent.goals.filter((_goal, index) => index !== goalIndex))}
        />
      ))}
      <button
        className="add-button"
        onClick={() => setGoals([...agent.goals, { goal: "", reason: "", progress: "" }])}
      >
        + Add a goal
      </button>
    </div>
  );
}

/** What the character starts out holding about each person: four optional fields each. */
export function PeopleEditor({
  seedFile,
  agentIndex,
  problems,
  onChange,
}: AgentEditorProps & { seedFile: SeedFile; agentIndex: number }) {
  const [newPersonName, setNewPersonName] = useState("");
  const agent = seedFile.agents[agentIndex];
  if (!agent) return null;
  const { villagers, strangers } = listPersonSubjects(seedFile, agentIndex);
  const renderPerson = (personName: string, isStranger: boolean) => {
    const personKey = findPersonKey(agent, personName);
    const entry = agent.people[personKey] ?? {};
    return (
      <div className="row-item" key={personName}>
        <div className="goal-row-heading">
          <strong>{isStranger ? `${personName} (not in the village)` : personName}</strong>
          {isStranger && (
            <button
              className="icon-button"
              onClick={() => onChange(setPersonEntry(agent, personKey, null))}
            >
              Remove
            </button>
          )}
        </div>
        <ProblemList problems={selectFieldProblems(problems, `people.${personKey}`)} />
        {PERSON_ENTRY_FIELDS.map((field) => (
          <Field key={field} label={PERSON_FIELD_LABELS[field]}>
            {(inputId) => (
              <TextArea
                id={inputId}
                value={entry[field] ?? ""}
                placeholder="Leave blank for nothing yet."
                onChange={(text) =>
                  onChange(setPersonEntry(agent, personKey, { ...entry, [field]: text }))
                }
              />
            )}
          </Field>
        ))}
      </div>
    );
  };
  const addStranger = () => {
    const personName = newPersonName.trim();
    if (personName === "") return;
    onChange(setPersonEntry(agent, findPersonKey(agent, personName), {}));
    setNewPersonName("");
  };
  return (
    <div className="row-list">
      {villagers.length === 0 && <p className="muted">Nobody else lives here yet.</p>}
      {villagers.map((personName) => renderPerson(personName, false))}
      {strangers.map((personName) => renderPerson(personName, true))}
      <form
        className="add-person"
        onSubmit={(event) => {
          event.preventDefault();
          addStranger();
        }}
      >
        <TextInput
          value={newPersonName}
          placeholder="Name of someone in the village"
          onChange={setNewPersonName}
        />
        <button type="submit" disabled={newPersonName.trim() === ""}>
          Add person
        </button>
      </form>
    </div>
  );
}

/** The map's places as a multi-select: the ones ticked are already seen when the sim starts. */
export function SeenPlacesEditor({
  agent,
  problems,
  onChange,
  placeNames,
}: AgentEditorProps & { placeNames: readonly string[] }) {
  const seenNames = new Set(agent.seenPlaces);
  const offMapNames = agent.seenPlaces.filter((placeName) => !placeNames.includes(placeName));
  const setSeen = (placeName: string, isSeen: boolean) =>
    onChange({
      ...agent,
      seenPlaces: [...placeNames, ...offMapNames].filter((candidate) =>
        candidate === placeName ? isSeen : seenNames.has(candidate),
      ),
    });
  const setAll = (isSeen: boolean) =>
    onChange({ ...agent, seenPlaces: isSeen ? [...placeNames] : [] });
  return (
    <div className="row-list">
      {placeNames.length === 0 && <p className="muted">The map has no places yet.</p>}
      <div className="place-options">
        {[...placeNames, ...offMapNames].map((placeName) => (
          <label className="place-option" key={placeName}>
            <input
              type="checkbox"
              checked={seenNames.has(placeName)}
              onChange={(event) => setSeen(placeName, event.target.checked)}
            />
            {placeName}
          </label>
        ))}
      </div>
      <div className="place-actions">
        <button onClick={() => setAll(true)}>All</button>
        <button onClick={() => setAll(false)}>None</button>
      </div>
      <ProblemList problems={selectFieldProblems(problems, "seenPlaces")} />
    </div>
  );
}
