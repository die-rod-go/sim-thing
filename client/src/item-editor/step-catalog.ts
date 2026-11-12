import {
  STEP_TYPES,
  VERB_ONLY_STEPS,
  type ItemFile,
  type Matcher,
  type Step,
  type StepType,
} from "@village/shared";
import { clientConfig } from "../client-config";
import type { ValueSpot } from "./step-owner";

export const STEP_DESCRIPTIONS: Record<StepType, string> = {
  require: "Needs some things inside the user, the item or the target",
  use_up: "Needs some things inside the user, the item or the target, and destroys them",
  check: "Needs a thing to match, or refuses with a message",
  wait: "Takes time: what is above happens at the start, what is below at the end",
  sleep: "The user sleeps until woken or for some minutes",
  roll_hit: "Rolls to hit, adjusted by the agility of the user and the target",
  change: "Adds a number to a field",
  damage: "Subtracts a number from a field, optionally scaled by the user's strength",
  set: "Sets a field to a value",
  add: "Adds a component to a thing, for some minutes or until removed",
  remove: "Removes a component from a thing",
  move: "Moves a thing inside another, or onto the tile where another is",
  create: "Makes new things of an item",
  transform: "Turns a thing into another item where it is",
  destroy: "Removes a thing; what was inside it goes to where it was",
  send: "Sends a stimulus to a thing, firing the rules that react to it",
  sound: "Makes a sound where a thing is",
  announce: "Tells the world something happened to a thing",
  change_need: "Adds to a living agent's hunger, energy, social or fun",
  read: "The user remembers the text written in a field of a thing",
};

export const STEP_GROUPS: readonly { label: string; types: readonly StepType[] }[] = [
  { label: "Needing things", types: ["require", "use_up", "check"] },
  { label: "Taking time and chance", types: ["wait", "sleep", "roll_hit"] },
  { label: "Changing data", types: ["change", "damage", "set", "add", "remove"] },
  { label: "Things and places", types: ["move", "create", "transform", "destroy"] },
  {
    label: "Reaching the world and agents",
    types: ["send", "sound", "announce", "change_need", "read"],
  },
];

export function listAllowedStepTypes(ownerKind: "verb" | "rule"): StepType[] {
  return ownerKind === "verb"
    ? [...STEP_TYPES]
    : STEP_TYPES.filter((type) => !VERB_ONLY_STEPS.has(type));
}

function findFirstField(file: ItemFile, fieldType: string): string {
  for (const [componentName, component] of Object.entries(file.components)) {
    for (const [fieldName, declaration] of Object.entries(component.fields)) {
      if (declaration.type === fieldType) return `${componentName}.${fieldName}`;
    }
  }
  return `${Object.keys(file.components)[0] ?? "component"}.field`;
}

function findFirstComponent(file: ItemFile): string {
  return Object.keys(file.components)[0] ?? "component";
}

function findFirstDefinition(file: ItemFile): string {
  return file.definitions[0]?.id ?? "item";
}

/** The first role a verb has: `item` with `appliesTo`, else `target` with one, else `user`. */
function findStartingRole(spot: ValueSpot): string | undefined {
  if (spot.owner.kind === "rule") return undefined;
  const { verb } = spot.owner;
  if (verb.appliesTo !== undefined) return "item";
  return verb.target !== undefined ? "target" : "user";
}

function buildStartingMatcher(file: ItemFile): Matcher {
  return { has: findFirstComponent(file) };
}

export function buildNewStep(type: StepType, spot: ValueSpot): Step {
  const { file, owner } = spot;
  const role = findStartingRole(spot);
  const on = role === undefined ? {} : { on: role };
  const destination = owner.kind === "verb" ? { into: "user" } : { at: "self" };
  const config = clientConfig.itemEditor;
  switch (type) {
    case "require":
    case "use_up":
      return {
        step: type,
        in: "user",
        rule: buildStartingMatcher(file),
        count: config.newStepCount,
      };
    case "check":
      return {
        step: "check",
        ...on,
        if: buildStartingMatcher(file),
        otherwise: config.newTextValue,
      };
    case "wait":
      return { step: "wait", minutes: config.newStepMinutes };
    case "sleep":
      return { step: "sleep" };
    case "roll_hit":
      return { step: "roll_hit", chance: config.newStepChance };
    case "change":
      return {
        step: "change",
        ...on,
        field: findFirstField(file, "number"),
        by: config.newStepAmount,
      };
    case "damage":
      return {
        step: "damage",
        ...on,
        field: findFirstField(file, "number"),
        amount: config.newStepAmount,
      };
    case "set":
      return {
        step: "set",
        ...on,
        field: findFirstField(file, "number"),
        to: config.newStepAmount,
      };
    case "add":
    case "remove":
      return { step: type, ...on, component: findFirstComponent(file) };
    case "move":
      return { step: "move", ...on, ...destination };
    case "create":
      return {
        step: "create",
        item: findFirstDefinition(file),
        count: config.newStepCount,
        ...destination,
      };
    case "transform":
      return { step: "transform", ...on, into: findFirstDefinition(file) };
    case "destroy":
      return { step: "destroy", ...on };
    case "send":
      return { step: "send", ...on, stimulus: config.newTextValue };
    case "sound":
      return { step: "sound", ...on, loudness: config.newStepLoudness };
    case "announce":
      return { step: "announce", ...on, text: config.newTextValue, isPrivate: false };
    case "change_need":
      return {
        step: "change_need",
        ...on,
        need: "hunger",
        amount: config.newStepAmount,
      };
    case "read":
      return { step: "read", ...on, field: findFirstField(file, "text") };
  }
}
