import {
  isValueRead,
  parseComponentPath,
  THING_WHERES,
  type FieldMatcher,
  type ItemFile,
  type Matcher,
} from "@village/shared";
import { NumberInput, TextInput } from "../characters/fields";
import { clientConfig } from "../client-config";
import {
  FIELD_COMPARISON_LABELS,
  findFieldComparison,
  listFieldComparisons,
  MATCHABLE_FIELD_TYPES,
  setFieldComparison,
  setFieldComparisonValue,
  setMatcherField,
  type FieldComparisonValue,
} from "./matcher-edits";
import { ComponentPathPicker, ComponentPicker, DefinitionPicker } from "./pickers";
import { Checkbox, Choice } from "./widgets";

function FieldComparisonInputs({
  matcher,
  file,
  onChange,
}: {
  matcher: FieldMatcher;
  file: ItemFile;
  onChange: (matcher: Matcher) => void;
}) {
  const path = parseComponentPath(matcher.field);
  const fieldType =
    path === null ? undefined : file.components[path.component]?.fields[path.field]?.type;
  const { comparison, value } = findFieldComparison(matcher);
  const setValue = (next: FieldComparisonValue) => onChange(setFieldComparisonValue(matcher, next));
  return (
    <>
      <ComponentPathPicker
        value={matcher.field}
        file={file}
        fieldTypes={MATCHABLE_FIELD_TYPES}
        onChange={(field) => onChange(setMatcherField(matcher, field, file))}
      />
      <Choice
        value={comparison}
        choices={listFieldComparisons(fieldType)}
        labels={FIELD_COMPARISON_LABELS}
        onChange={(next) => onChange(setFieldComparison(matcher, next))}
      />
      {isValueRead(value) && (
        <TextInput value={value.from} onChange={(from) => setValue({ from })} />
      )}
      {typeof value === "number" && (
        <NumberInput value={value} step={clientConfig.itemEditor.numberStep} onChange={setValue} />
      )}
      {typeof value === "boolean" && (
        <Checkbox label={value ? "yes" : "no"} checked={value} onChange={setValue} />
      )}
      {typeof value === "string" &&
        (fieldType === "item" ? (
          <DefinitionPicker value={value} file={file} onChange={setValue} />
        ) : (
          <TextInput value={value} onChange={setValue} />
        ))}
    </>
  );
}

/** The inputs of one matcher term; a group or `not` has none of its own. */
export function MatcherTermInputs({
  matcher,
  file,
  onChange,
}: {
  matcher: Matcher;
  file: ItemFile;
  onChange: (matcher: Matcher) => void;
}) {
  if ("has" in matcher) {
    return (
      <ComponentPicker value={matcher.has} file={file} onChange={(has) => onChange({ has })} />
    );
  }
  if ("definition" in matcher) {
    return (
      <DefinitionPicker
        value={matcher.definition}
        file={file}
        onChange={(definition) => onChange({ definition })}
      />
    );
  }
  if ("where" in matcher) {
    return (
      <Choice
        value={matcher.where}
        choices={THING_WHERES}
        onChange={(where) => onChange({ where })}
      />
    );
  }
  if ("field" in matcher) {
    return <FieldComparisonInputs matcher={matcher} file={file} onChange={onChange} />;
  }
  return null;
}
