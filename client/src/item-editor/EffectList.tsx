import { useState } from "react";
import {
  EFFECT_TIMINGS,
  NEED_NAMES,
  numberValueSchema,
  rangeValueSchema,
  textValueSchema,
  type Effect,
  type EffectType,
  type ItemFile,
} from "@village/shared";
import { NumberInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import {
  buildEffect,
  EFFECT_FIELD_SPECS,
  EFFECT_TYPES,
  hasMoreModifiers,
  listSubjectsForOwner,
  readEffectField,
  setEffectField,
  type EffectFieldSpec,
  type EffectOwner,
} from "./effect-fields";
import { moveWithin, removeAt, replaceAt } from "./list-edits";
import {
  NumberValueInput,
  OptionalValue,
  RangeValueInput,
  StimulusInput,
  type ReadablePaths,
} from "./value-inputs";
import { Checkbox, Choice, InlineField } from "./widgets";

interface EffectContext {
  file: ItemFile;
  owner: EffectOwner;
  stimuli: readonly string[];
  paths: ReadablePaths;
}

const { numberStep } = clientConfig.itemEditor;
const NO_SUBJECT = "";
const NO_TIMING = "";

function EffectField({
  spec,
  effect,
  onChange,
  context,
}: {
  spec: EffectFieldSpec;
  effect: Effect;
  onChange: (effect: Effect) => void;
  context: EffectContext;
}) {
  const raw = readEffectField(effect, spec.key);
  const set = (value: unknown) => onChange(setEffectField(effect, spec.key, value));
  const { paths, file } = context;
  switch (spec.kind) {
    case "number":
    case "optional_number": {
      const value = numberValueSchema.safeParse(raw).data;
      const input =
        value === undefined ? null : (
          <NumberValueInput value={value} onChange={set} paths={paths} />
        );
      if (spec.kind === "number") return input;
      return (
        <OptionalValue
          label={spec.key}
          isSet={value !== undefined}
          onToggle={(isSet) => set(isSet ? 0 : undefined)}
        >
          {input}
        </OptionalValue>
      );
    }
    case "range": {
      const value = rangeValueSchema.safeParse(raw).data;
      return value === undefined ? null : (
        <RangeValueInput value={value} onChange={set} paths={paths} />
      );
    }
    case "stimulus":
    case "optional_stimulus": {
      const value =
        textValueSchema.safeParse(raw).data ?? (typeof raw === "string" ? raw : undefined);
      const input =
        value === undefined ? null : (
          <StimulusInput value={value} onChange={set} stimuli={context.stimuli} paths={paths} />
        );
      if (spec.kind === "stimulus") return input;
      return (
        <OptionalValue
          label={spec.key}
          isSet={value !== undefined}
          onToggle={(isSet) =>
            set(isSet ? (context.stimuli[0] ?? clientConfig.itemEditor.newStimulusName) : undefined)
          }
        >
          {input}
        </OptionalValue>
      );
    }
    case "boolean":
      return <Checkbox label={spec.key} checked={raw === true} onChange={set} />;
    case "need":
      return <Choice value={String(raw)} choices={NEED_NAMES} onChange={set} />;
    case "condition":
      return (
        <Choice
          value={String(raw)}
          choices={file.conditions.map((condition) => condition.name)}
          onChange={set}
        />
      );
    case "definition":
      return (
        <Choice
          value={String(raw)}
          choices={file.definitions.map((definition) => definition.id)}
          onChange={set}
        />
      );
    case "choice":
      return <Choice value={String(raw)} choices={spec.choices ?? []} onChange={set} />;
  }
}

function MoreModifiers({
  effect,
  onChange,
}: {
  effect: Effect;
  onChange: (effect: Effect) => void;
}) {
  const set = (key: string, value: unknown) => onChange(setEffectField(effect, key, value));
  return (
    <div className="effect-fields">
      <InlineField label="chance">
        <OptionalValue
          label="chance"
          isSet={effect.chance !== undefined}
          onToggle={(isSet) => set("chance", isSet ? 1 : undefined)}
        >
          <NumberInput
            value={effect.chance ?? 1}
            step={numberStep}
            min={0}
            onChange={(chance) => set("chance", chance)}
          />
        </OptionalValue>
      </InlineField>
      <InlineField label="when">
        <Choice
          value={effect.when ?? NO_TIMING}
          choices={[NO_TIMING, ...EFFECT_TIMINGS]}
          labels={{ [NO_TIMING]: "default" }}
          onChange={(when) => set("when", when === NO_TIMING ? undefined : when)}
        />
      </InlineField>
      <Checkbox
        label="requires a hit"
        checked={effect.requiresHit === true}
        onChange={(isChecked) => set("requiresHit", isChecked ? true : undefined)}
      />
    </div>
  );
}

function EffectRow({
  effect,
  position,
  onChange,
  onRemove,
  onMove,
  context,
}: {
  effect: Effect;
  position: number;
  onChange: (effect: Effect) => void;
  onRemove: () => void;
  onMove: (offset: number) => void;
  context: EffectContext;
}) {
  const [isShowingMore, setIsShowingMore] = useState(hasMoreModifiers(effect));
  const subjects = listSubjectsForOwner(context.owner);
  const changeType = (type: EffectType) => {
    const rebuilt = buildEffect(type, context.owner, context.file, [...context.stimuli]);
    onChange(effect.on === undefined ? rebuilt : { ...rebuilt, on: effect.on });
  };
  return (
    <div className="effect-row">
      <div className="effect-fields">
        <span className="effect-position">{position + 1}</span>
        <Choice value={effect.type} choices={EFFECT_TYPES} onChange={changeType} />
        <InlineField label="on">
          <Choice
            value={effect.on ?? NO_SUBJECT}
            choices={context.owner === "verb" ? subjects : [NO_SUBJECT, ...subjects]}
            labels={{ [NO_SUBJECT]: "self" }}
            onChange={(on) =>
              onChange(setEffectField(effect, "on", on === NO_SUBJECT ? undefined : on))
            }
          />
        </InlineField>
        {effect.on === "nearby" && (
          <InlineField label="radius">
            <NumberInput
              value={effect.radius ?? 0}
              min={0}
              onChange={(radius) => onChange(setEffectField(effect, "radius", radius))}
            />
          </InlineField>
        )}
        {EFFECT_FIELD_SPECS[effect.type].map((spec) => (
          <InlineField key={spec.key} label={spec.kind === "boolean" ? "" : spec.key}>
            <EffectField spec={spec} effect={effect} onChange={onChange} context={context} />
          </InlineField>
        ))}
        <span className="effect-actions">
          <button className="icon-button" onClick={() => setIsShowingMore(!isShowingMore)}>
            {isShowingMore ? "less" : "more"}
          </button>
          <button className="icon-button" title="Move up" onClick={() => onMove(-1)}>
            ↑
          </button>
          <button className="icon-button" title="Move down" onClick={() => onMove(1)}>
            ↓
          </button>
          <button className="icon-button" title="Remove effect" onClick={onRemove}>
            ×
          </button>
        </span>
      </div>
      {isShowingMore && <MoreModifiers effect={effect} onChange={onChange} />}
    </div>
  );
}

/** An ordered list of effects; rows can be dragged or moved with the arrows. */
export function EffectList({
  effects,
  onChange,
  ...context
}: EffectContext & { effects: readonly Effect[]; onChange: (effects: Effect[]) => void }) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const addEffect = (type: EffectType) =>
    onChange([...effects, buildEffect(type, context.owner, context.file, [...context.stimuli])]);
  return (
    <div className="row-list">
      {effects.map((effect, index) => (
        <div
          key={index}
          draggable
          onDragStart={() => setDraggedIndex(index)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (draggedIndex !== null) onChange(moveWithin(effects, draggedIndex, index));
            setDraggedIndex(null);
          }}
        >
          <EffectRow
            effect={effect}
            position={index}
            context={context}
            onChange={(changed) => onChange(replaceAt(effects, index, changed))}
            onRemove={() => onChange(removeAt(effects, index))}
            onMove={(offset) => onChange(moveWithin(effects, index, index + offset))}
          />
        </div>
      ))}
      <select
        className="editor-input add-select"
        value=""
        onChange={(event) => {
          const type = EFFECT_TYPES.find((candidate) => candidate === event.target.value);
          if (type !== undefined) addEffect(type);
        }}
      >
        <option value="">+ effect</option>
        {EFFECT_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    </div>
  );
}
