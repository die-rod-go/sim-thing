import { THING_WHERES, type ItemFile, type Matcher } from "@village/shared";
import { clientConfig } from "../client-config";
import { removeAt, replaceAt } from "./list-edits";
import { MatcherInput } from "./MatcherInput";
import {
  buildMatcherOfKind,
  changeMatcherKind,
  findMatcherKind,
  isMatcherGroup,
  listMatcherParts,
  MATCHER_KIND_LABELS,
  MATCHER_KINDS,
  withMatcherParts,
} from "./rule-edits";
import { listAppliesToMatches } from "./verb-edits";
import { Checkbox, Choice } from "./widgets";

function MatcherTermValue({
  matcher,
  file,
  onChange,
}: {
  matcher: Matcher;
  file: ItemFile;
  onChange: (matcher: Matcher) => void;
}) {
  if ("definition" in matcher) {
    return (
      <Choice
        value={matcher.definition}
        choices={file.definitions.map((definition) => definition.id)}
        onChange={(definition) => onChange({ definition })}
      />
    );
  }
  if ("has" in matcher) {
    return (
      <Choice
        value={matcher.has}
        choices={Object.keys(file.components)}
        onChange={(has) => onChange({ has })}
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
  if ("field" in matcher) return <MatcherInput matcher={matcher} onChange={onChange} />;
  return null;
}

/** One node of an `appliesTo` matcher: a term, or a group whose parts are nodes too. */
function MatcherNode({
  matcher,
  file,
  onChange,
  onRemove,
}: {
  matcher: Matcher;
  file: ItemFile;
  onChange: (matcher: Matcher) => void;
  onRemove?: () => void;
}) {
  const parts = listMatcherParts(matcher);
  return (
    <div className="rule-node">
      <div className="effect-fields">
        <Choice
          value={findMatcherKind(matcher)}
          choices={MATCHER_KINDS}
          labels={MATCHER_KIND_LABELS}
          onChange={(kind) => onChange(changeMatcherKind(matcher, kind, file))}
        />
        <MatcherTermValue matcher={matcher} file={file} onChange={onChange} />
        {onRemove && (
          <button className="icon-button" title="Remove this term" onClick={onRemove}>
            ×
          </button>
        )}
      </div>
      {"not" in matcher && (
        <div className="rule-children">
          <MatcherNode matcher={matcher.not} file={file} onChange={(not) => onChange({ not })} />
        </div>
      )}
      {isMatcherGroup(matcher) && (
        <div className="rule-children">
          {parts.map((part, index) => (
            <MatcherNode
              key={index}
              matcher={part}
              file={file}
              onChange={(changed) =>
                onChange(withMatcherParts(matcher, replaceAt(parts, index, changed)))
              }
              onRemove={() => onChange(withMatcherParts(matcher, removeAt(parts, index)))}
            />
          ))}
          <button
            className="icon-button add-button"
            onClick={() =>
              onChange(
                withMatcherParts(matcher, [...parts, buildMatcherOfKind("definition", file)]),
              )
            }
          >
            + term
          </button>
        </div>
      )}
    </div>
  );
}

/** Builds an optional `appliesTo` matcher and lists, live, everything it matches. */
export function RuleBuilder({
  matcher,
  file,
  onChange,
}: {
  matcher: Matcher | undefined;
  file: ItemFile;
  onChange: (matcher: Matcher | undefined) => void;
}) {
  const matches = matcher === undefined ? [] : listAppliesToMatches(file, matcher);
  const { maxListedRuleMatches } = clientConfig.itemEditor;
  const listed = matches.slice(0, maxListedRuleMatches);
  const hiddenCount = matches.length - listed.length;
  return (
    <div className="rule-builder">
      <Checkbox
        label="bare-handed (no appliesTo)"
        checked={matcher === undefined}
        onChange={(isBareHanded) =>
          onChange(isBareHanded ? undefined : buildMatcherOfKind("definition", file))
        }
      />
      {matcher !== undefined && <MatcherNode matcher={matcher} file={file} onChange={onChange} />}
      <p className="field-hint">
        Matches:{" "}
        {matches.length === 0
          ? "nothing"
          : `${listed.join(", ")}${hiddenCount > 0 ? ` and ${hiddenCount} more` : ""}`}
      </p>
    </div>
  );
}
