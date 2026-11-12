import type { FieldValueInput, ItemFile } from "@village/shared";
import { ComponentPathPicker } from "./pickers";
import type { ValueSpot } from "./step-owner";
import {
  buildStartingFieldValue,
  findFieldDeclaration,
  withRecordEntry,
  withRecordKeyRenamed,
} from "./step-fields";
import { FieldSlotValueInput } from "./ValueInput";
import { Checkbox } from "./widgets";

type FieldValues = Readonly<Record<string, FieldValueInput>>;

/** `add`'s fields: one row per field of the component, each set or left to the default. */
export function ComponentFieldValues({
  component,
  fields,
  file,
  spot,
  onChange,
}: {
  component: string;
  fields: FieldValues | undefined;
  file: ItemFile;
  spot: ValueSpot;
  onChange: (fields: FieldValues | undefined) => void;
}) {
  const declarations = Object.entries(file.components[component]?.fields ?? {});
  return (
    <div className="step-field-rows">
      {declarations.map(([name, declaration]) => {
        const value = fields?.[name];
        return (
          <span key={name} className="step-field-row">
            <Checkbox
              label={name}
              checked={value !== undefined}
              onChange={(isSet) =>
                onChange(
                  withRecordEntry(
                    fields,
                    name,
                    isSet ? buildStartingFieldValue(declaration) : undefined,
                  ),
                )
              }
            />
            {value !== undefined && (
              <FieldSlotValueInput
                value={value}
                spot={spot}
                field={declaration}
                onChange={(changed) => onChange(withRecordEntry(fields, name, changed))}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

/** `create`'s fields: `component.field` paths with values, added and removed freely. */
export function PathFieldValues({
  fields,
  file,
  spot,
  onChange,
}: {
  fields: FieldValues | undefined;
  file: ItemFile;
  spot: ValueSpot;
  onChange: (fields: FieldValues | undefined) => void;
}) {
  const startingPath = Object.entries(file.components).flatMap(([component, { fields: own }]) =>
    Object.keys(own).map((field) => `${component}.${field}`),
  )[0];
  return (
    <div className="step-field-rows">
      {Object.entries(fields ?? {}).map(([path, value]) => (
        <span key={path} className="step-field-row">
          <ComponentPathPicker
            value={path}
            file={file}
            onChange={(newPath) =>
              onChange(
                fields === undefined ? undefined : withRecordKeyRenamed(fields, path, newPath),
              )
            }
          />
          <FieldSlotValueInput
            value={value}
            spot={spot}
            field={findFieldDeclaration(file, path)}
            onChange={(changed) => onChange(withRecordEntry(fields, path, changed))}
          />
          <button
            className="icon-button"
            title="Remove this field"
            onClick={() => onChange(withRecordEntry(fields, path, undefined))}
          >
            ×
          </button>
        </span>
      ))}
      {startingPath !== undefined && !(fields !== undefined && startingPath in fields) && (
        <button
          className="icon-button add-button"
          onClick={() =>
            onChange(
              withRecordEntry(
                fields,
                startingPath,
                buildStartingFieldValue(findFieldDeclaration(file, startingPath)),
              ),
            )
          }
        >
          + field
        </button>
      )}
    </div>
  );
}
