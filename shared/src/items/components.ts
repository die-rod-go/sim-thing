import type {
  ComponentDeclaration,
  ComponentDeclarations,
  ComponentPath,
  ComponentValues,
  FieldBound,
  FieldDeclaration,
  FieldValue,
} from "./component-schema";

/** A component on one thing, where it differs from the thing's definition. */
export interface ComponentInstance {
  /** Field values that differ from the definition's. */
  fields: ComponentValues;
  /** Null: lasts until removed. */
  endsAtTick: number | null;
  /** The agent behind whatever added it, for death causes. */
  sourceAgentId: string | null;
}

/** What differs from the definition: a changed or added component, or null for a removed one. */
export type ComponentChanges = Record<string, ComponentInstance | null>;

/** Component name to field name to value: what a thing has right now. */
export type ResolvedComponents = Readonly<Record<string, Readonly<ComponentValues>>>;

/** The part of a definition that components are resolved from. */
export interface ComponentSource {
  components: Readonly<Record<string, ComponentValues>>;
}

function fillDefaults(
  declaration: ComponentDeclaration | undefined,
  values: ComponentValues,
): ComponentValues {
  const filled: ComponentValues = {};
  for (const [fieldName, field] of Object.entries(declaration?.fields ?? {})) {
    if (field.default !== undefined) filled[fieldName] = field.default;
  }
  return { ...filled, ...values };
}

/**
 * The components a thing has right now: its definition's, each field filled from the definition
 * or the declaration's default, with its changes applied. A null change removes a component; an
 * instance adds it when the definition lacks it and overrides the fields it lists.
 */
export function resolveComponents(
  declarations: ComponentDeclarations,
  definition: ComponentSource,
  changes: ComponentChanges,
): ResolvedComponents {
  const resolved: Record<string, ComponentValues> = {};
  for (const [name, values] of Object.entries(definition.components)) {
    resolved[name] = fillDefaults(declarations[name], values);
  }
  for (const [name, change] of Object.entries(changes)) {
    if (change === null) delete resolved[name];
    else {
      const base = resolved[name] ?? fillDefaults(declarations[name], {});
      resolved[name] = { ...base, ...change.fields };
    }
  }
  return resolved;
}

export function isSameFieldValue(
  first: FieldValue | undefined,
  second: FieldValue | undefined,
): boolean {
  if (typeof first === "object" && typeof second === "object") {
    return first.min === second.min && first.max === second.max;
  }
  return first === second;
}

function resolveBound(
  bound: FieldBound | undefined,
  siblings: Readonly<ComponentValues>,
): number | null {
  if (bound === undefined) return null;
  if (typeof bound === "number") return bound;
  const sibling = siblings[bound];
  return typeof sibling === "number" ? sibling : null;
}

/** A number clamped to the field's `min` and `max`, read from `siblings` when they name a field. */
export function clampFieldValue(
  field: FieldDeclaration,
  value: FieldValue,
  siblings: Readonly<ComponentValues>,
): FieldValue {
  if (typeof value !== "number") return value;
  const min = resolveBound(field.min, siblings);
  const max = resolveBound(field.max, siblings);
  const raised = min === null ? value : Math.max(min, value);
  return max === null ? raised : Math.min(max, raised);
}

/** The value a field has before any change: the definition's, else the declaration's default. */
function readBaseValue(
  declarations: ComponentDeclarations,
  definition: ComponentSource,
  path: ComponentPath,
): FieldValue | undefined {
  return (
    definition.components[path.component]?.[path.field] ??
    declarations[path.component]?.fields[path.field]?.default
  );
}

function withoutComponent(changes: ComponentChanges, component: string): ComponentChanges {
  return Object.fromEntries(Object.entries(changes).filter(([name]) => name !== component));
}

/** Stores the instance, without the overrides and the entry that no longer differ from the definition. */
function storeInstance(
  declarations: ComponentDeclarations,
  definition: ComponentSource,
  changes: ComponentChanges,
  component: string,
  instance: ComponentInstance,
): ComponentChanges {
  const fields = Object.fromEntries(
    Object.entries(instance.fields).filter(
      ([field, value]) =>
        !isSameFieldValue(value, readBaseValue(declarations, definition, { component, field })),
    ),
  );
  const isAsDefined =
    Object.hasOwn(definition.components, component) &&
    Object.keys(fields).length === 0 &&
    instance.endsAtTick === null &&
    instance.sourceAgentId === null;
  const others = withoutComponent(changes, component);
  return isAsDefined ? others : { ...others, [component]: { ...instance, fields } };
}

const UNCHANGED_INSTANCE: ComponentInstance = { fields: {}, endsAtTick: null, sourceAgentId: null };

/**
 * The changes after writing one field: the value is clamped to the field's `min` and `max`, and an
 * override equal to the definition's value is dropped. The same object comes back when nothing
 * changes: the thing lacks the component, the component lacks the field, or the value is the same.
 */
export function writeFieldChange(
  declarations: ComponentDeclarations,
  definition: ComponentSource,
  changes: ComponentChanges,
  path: ComponentPath,
  value: FieldValue,
): ComponentChanges {
  const current = resolveComponents(declarations, definition, changes)[path.component];
  const field = declarations[path.component]?.fields[path.field];
  if (current === undefined || field === undefined) return changes;
  const clamped = clampFieldValue(field, value, current);
  if (isSameFieldValue(clamped, current[path.field])) return changes;
  const existing = changes[path.component] ?? UNCHANGED_INSTANCE;
  return storeInstance(declarations, definition, changes, path.component, {
    ...existing,
    fields: { ...existing.fields, [path.field]: clamped },
  });
}

function pickLaterEnd(first: number | null, second: number | null): number | null {
  return first === null || second === null ? null : Math.max(first, second);
}

export interface ComponentAddition {
  changes: ComponentChanges;
  /** False when the thing already had the component and it was only extended. */
  isNew: boolean;
}

/**
 * The changes after adding a component. One the thing already has keeps the later end (no end
 * beats any end) and takes the newer source and the given fields.
 */
export function addComponentChange(
  declarations: ComponentDeclarations,
  definition: ComponentSource,
  changes: ComponentChanges,
  component: string,
  added: ComponentInstance,
): ComponentAddition {
  const isPresent = Object.hasOwn(resolveComponents(declarations, definition, changes), component);
  if (!isPresent) {
    return {
      changes: storeInstance(declarations, definition, changes, component, added),
      isNew: true,
    };
  }
  const existing = changes[component] ?? UNCHANGED_INSTANCE;
  const extended: ComponentInstance = {
    fields: { ...existing.fields, ...added.fields },
    endsAtTick: pickLaterEnd(existing.endsAtTick, added.endsAtTick),
    sourceAgentId: added.sourceAgentId ?? existing.sourceAgentId,
  };
  return {
    changes: storeInstance(declarations, definition, changes, component, extended),
    isNew: false,
  };
}

/** The changes after removing a component: null when the definition has it, no entry otherwise. */
export function removeComponentChange(
  definition: ComponentSource,
  changes: ComponentChanges,
  component: string,
): ComponentChanges {
  const others = withoutComponent(changes, component);
  return Object.hasOwn(definition.components, component)
    ? { ...others, [component]: null }
    : others;
}

const VALUE_PLACEHOLDER = "{value}";

/** How a number field's value reads in prompts, or null when no entry matches. */
export function describeFieldValue(field: FieldDeclaration, value: FieldValue): string | null {
  if (typeof value !== "number") return null;
  const word = (field.words ?? []).find(
    (entry) => entry.below === undefined || value < entry.below,
  );
  return word ? word.text.split(VALUE_PLACEHOLDER).join(String(Math.floor(value))) : null;
}

/**
 * What a thing's components say about it in prompts: the `words` of each component that has them,
 * in declaration order, then the words of each number field that has them. With `isVisibleOnly`,
 * only the components agents who see the thing are told about.
 */
export function listComponentWords(
  declarations: ComponentDeclarations,
  components: ResolvedComponents,
  isVisibleOnly: boolean,
): string[] {
  const present = Object.entries(declarations).filter(([name]) => Object.hasOwn(components, name));
  const componentWords = present.flatMap(([, declaration]) =>
    declaration.words !== undefined && (declaration.isVisible || !isVisibleOnly)
      ? [declaration.words]
      : [],
  );
  const fieldWords = present.flatMap(([name, declaration]) =>
    Object.entries(declaration.fields).flatMap(([fieldName, field]) => {
      const value = components[name]?.[fieldName];
      const words = value === undefined ? null : describeFieldValue(field, value);
      return words === null ? [] : [words];
    }),
  );
  return [...componentWords, ...fieldWords];
}
