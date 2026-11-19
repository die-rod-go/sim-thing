import type { DecisionAct, DecisionAction, Volume } from "@village/shared";
import { config } from "../config";
import { normalizeVerbName } from "../items/verb-offers";
import { listVerbsNamed } from "./interact-request-repair";
import type { WorldState } from "./world-state";

/** The acts a reply may wrongly name as an interact's verb ("wait", "walk to"). */
const ACTS_NAMED_AS_VERBS: readonly DecisionAction[] = [
  "walk_to",
  "give",
  "wait",
  "follow",
  "continue",
];

/** "walk_to", "Walk to" and "walk to" alike. */
function normalizeActName(name: string): string {
  return normalizeVerbName(name.split("_").join(" "));
}

function findActNamed(verbName: string): DecisionAction | undefined {
  const wanted = normalizeActName(verbName);
  return ACTS_NAMED_AS_VERBS.find((action) => normalizeActName(action) === wanted);
}

function findSpeechVerb(verbName: string): { name: string; volume?: Volume } | undefined {
  const wanted = normalizeVerbName(verbName);
  return config.decision.speechVerbs.find(
    (speechVerb) => normalizeVerbName(speechVerb.name) === wanted,
  );
}

/** Words said as a `say` act: its `say`, or its `text` when that is empty. */
function buildSayAct(act: DecisionAct, verbVolume: Volume | undefined): DecisionAct {
  const words = act.say?.trim() || act.text?.trim() || "";
  const volume = act.volume ?? verbVolume;
  return {
    action: "say",
    ...(words === "" ? {} : { say: words }),
    ...(volume === undefined ? {} : { volume }),
    ...(act.minutes === undefined ? {} : { minutes: act.minutes }),
  };
}

/** The interact's fields under the act it named; a walk's or follow's aim may sit in item. */
function buildNamedAct(act: DecisionAct, action: DecisionAction): DecisionAct {
  const isAimed = action === "walk_to" || action === "follow";
  const target = act.target ?? (isAimed ? act.item : undefined);
  const fields: DecisionAct = { ...act, action, ...(target === undefined ? {} : { target }) };
  delete fields.verb;
  return fields;
}

/**
 * An interact that meant something else, read as what it meant, when no verb in `items.json` has
 * the name it used: a way of talking ("speak", "whisper"), or no verb and no item with words to
 * say, is a `say`; another act's name ("wait", "continue", "follow") is that act.
 */
export function readInteractAsIntendedAct(state: WorldState, act: DecisionAct): DecisionAct {
  if (act.action !== "interact") return act;
  if (act.verb === undefined) {
    const hasWords = (act.say?.trim() ?? "") !== "";
    return hasWords && act.item === undefined ? buildSayAct(act, undefined) : act;
  }
  if (listVerbsNamed(state, act.verb).length > 0) return act;
  const speechVerb = findSpeechVerb(act.verb);
  if (speechVerb !== undefined) return buildSayAct(act, speechVerb.volume);
  const namedAction = findActNamed(act.verb);
  return namedAction === undefined ? act : buildNamedAct(act, namedAction);
}
