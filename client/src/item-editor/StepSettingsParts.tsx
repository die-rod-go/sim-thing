import type { NumberValue } from "@village/shared";
import { NumberInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import { ThingNamePicker } from "./pickers";
import type { ValueSpot } from "./step-owner";
import { Setting } from "./step-settings-shared";
import { listThingNames } from "./value-scope";
import { OptionalNumberValueInput } from "./ValueInput";
import { Choice } from "./widgets";

interface OnFields {
  on?: string;
  radius?: number;
  around?: string;
}

/** `on`, and for `nearby` its radius and what it counts around. `onChange` takes the settings that changed. */
export function OnSettings({
  step,
  spot,
  isInRule,
  onChange,
}: {
  step: OnFields;
  spot: ValueSpot;
  isInRule: boolean;
  onChange: (changes: Record<string, unknown>) => void;
}) {
  const emptyLabel = isInRule ? "self" : undefined;
  return (
    <>
      <Setting label="on">
        <ThingNamePicker
          value={step.on}
          spot={spot}
          withNearby
          emptyLabel={emptyLabel}
          onChange={(on) =>
            onChange(
              on === "nearby"
                ? { on, radius: step.radius ?? clientConfig.itemEditor.newStepRadius }
                : { on, radius: undefined, around: undefined },
            )
          }
        />
      </Setting>
      {step.on === "nearby" && (
        <>
          <Setting label="radius">
            <NumberInput
              value={step.radius ?? clientConfig.itemEditor.newStepRadius}
              min={0}
              onChange={(radius) => onChange({ radius: Math.max(0, Math.round(radius)) })}
            />
          </Setting>
          <Setting label="around">
            <ThingNamePicker
              value={step.around}
              spot={spot}
              emptyLabel={emptyLabel}
              onChange={(around) => onChange({ around })}
            />
          </Setting>
        </>
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
