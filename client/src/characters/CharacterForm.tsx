import type { ReactNode } from "react";
import {
  STAT_NAMES,
  TRAIT_NAMES,
  type SeedAgent,
  type SeedFile,
  type SeedProblem,
  type SeedRules,
} from "@village/shared";
import { clientConfig } from "../client-config";
import {
  CommittedTextInput,
  Field,
  NumberInput,
  ProblemList,
  StatSlider,
  TextArea,
  TextInput,
  TraitSlider,
} from "./fields";
import { GoalsEditor, InventoryEditor, PeopleEditor, SeenPlacesEditor } from "./list-editors";
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
  const hasStartTile = rules.agentsWithStartTiles.includes(agent.id);
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
        label="Pronouns"
        hint="Shown beside their name wherever another agent's prompt names them. Leave empty if unsure."
        problems={selectFieldProblems(problems, "pronouns")}
      >
        {(inputId) => (
          <TextInput
            id={inputId}
            value={agent.pronouns ?? ""}
            placeholder="they/them"
            onChange={(pronouns) => onChange({ ...agent, pronouns })}
          />
        )}
      </Field>
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
      <p className="field-hint">
        {hasStartTile ? "Has a start tile on the map. " : ""}
        Where they wake on day 1 is set in the{" "}
        <a href="/maps.html" target="_blank" rel="noreferrer">
          map editor
        </a>
        . Which cottage is whose home is only what the text says.
      </p>
      <ProblemList problems={selectFieldProblems(problems, "start")} />
    </FormSection>
  );
}

function PersonalitySection({ agent, rules, problems, onChange }: SectionProps) {
  return (
    <FormSection
      title="Personality"
      description="Where they start. Traits, the core and the self-image can shift over time."
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
      <Field
        label="Voice"
        hint="How they talk, in a sentence or two: their words, rhythm, what they never say. Their reflections may rewrite it."
        problems={selectFieldProblems(problems, "voice")}
      >
        {(inputId) => (
          <TextArea
            id={inputId}
            value={agent.voice ?? ""}
            onChange={(voice) => onChange({ ...agent, voice })}
          />
        )}
      </Field>
      <Field
        label="Routine"
        hint="A usual day: where they are when. They start from it; nothing makes them keep to it."
        problems={selectFieldProblems(problems, "routine")}
      >
        {(inputId) => (
          <TextArea
            id={inputId}
            value={agent.routine ?? ""}
            onChange={(routine) => onChange({ ...agent, routine })}
          />
        )}
      </Field>
    </FormSection>
  );
}

function BodySection({ agent, rules, problems, onChange }: SectionProps) {
  return (
    <FormSection
      title="Body"
      description="Only the character knows these, as words in their own prompt; others learn them by watching. 0.5 is average."
    >
      <div className="trait-sliders">
        {STAT_NAMES.map((statName) => (
          <div key={statName}>
            <StatSlider
              statName={statName}
              value={agent[statName]}
              range={rules.statRange}
              onChange={(value) => onChange({ ...agent, [statName]: value })}
            />
            <ProblemList problems={selectFieldProblems(problems, statName)} />
          </div>
        ))}
      </div>
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
      <h3>Carrying (coins too)</h3>
      <InventoryEditor
        agent={agent}
        problems={problems}
        onChange={onChange}
        inventoryItems={rules.inventoryItems}
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
  const { seedFile, agentIndex, rules, problems, onChange } = props;
  const agent = seedFile.agents[agentIndex];
  if (!agent) return null;
  const sectionProps: SectionProps = { ...props, agent };
  return (
    <div className="character-form">
      <IdentitySection {...sectionProps} />
      <PersonalitySection {...sectionProps} />
      <BodySection {...sectionProps} />
      <StartingStateSection {...sectionProps} />
      <FormSection
        title="Long-term goals"
        description="What they are working toward on day 1, over days and weeks. They rewrite these as they go. Short-term goals they write themselves when the sim starts."
      >
        <GoalsEditor agent={agent} problems={problems} onChange={onChange} />
      </FormSection>
      <FormSection
        title="People"
        description="What they already hold about each person on day 1. Every field is optional and is rewritten as they learn more. People must live in the village."
      >
        <PeopleEditor
          seedFile={seedFile}
          agentIndex={agentIndex}
          agent={agent}
          problems={problems}
          onChange={onChange}
        />
      </FormSection>
      <FormSection
        title="Places seen"
        description="The places they already know on day 1, each with what is really there. Any other place they learn by seeing it."
      >
        <SeenPlacesEditor
          agent={agent}
          problems={problems}
          onChange={onChange}
          placeNames={rules.placeNames}
        />
      </FormSection>
    </div>
  );
}
