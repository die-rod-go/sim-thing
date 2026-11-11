import type { ReactNode } from "react";
import {
  TRAIT_NAMES,
  type SeedAgent,
  type SeedFile,
  type SeedProblem,
  type SeedRules,
} from "@village/shared";
import { clientConfig } from "../client-config";
import { CommittedTextInput, Field, NumberInput, TextArea, TextInput, TraitSlider } from "./fields";
import { GoalsEditor, InventoryEditor, PeopleNotesEditor } from "./list-editors";
import { selectFieldProblems } from "./seed-edits";

interface CharacterFormProps {
  seedFile: SeedFile;
  agentIndex: number;
  rules: SeedRules;
  problems: readonly SeedProblem[];
  onChange: (agent: SeedAgent) => void;
  onRename: (name: string) => void;
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="form-section">
      <h2>{title}</h2>
      {description !== undefined && <p className="section-description">{description}</p>}
      {children}
    </section>
  );
}

function IdentitySection({ agent, rules, problems, onChange, onRename }: SectionProps) {
  const spawnPlaces = rules.spawnPlaces.includes(agent.spawnPlace)
    ? rules.spawnPlaces
    : [agent.spawnPlace, ...rules.spawnPlaces];
  return (
    <FormSection title="Identity">
      <div className="field-grid">
        <Field label="Name" problems={selectFieldProblems(problems, "name")}>
          {(inputId) => (
            <CommittedTextInput
              id={inputId}
              value={agent.name}
              placeholder="Old Tom"
              onCommit={onRename}
            />
          )}
        </Field>
        <Field
          label="Id"
          hint="Used in memory ids and logs. Follows the name until you change it."
          problems={selectFieldProblems(problems, "id")}
        >
          {(inputId) => (
            <TextInput
              id={inputId}
              value={agent.id}
              onChange={(id) => onChange({ ...agent, id })}
            />
          )}
        </Field>
      </div>
      <Field
        label="Work"
        hint="Their trade and where they do it. Agents only see this as words."
        problems={selectFieldProblems(problems, "profession")}
      >
        {(inputId) => (
          <TextInput
            id={inputId}
            value={agent.profession}
            placeholder="woodcutter; chops wood at the woodlot"
            onChange={(profession) => onChange({ ...agent, profession })}
          />
        )}
      </Field>
      <Field
        label="Starts at"
        hint="Where they wake on day 1. Which cottage is whose home is only what the text says."
        problems={selectFieldProblems(problems, "spawnPlace")}
      >
        {(inputId) => (
          <select
            id={inputId}
            value={agent.spawnPlace}
            onChange={(event) => onChange({ ...agent, spawnPlace: event.target.value })}
          >
            {spawnPlaces.map((place) => (
              <option key={place} value={place}>
                {place}
              </option>
            ))}
          </select>
        )}
      </Field>
    </FormSection>
  );
}

function PersonalitySection({ agent, rules, problems, onChange }: SectionProps) {
  return (
    <FormSection
      title="Personality"
      description="The weekly reflection can shift traits, the core and the self-image over time."
    >
      <div className="trait-sliders">
        {TRAIT_NAMES.map((traitName) => (
          <TraitSlider
            key={traitName}
            traitName={traitName}
            value={agent.traits[traitName]}
            range={rules.traitRange}
            onChange={(value) =>
              onChange({ ...agent, traits: { ...agent.traits, [traitName]: value } })
            }
          />
        ))}
      </div>
      <Field
        label="Core"
        hint="What they value, want and fear, and a secret. Secrets and wants that clash with other characters' make for the best stories."
        problems={selectFieldProblems(problems, "core")}
      >
        {(inputId) => (
          <TextArea
            id={inputId}
            rows={clientConfig.characterEditor.coreTextAreaRows}
            value={agent.core}
            onChange={(core) => onChange({ ...agent, core })}
          />
        )}
      </Field>
      <Field
        label="Self-image"
        hint="How they see themselves. It is most interesting when it isn't quite true."
        problems={selectFieldProblems(problems, "selfImage")}
      >
        {(inputId) => (
          <TextArea
            id={inputId}
            value={agent.selfImage}
            onChange={(selfImage) => onChange({ ...agent, selfImage })}
          />
        )}
      </Field>
    </FormSection>
  );
}

function StartingStateSection({ agent, rules, problems, onChange }: SectionProps) {
  const { min, max } = rules.sleepRecoveryRange;
  return (
    <FormSection title="Starting state">
      <Field label="Mood" problems={selectFieldProblems(problems, "mood")}>
        {(inputId) => (
          <TextInput
            id={inputId}
            value={agent.mood}
            placeholder="Restless and optimistic."
            onChange={(mood) => onChange({ ...agent, mood })}
          />
        )}
      </Field>
      <div className="field-grid">
        <Field label="Coins" problems={selectFieldProblems(problems, "coins")}>
          {(inputId) => (
            <NumberInput
              id={inputId}
              value={agent.coins}
              min={0}
              step={1}
              onChange={(coins) => onChange({ ...agent, coins })}
            />
          )}
        </Field>
        <Field
          label="Sleep recovery per hour"
          hint={`Energy regained per hour of sleep; usually ${min}–${max}.`}
          problems={selectFieldProblems(problems, "sleepRecoveryPerHour")}
        >
          {(inputId) => (
            <NumberInput
              id={inputId}
              value={agent.sleepRecoveryPerHour}
              min={0}
              step={clientConfig.characterEditor.sleepRecoveryStep}
              onChange={(sleepRecoveryPerHour) => onChange({ ...agent, sleepRecoveryPerHour })}
            />
          )}
        </Field>
      </div>
      <h3>Carrying</h3>
      <InventoryEditor
        agent={agent}
        problems={problems}
        onChange={onChange}
        itemNames={rules.itemNames}
      />
    </FormSection>
  );
}

interface SectionProps {
  agent: SeedAgent;
  rules: SeedRules;
  problems: readonly SeedProblem[];
  onChange: (agent: SeedAgent) => void;
  onRename: (name: string) => void;
}

export function CharacterForm(props: CharacterFormProps) {
  const { seedFile, agentIndex, problems, onChange } = props;
  const agent = seedFile.agents[agentIndex];
  if (!agent) return null;
  const sectionProps: SectionProps = { ...props, agent };
  return (
    <div className="character-form">
      <IdentitySection {...sectionProps} />
      <PersonalitySection {...sectionProps} />
      <StartingStateSection {...sectionProps} />
      <FormSection
        title="Goals"
        description="What they are working toward on day 1. Agents rewrite these as they go."
      >
        <GoalsEditor agent={agent} problems={problems} onChange={onChange} />
      </FormSection>
      <FormSection
        title="People notes"
        description="What they already think of each person. Each note becomes a starting memory in the people bucket, so it fades unless it keeps coming up."
      >
        <PeopleNotesEditor
          seedFile={seedFile}
          agentIndex={agentIndex}
          agent={agent}
          problems={problems}
          onChange={onChange}
        />
      </FormSection>
    </div>
  );
}
