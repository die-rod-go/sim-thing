import { listDefinitionViews, matchesThing, type ItemFile, type Matcher } from "@village/shared";
import { clientConfig } from "../client-config";
import { removeAt, replaceAt } from "./list-edits";
import { MatcherTermInputs } from "./MatcherTerm";
import {
  buildMatcherOfKind,
  changeMatcherKind,
  findMatcherKind,
  isMatcherGroup,
  listMatcherParts,
  MATCHER_KIND_LABELS,
  MATCHER_KINDS,
  withMatcherParts,
  type MatcherKind,
} from "./matcher-edits";
import { listAppliesToMatches } from "./verb-edits";
import { Checkbox, Choice } from "./widgets";

function listKindChoices(matcher: Matcher, allowsWhere: boolean): readonly MatcherKind[] {
  return MATCHER_KINDS.filter(
    (kind) => kind !== "where" || allowsWhere || findMatcherKind(matcher) === "where",
  );
}

interface MatcherNodeProps {
  matcher: Matcher;
  file: ItemFile;
  allowsWhere: boolean;
  onChange: (matcher: Matcher) => void;
  onRemove?: () => void;
}

/** One node of a matcher: a term, or a group or `not` whose parts are nodes too. */
function MatcherNode({ matcher, file, allowsWhere, onChange, onRemove }: MatcherNodeProps) {
  const parts = listMatcherParts(matcher);
  return (
    <div className="rule-node matcher-node">
      <div className="effect-fields">
        <Choice
          value={findMatcherKind(matcher)}
          choices={listKindChoices(matcher, allowsWhere)}
          labels={MATCHER_KIND_LABELS}
          onChange={(kind) => onChange(changeMatcherKind(matcher, kind, file))}
        />
        <MatcherTermInputs matcher={matcher} file={file} onChange={onChange} />
        {onRemove && (
          <button className="icon-button" title="Remove this term" onClick={onRemove}>
            ×
          </button>
        )}
      </div>
      {"not" in matcher && (
        <div className="rule-children">
          <MatcherNode
            matcher={matcher.not}
            file={file}
            allowsWhere={allowsWhere}
            onChange={(not) => onChange({ not })}
          />
        </div>
      )}
      {isMatcherGroup(matcher) && (
        <div className="rule-children">
          {parts.map((part, index) => (
            <MatcherNode
              key={index}
              matcher={part}
              file={file}
              allowsWhere={allowsWhere}
              onChange={(changed) =>
                onChange(withMatcherParts(matcher, replaceAt(parts, index, changed)))
              }
              onRemove={() => onChange(withMatcherParts(matcher, removeAt(parts, index)))}
            />
          ))}
          <button
            className="icon-button add-button"
            onClick={() =>
              onChange(withMatcherParts(matcher, [...parts, buildMatcherOfKind("has", file)]))
            }
          >
            + term
          </button>
        </div>
      )}
    </div>
  );
}

export function MatcherBuilder({
  matcher,
  file,
  onChange,
  allowsWhere,
}: {
  matcher: Matcher;
  file: ItemFile;
  onChange: (matcher: Matcher) => void;
  allowsWhere: boolean;
}) {
  return (
    <div className="matcher-builder">
      <MatcherNode matcher={matcher} file={file} allowsWhere={allowsWhere} onChange={onChange} />
    </div>
  );
}

function listDefinitionMatches(file: ItemFile, matcher: Matcher): string[] {
  return file.definitions
    .filter((definition) => {
      const [view] = listDefinitionViews(file, definition);
      return view !== undefined && matchesThing(matcher, { ...view, where: undefined });
    })
    .map((definition) => definition.id);
}

/** A live "Matches: knife (held), ..." line. */
export function MatcherMatches({
  matcher,
  file,
  allowsWhere,
}: {
  matcher: Matcher;
  file: ItemFile;
  allowsWhere: boolean;
}) {
  const matches = allowsWhere
    ? listAppliesToMatches(file, matcher)
    : listDefinitionMatches(file, matcher);
  const listed = matches.slice(0, clientConfig.itemEditor.maxListedRuleMatches);
  const hiddenCount = matches.length - listed.length;
  return (
    <p className="field-hint">
      Matches:{" "}
      {matches.length === 0
        ? "nothing"
        : `${listed.join(", ")}${hiddenCount > 0 ? ` and ${hiddenCount} more` : ""}`}
    </p>
  );
}

/** A matcher that may be left out: a checkbox for the empty case, the builder when it is set. */
export function OptionalMatcherBuilder({
  matcher,
  file,
  onChange,
  allowsWhere,
  emptyLabel,
  showsMatches = false,
}: {
  matcher: Matcher | undefined;
  file: ItemFile;
  onChange: (matcher: Matcher | undefined) => void;
  allowsWhere: boolean;
  emptyLabel: string;
  showsMatches?: boolean;
}) {
  return (
    <div className="matcher-builder">
      <Checkbox
        label={emptyLabel}
        checked={matcher === undefined}
        onChange={(isEmpty) => onChange(isEmpty ? undefined : buildMatcherOfKind("has", file))}
      />
      {matcher !== undefined && (
        <MatcherNode matcher={matcher} file={file} allowsWhere={allowsWhere} onChange={onChange} />
      )}
      {showsMatches && matcher !== undefined && (
        <MatcherMatches matcher={matcher} file={file} allowsWhere={allowsWhere} />
      )}
    </div>
  );
}
