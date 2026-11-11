import { ITEM_FORMS, RULE_LOCATIONS, type AppliesToRule, type ItemFile } from "@village/shared";
import { clientConfig } from "../client-config";
import { removeAt, replaceAt } from "./list-edits";
import {
  buildRuleOfKind,
  changeRuleKind,
  findRuleKind,
  isRuleGroup,
  listRuleParts,
  RULE_KIND_LABELS,
  RULE_KINDS,
  withRuleParts,
} from "./rule-edits";
import { listRuleMatches } from "./verb-edits";
import { Choice } from "./widgets";

function RuleTermValue({
  rule,
  file,
  onChange,
}: {
  rule: AppliesToRule;
  file: ItemFile;
  onChange: (rule: AppliesToRule) => void;
}) {
  if ("definition" in rule) {
    return (
      <Choice
        value={rule.definition}
        choices={file.definitions.map((definition) => definition.id)}
        onChange={(definition) => onChange({ definition })}
      />
    );
  }
  if ("component" in rule) {
    return (
      <Choice
        value={rule.component}
        choices={Object.keys(file.components)}
        onChange={(component) => onChange({ component })}
      />
    );
  }
  if ("property" in rule) {
    return (
      <Choice
        value={rule.property}
        choices={Object.keys(file.properties)}
        onChange={(property) => onChange({ property })}
      />
    );
  }
  if ("form" in rule) {
    return (
      <Choice value={rule.form} choices={ITEM_FORMS} onChange={(form) => onChange({ form })} />
    );
  }
  if ("location" in rule) {
    return (
      <Choice
        value={rule.location}
        choices={RULE_LOCATIONS}
        onChange={(location) => onChange({ location })}
      />
    );
  }
  return null;
}

/** One node of an `appliesTo` rule: a term, or a group whose parts are nodes too. */
function RuleNode({
  rule,
  file,
  onChange,
  onRemove,
}: {
  rule: AppliesToRule;
  file: ItemFile;
  onChange: (rule: AppliesToRule) => void;
  onRemove?: () => void;
}) {
  const parts = listRuleParts(rule);
  return (
    <div className="rule-node">
      <div className="effect-fields">
        <Choice
          value={findRuleKind(rule)}
          choices={RULE_KINDS}
          labels={RULE_KIND_LABELS}
          onChange={(kind) => onChange(changeRuleKind(rule, kind, file))}
        />
        <RuleTermValue rule={rule} file={file} onChange={onChange} />
        {onRemove && (
          <button className="icon-button" title="Remove this term" onClick={onRemove}>
            ×
          </button>
        )}
      </div>
      {"not" in rule && (
        <div className="rule-children">
          <RuleNode rule={rule.not} file={file} onChange={(not) => onChange({ not })} />
        </div>
      )}
      {isRuleGroup(rule) && (
        <div className="rule-children">
          {parts.map((part, index) => (
            <RuleNode
              key={index}
              rule={part}
              file={file}
              onChange={(changed) =>
                onChange(withRuleParts(rule, replaceAt(parts, index, changed)))
              }
              onRemove={() => onChange(withRuleParts(rule, removeAt(parts, index)))}
            />
          ))}
          <button
            className="icon-button add-button"
            onClick={() =>
              onChange(withRuleParts(rule, [...parts, buildRuleOfKind("definition", file)]))
            }
          >
            + term
          </button>
        </div>
      )}
    </div>
  );
}

/** Builds an `appliesTo` rule and lists, live, everything it matches. */
export function RuleBuilder({
  rule,
  file,
  onChange,
}: {
  rule: AppliesToRule;
  file: ItemFile;
  onChange: (rule: AppliesToRule) => void;
}) {
  const matches = listRuleMatches(file, rule);
  const { maxListedRuleMatches } = clientConfig.itemEditor;
  const listed = matches.slice(0, maxListedRuleMatches);
  const hiddenCount = matches.length - listed.length;
  return (
    <div className="rule-builder">
      <RuleNode rule={rule} file={file} onChange={onChange} />
      <p className="field-hint">
        Matches:{" "}
        {matches.length === 0
          ? "nothing"
          : `${listed.join(", ")}${hiddenCount > 0 ? ` and ${hiddenCount} more` : ""}`}
      </p>
    </div>
  );
}
