import {
  parseComponentPath,
  type FieldDeclaration,
  type FieldValueInput,
  type ItemFile,
  type ItemProblem,
} from "@village/shared";
import { selectProblemsUnder } from "./problems";

/** Problems about one step; `steps.1` must not pick up `steps.10`. */
export function selectStepProblems(
  problems: readonly ItemProblem[],
  ownerPath: string,
  index: number,
): ItemProblem[] {
  return selectProblemsUnder(problems, `${ownerPath}.steps.${index}`);
}

export function findFieldDeclaration(file: ItemFile, path: string): FieldDeclaration | undefined {
  const parsed = parseComponentPath(path);
  return parsed === null ? undefined : file.components[parsed.component]?.fields[parsed.field];
}

/** A value of the right type for a field that has none yet. */
export function buildStartingFieldValue(
  declaration: FieldDeclaration | undefined,
): FieldValueInput {
  switch (declaration?.type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "range":
      return { min: 0, max: 0 };
    default:
      return "";
  }
}

/** The record with one entry set, or removed when `value` is undefined; undefined when it ends up empty. */
export function withRecordEntry(
  record: Readonly<Record<string, FieldValueInput>> | undefined,
  key: string,
  value: FieldValueInput | undefined,
): Record<string, FieldValueInput> | undefined {
  const entries = Object.entries(record ?? {});
  const isPresent = entries.some(([name]) => name === key);
  const changed: [string, FieldValueInput][] = [];
  for (const [name, current] of entries) {
    if (name !== key) changed.push([name, current]);
    else if (value !== undefined) changed.push([name, value]);
  }
  if (!isPresent && value !== undefined) changed.push([key, value]);
  return changed.length === 0 ? undefined : Object.fromEntries(changed);
}
/** The record with an entry's key changed, keeping its place. */
export function withRecordKeyRenamed(
  record: Readonly<Record<string, FieldValueInput>>,
  oldKey: string,
  newKey: string,
): Record<string, FieldValueInput> {
  return Object.fromEntries(
    Object.entries(record).map(([name, value]) => [name === oldKey ? newKey : name, value]),
  );
}
