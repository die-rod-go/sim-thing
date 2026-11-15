import type { NumberValue } from "@village/shared";
import { NumberInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import { ThingNamePicker } from "./pickers";
import type { ValueSpot } from "./step-owner";
import { Setting } from "./step-settings-shared";
import { listThingNames } from "./value-scope";
import { NumberValueInput, OptionalNumberValueInput } from "./ValueInput";
import { Choice } from "./widgets";

interface OnFields {
  on?: string;
  radius?: number;
  loudness?: NumberValue;
  around?: string;
}

/**
 * The settings each `on` brings with it: a radius for `nearby`, a loudness for `earshot`. Leaving
 * `earshot` drops its loudness; a `sound` step's own loudness is never touched.
 */
function buildOnChanges(on: string | undefined, step: OnFields): Record<string, unknown> {
  const leftEarshot = step.on === "earshot" && on !== "earshot";
  const loudness = leftEarshot ? { loudness: undefined } : {};
  if (on === "nearby") {
    return { on, radius: step.radius ?? clientConfig.itemEditor.newStepRadius, ...loudness };
  }
  if (on === "earshot") {
    return {
      on,
      loudness: step.loudness ?? clientConfig.itemEditor.newStepLoudness,
      radius: undefined,
    };
  }
  return { on, radius: undefined, around: undefined, ...loudness };
}

/**
 * `on`; for `nearby` its radius and for `earshot` its loudness, and what either counts around.
 * `onChange` takes the settings that changed. A step that works on one thing can't fan out.
 */
export function OnSettings({
  step,
  spot,
  isInRule,
  canFanOut = true,
  onChange,
}: {
  step: OnFields;
  spot: ValueSpot;
  isInRule: boolean;
  canFanOut?: boolean;
  onChange: (changes: Record<string, unknown>) => void;
}) {
  const emptyLabel = isInRule ? "self" : undefined;
  const isFanOut = step.on === "nearby" || step.on === "earshot";
  return (
    <>
      <Setting label="on">
        <ThingNamePicker
          value={step.on}
          spot={spot}
          withFanOuts={canFanOut}
          emptyLabel={emptyLabel}
          onChange={(on) => onChange(buildOnChanges(on, step))}
        />
      </Setting>
      {step.on === "nearby" && (
        <Setting label="radius">
          <NumberInput
            value={step.radius ?? clientConfig.itemEditor.newStepRadius}
            min={0}
            onChange={(radius) => onChange({ radius: Math.max(0, Math.round(radius)) })}
          />
        </Setting>
      )}
      {step.on === "earshot" && (
        <Setting label="loudness">
          <NumberValueInput
            value={step.loudness ?? clientConfig.itemEditor.newStepLoudness}
            spot={spot}
            onChange={(loudness) => onChange({ loudness })}
          />
        </Setting>
      )}
      {isFanOut && (
        <Setting label="around">
          <ThingNamePicker
            value={step.around}
            spot={spot}
            emptyLabel={emptyLabel}
            onChange={(around) => onChange({ around })}
          />
        </Setting>
      )}
    </>
  );
}

interface DestinationFields {
  into?: string;
  at?: string;
  limit?: NumberValue;
}

type DestinationKind = "into" | "at";

/** Where `move` and `create` put things: into a thing or at its tile, with an optional limit. */
export function DestinationSettings({
  step,
  spot,
  onChange,
}: {
  step: DestinationFields;
  spot: ValueSpot;
  onChange: (changes: Record<string, unknown>) => void;
}) {
  const kind: DestinationKind = step.into === undefined && step.at !== undefined ? "at" : "into";
  const name = step.into ?? step.at ?? listThingNames(spot)[0] ?? "";
  const place = (nextKind: DestinationKind, nextName: string) =>
    onChange({
      into: nextKind === "into" ? nextName : undefined,
      at: nextKind === "at" ? nextName : undefined,
    });
  return (
    <>
      <Choice
        value={kind}
        choices={["into", "at"]}
        labels={{ into: "into", at: "at the tile of" }}
        onChange={(nextKind) => place(nextKind, name)}
      />
      <ThingNamePicker
        value={name}
        spot={spot}
        onChange={(nextName) => place(kind, nextName ?? name)}
      />
      <OptionalNumberValueInput
        value={step.limit}
        spot={spot}
        emptyLabel="limit"
        onChange={(limit) => onChange({ limit })}
      />
    </>
  );
}
