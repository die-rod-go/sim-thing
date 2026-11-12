import { parseComponentPath, type FieldType, type ItemFile } from "@village/shared";
import type { ValueSpot } from "./step-owner";
import { listThingNames } from "./value-scope";
import { Choice } from "./widgets";

export function ComponentPicker({
  value,
  file,
  onChange,
}: {
  value: string;
  file: ItemFile;
  onChange: (component: string) => void;
}) {
  return <Choice value={value} choices={Object.keys(file.components)} onChange={onChange} />;
}

export function DefinitionPicker({
  value,
  file,
  onChange,
}: {
  value: string;
  file: ItemFile;
  onChange: (definitionId: string) => void;
}) {
  return (
    <Choice
      value={value}
      choices={file.definitions.map((definition) => definition.id)}
      onChange={onChange}
    />
  );
}

function listFieldNames(
  file: ItemFile,
  component: string,
  fieldTypes: readonly FieldType[] | undefined,
): string[] {
  return Object.entries(file.components[component]?.fields ?? {})
    .filter(([, field]) => fieldTypes === undefined || fieldTypes.includes(field.type))
    .map(([name]) => name);
}

/** `component.field` as two selects: the component, then one of its fields of the allowed types. */
export function ComponentPathPicker({
  value,
  file,
  onChange,
  fieldTypes,
}: {
  value: string;
  file: ItemFile;
  onChange: (path: string) => void;
  fieldTypes?: readonly FieldType[];
}) {
  const current = parseComponentPath(value);
  const components = Object.keys(file.components).filter(
    (component) => listFieldNames(file, component, fieldTypes).length > 0,
  );
  const fields = current === null ? [] : listFieldNames(file, current.component, fieldTypes);
  return (
    <span className="path-picker">
      <Choice
        value={current?.component ?? ""}
        choices={components}
        onChange={(component) => {
          const [first] = listFieldNames(file, component, fieldTypes);
          onChange(`${component}.${first ?? ""}`);
        }}
      />
      <Choice
        value={current?.field ?? ""}
        choices={fields}
        onChange={(field) => onChange(`${current?.component ?? ""}.${field}`)}
      />
    </span>
  );
}

const NO_NAME = "";

/** Who a step works on or a value reads, from what the spot knows. */
export function ThingNamePicker({
  value,
  spot,
  onChange,
  withNearby = false,
  emptyLabel,
}: {
  value: string | undefined;
  spot: ValueSpot;
  onChange: (name: string | undefined) => void;
  withNearby?: boolean;
  emptyLabel?: string;
}) {
  const choices = [
    ...(emptyLabel === undefined ? [] : [NO_NAME]),
    ...listThingNames(spot),
    ...(withNearby ? ["nearby"] : []),
  ];
  return (
    <Choice
      value={value ?? NO_NAME}
      choices={choices}
      labels={{ [NO_NAME]: emptyLabel }}
      onChange={(name) => onChange(name === NO_NAME ? undefined : name)}
    />
  );
}
